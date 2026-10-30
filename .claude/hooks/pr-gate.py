#!/usr/bin/env python3
"""GoFish PR gate: a PreToolUse hook on Bash (wired up in .claude/settings.json).

It enforces two rules for pull requests opened by Claude in this repo:

1. PRs are always opened as drafts: `gh pr create` needs `--draft`/`-d`.
2. A PR may be marked ready for review (`gh pr ready` without `--undo`) only
   after both the `simplify` and `code-review` skills have run on THAT PR in
   the current session, after the last successful `gh pr ready` of that same
   PR. A skill run is a Skill tool call (its `args`) or the user typing the
   slash command (`<command-name>/simplify</command-name>` with its
   `<command-args>`); both are read from the session transcript. A run
   targets PR N when its args contain `#N`, the number N as a word, or the
   PR's head branch name.

`gh pr ready` must name its PR (a number, a URL or a branch). With no
argument it means the PR of the current branch, but the hook cannot tell
which branch that is: the command may `cd` into another worktree first, and
the hook runs in the session's directory. So it is denied, with a request to
name the PR. The hook asks `gh pr view` for the PR's number and head branch,
so a review that names either counts.

Fails open: any error exits 0 with no output.
"""
import json
import re
import shlex
import subprocess
import sys

PUNCTUATION = "();<>|&\n"
BODY_FLAGS = {"--body", "-b", "--body-file", "-F"}
BODY_SPLIT = re.compile(r"(?:^|\s)(?:%s)(?:\s|=|$)" % "|".join(
    re.escape(f) for f in sorted(BODY_FLAGS, key=len, reverse=True)))
# `gh pr ready` flags that take a value.
READY_VALUE_FLAGS = {"--repo", "-R"}
SKILLS = ("simplify", "code-review")
SKILL_RE = re.compile(r"^(?:[\w.-]+:)?(%s)$" % "|".join(SKILLS))
SLASH_RE = re.compile(r"<command-name>/(?:[\w.-]+:)?(%s)</command-name>" % "|".join(SKILLS))
SLASH_ARGS_RE = re.compile(r"<command-args>(.*?)</command-args>", re.S)
PR_URL_RE = re.compile(r"/pull/(\d+)")
GH_TIMEOUT_S = 6


def deny(reason):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": reason,
    }}))
    sys.exit(0)


def is_separator(tok):
    """A token made only of punctuation: `&&`, `;`, `|`, a newline, `(`, `>`, ..."""
    return tok != "" and not tok.strip(PUNCTUATION)


def shell_tokens(command):
    """Shell words and separators of command; raises ValueError on unbalanced quotes."""
    # Drop line continuations first, or the escaped newline would read as a separator.
    lex = shlex.shlex(command.replace("\\\n", ""), posix=True, punctuation_chars=PUNCTUATION)
    lex.whitespace = " \t\r"
    lex.whitespace_split = True
    lex.commenters = ""
    return list(lex)


def args_until_separator(tokens):
    args = []
    for tok in tokens:
        if is_separator(tok):
            break
        args.append(tok)
    return args


def subcommand_args(command, sub):
    """Yield the argument list of each `gh pr <sub>` invocation in command."""
    try:
        tokens = shell_tokens(command)
    except ValueError:
        # Unparseable (e.g. unbalanced quotes): use the text before any body flag.
        for m in re.finditer(r"\bgh\s+pr\s+" + sub + r"\b", command):
            yield args_until_separator(BODY_SPLIT.split(command[m.end():])[0].split())
        return
    for i in range(len(tokens) - 2):
        if tokens[i:i + 3] == ["gh", "pr", sub]:
            yield args_until_separator(tokens[i + 3:])


def has_flag(args, names):
    skip = False
    for tok in args:
        if skip:
            skip = False
            continue
        if tok in BODY_FLAGS:
            skip = True
            continue
        if tok in names:
            return True
    return False


def is_bash_create(command):
    return any(not has_flag(a, {"--draft", "-d"}) for a in subcommand_args(command, "create"))


def ready_target(args):
    """The PR a `gh pr ready` argument list names (number, URL or branch), or None."""
    skip = False
    for tok in args:
        if skip:
            skip = False
        elif tok in READY_VALUE_FLAGS:
            skip = True
        elif not tok.startswith("-"):
            return tok
    return None


def ready_targets(command):
    """The target (or None) of each `gh pr ready` in command that is not `--undo`."""
    return [ready_target(a) for a in subcommand_args(command, "ready")
            if not has_flag(a, {"--undo"})]


def target_number(target):
    """The PR number a target names directly (a number or a PR URL), or None."""
    if target.lstrip("#").isdigit():
        return target.lstrip("#")
    m = PR_URL_RE.search(target)
    return m.group(1) if m else None


