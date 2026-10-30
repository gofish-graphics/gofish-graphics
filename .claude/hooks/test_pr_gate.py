#!/usr/bin/env python3
"""Tests for pr-gate.py on synthetic transcripts. Run: python3 .claude/hooks/test_pr_gate.py"""
import contextlib
import importlib.util
import io
import json
import os
import tempfile
import unittest

spec = importlib.util.spec_from_file_location(
    "pr_gate", os.path.join(os.path.dirname(os.path.abspath(__file__)), "pr-gate.py"))
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)

PRS = {"1261": ("1261", "visual-review-warnings"),
       "visual-review-warnings": ("1261", "visual-review-warnings"),
       "1220": ("1220", "worktree-layout-engine-1176")}


def view(target):
    """A stand-in for `gh pr view`."""
    return PRS.get(gate.target_number(target) or target)


class Transcript:
    """Builds a transcript, one JSON entry per line, as Claude Code writes them."""

    def __init__(self):
        self.lines = []
        self.n = 0

    def _tool(self, name, inp, error=False):
        self.n += 1
        tid = "toolu_%d" % self.n
        self.lines.append({"type": "assistant", "message": {"role": "assistant", "content": [
            {"type": "tool_use", "id": tid, "name": name, "input": inp}]}})
        self.lines.append({"type": "user", "message": {"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": tid, "is_error": error, "content": "ok"}]}})
        return self

    def skill(self, name, args=""):
        return self._tool("Skill", {"skill": name, "args": args})

    def bash(self, command, error=False):
        return self._tool("Bash", {"command": command}, error)

    def slash(self, name, args):
        self.lines.append({"type": "user", "message": {"role": "user", "content":
            "<command-message>%s</command-message>\n<command-name>/%s</command-name>\n"
            "<command-args>%s</command-args>" % (name, name, args)}})
        return self

    def write(self):
        f = tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False)
        for line in self.lines:
            f.write(json.dumps(line) + "\n")
        f.close()
        return f.name


def decide(transcript, command):
    """The hook's decision for command: "allow" or the deny reason."""
    payload = {"transcript_path": transcript.write(), "tool_input": {"command": command}}
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        try:
            targets = gate.ready_targets(command)
            if targets:
                gate.check_ready(payload, targets, view)
        except SystemExit:
            pass
    os.unlink(payload["transcript_path"])
    text = out.getvalue()
    return json.loads(text)["hookSpecificOutput"]["permissionDecisionReason"] if text else "allow"


class GateTest(unittest.TestCase):
    def test_review_for_another_pr_does_not_count(self):
        t = (Transcript().skill("simplify", "Scope: draft PR #1220")
             .skill("code-review", "high 1220"))
        self.assertIn("missing: simplify, code-review", decide(t, "gh pr ready 1261"))
        self.assertEqual(decide(t, "gh pr ready 1220"), "allow")

    def test_review_naming_number_counts(self):
        t = Transcript().skill("simplify", "PR #1261 diff").skill("code-review", "high 1261")
        self.assertEqual(decide(t, "gh pr ready 1261"), "allow")
        self.assertEqual(decide(t, "gh pr ready #1261"), "allow")
        self.assertEqual(decide(
            t, "gh pr ready https://github.com/o/r/pull/1261"), "allow")

    def test_review_naming_branch_counts(self):
        t = (Transcript().skill("simplify", "branch visual-review-warnings")
             .skill("code-review", "high visual-review-warnings"))
        self.assertEqual(decide(t, "gh pr ready 1261"), "allow")
        self.assertEqual(decide(t, "gh pr ready visual-review-warnings"), "allow")
        # A longer branch name that contains it is another branch.
        t2 = (Transcript().skill("simplify", "visual-review-warnings-2")
              .skill("code-review", "visual-review-warnings-2"))
        self.assertIn("missing", decide(t2, "gh pr ready 1261"))

    def test_ready_then_undo(self):
        t = (Transcript().skill("simplify", "#1261").skill("code-review", "#1261")
             .bash("gh pr ready 1261").bash("gh pr ready 1261 --undo"))
        # The reviews were spent on the first ready; undo does not give them back.
        self.assertIn("missing", decide(t, "gh pr ready 1261"))
        # A ready of another PR is not a reset for this one.
        t2 = (Transcript().skill("simplify", "#1261").skill("code-review", "#1261")
              .bash("gh pr ready 1220"))
        self.assertEqual(decide(t2, "gh pr ready 1261"), "allow")
        # A failed ready is not a reset either.
        t3 = (Transcript().skill("simplify", "#1261").skill("code-review", "#1261")
              .bash("gh pr ready 1261", error=True))
        self.assertEqual(decide(t3, "gh pr ready 1261"), "allow")
        # New reviews after the ready count again.
        t.skill("simplify", "#1261").skill("code-review", "#1261")
        self.assertEqual(decide(t, "gh pr ready 1261"), "allow")

    def test_slash_command_with_args(self):
        t = Transcript().slash("simplify", "PR #1261").slash("code-review", "high 1261")
        self.assertEqual(decide(t, "gh pr ready 1261"), "allow")
        t2 = Transcript().slash("simplify", "PR #1220").slash("code-review", "high 1220")
        self.assertIn("missing", decide(t2, "gh pr ready 1261"))

    def test_no_argument_is_denied(self):
        t = Transcript().skill("simplify", "#1261").skill("code-review", "#1261")
        self.assertIn("Name the PR explicitly", decide(t, "gh pr ready"))
        self.assertIn("Name the PR explicitly", decide(t, "gh pr ready -R o/r"))

    def test_undo_and_other_commands_pass(self):
        self.assertEqual(decide(Transcript(), "gh pr ready 1261 --undo"), "allow")
        self.assertEqual(decide(Transcript(), "gh pr view 1261"), "allow")

    def test_gh_failure_falls_back_to_target(self):
        t = Transcript().skill("simplify", "#77").skill("code-review", "77")
        payload = {"transcript_path": t.write()}
        ident = gate.pr_identity("77", view=lambda _t: None)
        self.assertEqual(ident, {"number": "77", "branch": None})
        self.assertEqual(gate.missing_skills(payload["transcript_path"], ident), [])
        os.unlink(payload["transcript_path"])


if __name__ == "__main__":
    unittest.main()
