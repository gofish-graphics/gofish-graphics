#!/usr/bin/env python3
"""GoFish PR gate: a PreToolUse hook (wired up in .claude/settings.json).

It enforces two rules for pull requests opened by Claude in this repo:

1. PRs are always opened as drafts: `gh pr create` needs `--draft`/`-d`, and a
   GitHub MCP create_pull_request call needs draft=true.
2. A PR may be marked ready for review (`gh pr ready` without `--undo`, or a
   GitHub MCP call that marks a PR ready) only after both the `simplify` and
   `code-review` skills have run in the current session, after the last
   successful mark-ready. A skill run is a Skill tool call or the user typing
   the slash command; both are read from the session transcript.

Fails open: any error exits 0 with no output (the draft check needs no
transcript, so it still applies when the transcript is missing).
"""
import json
import re
import shlex
import sys

SEPARATORS = {"&&", "||", ";", "|", "&", ";;", "<<", "<<<", ">", ">>", "(", ")"}
BODY_FLAGS = {"--body", "-b", "--body-file", "-F"}
GITHUB_MCP = re.compile(r"^mcp__.*github.*__")
SKILL_RE = re.compile(r"^(?:[\w.-]+:)?(simplify|code-review)$")
SLASH_RE = re.compile(r"<command-name>/(?:[\w.-]+:)?(simplify|code-review)</command-name>")
SKILLS = ("simplify", "code-review")


def deny(reason):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": reason,
    }}))
    sys.exit(0)


def subcommand_args(command, sub):
    """Yield the argument list of each `gh pr <sub>` invocation in command."""
    for m in re.finditer(r"\bgh\s+pr\s+" + sub + r"\b", command):
        tail = command[m.end():]
        try:
            lex = shlex.shlex(tail, posix=True, punctuation_chars=True)
            lex.whitespace_split = True
            tokens = list(lex)
        except ValueError:
            # Unparseable (e.g. unbalanced quotes): use the text before any body flag.
            head = re.split(r"(?:^|\s)(?:--body-file|--body|-b|-F)(?:\s|=|$)", tail)[0]
            tokens = head.split()
        args = []
        for tok in tokens:
            if tok in SEPARATORS:
                break
            args.append(tok)
        yield args


def has_flag(args, names):
    skip = False
    for tok in args:
        if skip:
            skip = False
            continue
        if tok in BODY_FLAGS:
            skip = True
            continue
        if tok in names or any(tok.startswith(n + "=") for n in names if n.startswith("--")):
            if tok.endswith("=false"):
                continue
            return True
    return False


def is_bash_create(command):
    return any(not has_flag(a, {"--draft", "-d"}) for a in subcommand_args(command, "create"))


def is_bash_ready(command):
    return any(not has_flag(a, {"--undo"}) for a in subcommand_args(command, "ready"))


def is_mcp_ready(name, tool_input):
    if not GITHUB_MCP.match(name or ""):
        return False
    action = name.rsplit("__", 1)[-1]
    if "ready" in action:
        return True
    return action == "update_pull_request" and tool_input.get("draft") is False


def is_ready_call(name, tool_input):
    if name == "Bash":
        return is_bash_ready(str(tool_input.get("command", "")))
    return is_mcp_ready(name, tool_input)


def missing_skills(transcript_path):
    """Skills not run since the last successful mark-ready in the transcript."""
    skill_lines = {s: [] for s in SKILLS}
    ready_uses = {}  # tool_use_id -> line number
    results = {}  # tool_use_id -> is_error
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
                        if m:
                            skill_lines[m.group(1)].append(i)
                    elif is_ready_call(name, inp):
                        ready_uses[block.get("id")] = i
                elif role == "user" and btype == "text":
                    for m in SLASH_RE.finditer(str(block.get("text", ""))):
                        skill_lines[m.group(1)].append(i)
                elif role == "user" and btype == "tool_result":
                    results[block.get("tool_use_id")] = bool(block.get("is_error"))
    # A mark-ready counts only once its result is in and is not an error, so the
    # pending call (whose tool_use may already be in the transcript) is ignored.
    done = [ln for uid, ln in ready_uses.items() if uid in results and not results[uid]]
    last_ready = max(done, default=-1)
    return [s for s in SKILLS if not any(ln > last_ready for ln in skill_lines[s])]


def check_ready(payload):
    path = payload.get("transcript_path")
    if not path:
        return
    try:
        missing = missing_skills(path)
    except Exception:
        return
    if missing:
        deny("Before marking ready, run /simplify and /code-review on this branch "
             "(missing: %s), then retry `gh pr ready`." % ", ".join(missing))


def main():
    payload = json.load(sys.stdin)
    name = payload.get("tool_name", "")
    tool_input = payload.get("tool_input") or {}
    draft_reason = "PRs must be opened as drafts: re-run with --draft."
    if name == "Bash":
        command = str(tool_input.get("command", ""))
        if "gh" not in command:
            return
        if is_bash_create(command):
            deny(draft_reason)
        if is_bash_ready(command):
            check_ready(payload)
    elif GITHUB_MCP.match(name):
        if name.endswith("__create_pull_request") and tool_input.get("draft") is not True:
            deny(draft_reason)
        if is_mcp_ready(name, tool_input):
            check_ready(payload)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        pass
    sys.exit(0)