def gh_pr_view(target):
    """(number, headRefName) of the PR target names, from `gh pr view`; None on failure."""
    try:
        out = subprocess.run(
            ["gh", "pr", "view", target, "--json", "number,headRefName"],
            capture_output=True, text=True, timeout=GH_TIMEOUT_S, check=True).stdout
        data = json.loads(out)
        return str(data["number"]), data["headRefName"]
    except Exception:
        return None


def pr_identity(target, view=gh_pr_view):
    """The PR's number and head branch: {"number": str|None, "branch": str|None}.

    Whatever `gh pr view` cannot supply stays as the target gives it: a
    number from a number or URL, else the target as a branch name.
    """
    number = target_number(target)
    ident = {"number": number, "branch": None if number else target}
    viewed = view(target)
    if viewed:
        ident = {"number": viewed[0], "branch": viewed[1]}
    return ident


def names_pr(text, ident):
    """Whether text (a skill run's args) names the PR: #N, N as a word, or its branch."""
    number, branch = ident.get("number"), ident.get("branch")
    if number and re.search(r"\b%s\b" % re.escape(number), text):
        return True
    return bool(branch) and re.search(
        r"(?<![\w./-])%s(?![\w./-])" % re.escape(branch), text) is not None


def is_same_pr(target, ident):
    """Whether a `gh pr ready` target from the transcript names the PR."""
    if target is None:
        return False
    number = target_number(target)
    if number is not None:
        return number == ident.get("number")
    return target == ident.get("branch")


def missing_skills(transcript_path, ident):
    """Skills not run on the PR since its last successful `gh pr ready` in the transcript."""
    last_skill = {}  # skill -> last line number
    last_ready = -1
    pending = {}  # tool_use_id -> (skill name or "ready", line number)
    with open(transcript_path, encoding="utf-8", errors="replace") as fh:
        for i, line in enumerate(fh):
            try:
                entry = json.loads(line)
            except ValueError:
                continue
            msg = entry.get("message")
            if not isinstance(msg, dict):
                continue
            content = msg.get("content")
            role = msg.get("role") or entry.get("type")
            if isinstance(content, str):
                content = [{"type": "text", "text": content}]
            if not isinstance(content, list):
                continue
            for block in content:
                if not isinstance(block, dict):
                    continue
                btype = block.get("type")
                if role == "assistant" and btype == "tool_use":
                    name = block.get("name", "")
                    inp = block.get("input") or {}
                    if name == "Skill":
                        m = SKILL_RE.match(str(inp.get("skill", "")))
                        if m and names_pr(str(inp.get("args", "")), ident):
                            pending[block.get("id")] = (m.group(1), i)
                    elif name == "Bash" and any(
                            is_same_pr(t, ident)
                            for t in ready_targets(str(inp.get("command", "")))):
                        pending[block.get("id")] = ("ready", i)
                elif role == "user" and btype == "text":
                    text = str(block.get("text", ""))
                    args = SLASH_ARGS_RE.search(text)
                    if args and names_pr(args.group(1), ident):
                        for m in SLASH_RE.finditer(text):
                            last_skill[m.group(1)] = i
                elif role == "user" and btype == "tool_result":
                    # A skill run or mark-ready counts only once its result is in and
                    # is not an error, so the pending call (whose tool_use may already
                    # be in the transcript) is ignored.
                    use = pending.pop(block.get("tool_use_id"), None)
                    if use and not block.get("is_error"):
                        kind, ln = use
                        if kind == "ready":
                            last_ready = max(last_ready, ln)
                        else:
                            last_skill[kind] = max(last_skill.get(kind, -1), ln)
    return [s for s in SKILLS if last_skill.get(s, -1) <= last_ready]


def check_ready(payload, targets, view=gh_pr_view):
    for target in targets:
        if target is None:
            deny("Name the PR explicitly: `gh pr ready <number>`. The gate checks "
                 "that /simplify and /code-review ran on that PR.")
        ident = pr_identity(target, view)
        missing = missing_skills(payload["transcript_path"], ident)
        if missing:
            label = "#" + ident["number"] if ident.get("number") else ident.get("branch")
            deny("Before marking %s ready, run /simplify and /code-review on it, naming "
                 "the PR (#N) or its branch in their arguments (missing: %s), then retry "
                 "`gh pr ready`." % (label, ", ".join(missing)))


def main():
    payload = json.load(sys.stdin)
    command = str((payload.get("tool_input") or {}).get("command", ""))
    if "gh pr" not in command:
        return
    if is_bash_create(command):
        deny("PRs must be opened as drafts: re-run with --draft.")
    targets = ready_targets(command)
    if targets:
        check_ready(payload, targets)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
