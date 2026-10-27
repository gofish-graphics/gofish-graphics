#!/usr/bin/env python3
"""GoFish PR gate: a PreToolUse hook on Bash (wired up in .claude/settings.json).

It enforces two rules for pull requests opened by Claude in this repo:

1. PRs are always opened as drafts: `gh pr create` needs `--draft`/`-d`.
2. A PR may be marked ready for review (`gh pr ready` without `--undo`) only
   after both the `simplify` and `code-review` skills have run in the current
   session, after the last successful `gh pr ready`. A skill run is a Skill
   tool call or the user typing the slash command; both are read from the
   session transcript.

Fails open: any error exits 0 with no output.
"""
import json
import re
import shlex
import sys

SEPARATORS = {"&&", "||", ";", "|", "&", ";;", "<<", "<<<", ">", ">>", "(", ")"}
BODY_FLAGS = {"--body", "-b", "--body-file", "-F"}
BODY_SPLIT = re.compile(r"(?:^|\s)(?:%s)(?:\s|=|$)" % "|".join(
    re.escape(f) for f in sorted(BODY_FLAGS, key=len, reverse=True)))
SKILLS = ("simplify", "code-review")
SKILL_RE = re.compile(r"^(?:[\w.-]+:)?(%s)$" % "|".join(SKILLS))
SLASH_RE = re.compile(r"<command-name>/(?:[\w.-]+:)?(%s)</command-name>" % "|".join(SKILLS))


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
            tokens = BODY_SPLIT.split(tail)[0].split()
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
        if tok in names:
            return True
    return False


def is_bash_create(command):
    return any(not has_flag(a, {"--draft", "-d"}) for a in subcommand_args(command, "create"))


def is_bash_ready(command):
    return any(not has_flag(a, {"--undo"}) for a in subcommand_args(command, "ready"))


def missing_skills(transcript_path):
    """Skills not run since the last successful `gh pr ready` in the transcript."""
    last_skill = {}  # skill -> last line number
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
                            last_skill[m.group(1)] = i
                    elif name == "Bash" and is_bash_ready(str(inp.get("command", ""))):
                        ready_uses[block.get("id")] = i
                elif role == "user" and btype == "text":
                    for m in SLASH_RE.finditer(str(block.get("text", ""))):
                        last_skill[m.group(1)] = i
                elif role == "user" and btype == "tool_result":
                    results[block.get("tool_use_id")] = bool(block.get("is_error"))
    # A mark-ready counts only once its result is in and is not an error, so the
    # pending call (whose tool_use may already be in the transcript) is ignored.
    done = [ln for uid, ln in ready_uses.items() if uid in results and not results[uid]]
    last_ready = max(done, default=-1)
    return [s for s in SKILLS if last_skill.get(s, -1) <= last_ready]


def check_ready(payload):
    missing = missing_skills(payload["transcript_path"])
    if missing:
        deny("Before marking ready, run /simplify and /code-review on this branch "
             "(missing: %s), then retry `gh pr ready`." % ", ".join(missing))


def main():
    payload = json.load(sys.stdin)
    command = str((payload.get("tool_input") or {}).get("command", ""))
    if "gh pr" not in command:
        return
    if is_bash_create(command):
        deny("PRs must be opened as drafts: re-run with --draft.")
    if is_bash_ready(command):
        check_ready(payload)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
