"""Unit tests for plugins/local/skills/pr-review-engine/scripts/validate-findings.py.

Run: python3 -m unittest test.test_validate_findings
(or from inside test/: python3 -m unittest test_validate_findings)

No external dependencies — stdlib `unittest` only.
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = REPO_ROOT / "plugins" / "local" / "skills" / "pr-review-engine" / "scripts" / "validate-findings.py"


def _run(findings, changed_lines, repo_root=None, schema_only=False,
         line_tolerance=None, changed_lines_override=None):
    """Invoke validate-findings.py and return its parsed JSON output."""
    with tempfile.TemporaryDirectory() as td:
        td_path = Path(td)
        cl_path = td_path / "cl.json"
        if changed_lines_override is not None:
            cl_path.write_text(changed_lines_override)
        else:
            cl_path.write_text(json.dumps(changed_lines))

        args = [sys.executable, str(SCRIPT),
                "--changed-lines", str(cl_path),
                "--repo-root", str(repo_root or td_path)]
        if schema_only:
            args.append("--schema-only")
        if line_tolerance is not None:
            args.extend(["--line-tolerance", str(line_tolerance)])

        proc = subprocess.run(args, input=json.dumps(findings),
                              capture_output=True, text=True, check=False)
        if proc.returncode != 0:
            raise AssertionError(f"non-zero exit: {proc.stderr}")
        return json.loads(proc.stdout)


class ValidateFindingsTests(unittest.TestCase):

    def test_kept_finding_with_valid_schema_and_in_range_line(self):
        findings = [{"severity": "high", "file": "src/X.ts", "line": 10,
                     "description": "WHAT: thing. FIX: change."}]
        out = _run(findings, {"src/X.ts": [9, 10, 11]})
        self.assertEqual(len(out["kept"]), 1)
        self.assertEqual(out["counts"]["schema"], 0)

    def test_schema_fail_when_missing_what(self):
        findings = [{"severity": "high", "file": "src/X.ts", "line": 10,
                     "description": "FIX: change."}]
        out = _run(findings, {"src/X.ts": [10]})
        self.assertEqual(out["kept"], [])
        self.assertEqual(len(out["failed"]), 1)
        self.assertEqual(out["counts"]["schema"], 1)

    def test_schema_fail_when_missing_fix(self):
        findings = [{"severity": "high", "file": "src/X.ts", "line": 10,
                     "description": "WHAT: thing happened."}]
        out = _run(findings, {"src/X.ts": [10]})
        self.assertEqual(out["counts"]["schema"], 1)

    def test_drop_file_out_of_scope(self):
        findings = [{"severity": "medium", "file": "other/Y.ts", "line": 5,
                     "description": "WHAT: x. FIX: y."}]
        out = _run(findings, {"src/X.ts": [10]})
        self.assertEqual(out["kept"], [])
        self.assertEqual(len(out["dropped"]), 1)
        self.assertEqual(out["dropped"][0]["drop_reason"], "file-out-of-scope")

    def test_keep_at_plus_15_boundary(self):
        # distance = 15 exactly → kept (window is inclusive)
        findings = [{"severity": "low", "file": "src/X.ts", "line": 25,
                     "description": "WHAT: x. FIX: y."}]
        out = _run(findings, {"src/X.ts": [10]})
        self.assertEqual(len(out["kept"]), 1)

    def test_drop_at_plus_16_boundary(self):
        findings = [{"severity": "low", "file": "src/X.ts", "line": 26,
                     "description": "WHAT: x. FIX: y."}]
        out = _run(findings, {"src/X.ts": [10]})
        self.assertEqual(out["kept"], [])
        self.assertEqual(out["dropped"][0]["drop_reason"], "line-pre-existing")
        self.assertEqual(out["dropped"][0]["distance_to_nearest_changed_line"], 16)

    def test_pure_rename_empty_set_keeps_finding(self):
        # Empty CHANGED_LINES = pure rename → line filter short-circuits.
        findings = [{"severity": "medium", "file": "src/X.ts", "line": 999,
                     "description": "WHAT: x. FIX: y."}]
        out = _run(findings, {"src/X.ts": []})
        self.assertEqual(len(out["kept"]), 1)

    def test_path_normalization_strips_a_and_b_prefix(self):
        findings = [{"severity": "medium", "file": "b/src/X.ts", "line": 10,
                     "description": "WHAT: x. FIX: y."}]
        out = _run(findings, {"src/X.ts": [10]})
        self.assertEqual(len(out["kept"]), 1)

    def test_path_normalization_strips_absolute_repo_root_prefix(self):
        # Agents sometimes emit absolute paths; the script strips the
        # repo-root prefix via Path.relative_to(absroot).
        with tempfile.TemporaryDirectory() as td:
            root = Path(td).resolve()
            (root / "src").mkdir()
            absolute_path = str(root / "src" / "X.ts")
            findings = [{"severity": "medium", "file": absolute_path, "line": 10,
                         "description": "WHAT: x. FIX: y."}]
            out = _run(findings, {"src/X.ts": [10]}, repo_root=root)
            self.assertEqual(len(out["kept"]), 1)

    def test_absolute_path_outside_repo_root_is_dropped(self):
        # An absolute path that doesn't share the repo-root prefix falls
        # through to the file-out-of-scope path (the relative_to ValueError
        # branch).
        with tempfile.TemporaryDirectory() as outside_td, \
             tempfile.TemporaryDirectory() as root_td:
            stray = str(Path(outside_td) / "X.ts")
            findings = [{"severity": "medium", "file": stray, "line": 10,
                         "description": "WHAT: x. FIX: y."}]
            out = _run(findings, {"src/X.ts": [10]}, repo_root=Path(root_td))
            self.assertEqual(out["kept"], [])
            self.assertEqual(out["dropped"][0]["drop_reason"], "file-out-of-scope")

    def test_path_normalization_strips_dot_slash(self):
        findings = [{"severity": "medium", "file": "./src/X.ts", "line": 10,
                     "description": "WHAT: x. FIX: y."}]
        out = _run(findings, {"src/X.ts": [10]})
        self.assertEqual(len(out["kept"]), 1)

    def test_doc_example_drop_inside_backtick_fence(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / "docs.md").write_text(textwrap.dedent("""\
                # Example

                ```bash
                OPENAI_API_KEY=sk-not-a-real-secret-just-an-example
                ```
                """))
            findings = [{"severity": "critical", "file": "docs.md", "line": 4,
                         "description": "WHAT: hardcoded API key. FIX: move to env."}]
            out = _run(findings, {"docs.md": [4]}, repo_root=root)
            self.assertEqual(out["kept"], [])
            self.assertEqual(out["dropped"][0]["drop_reason"], "doc-example-fp")

    def test_doc_example_drop_inside_tilde_fence(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / "docs.md").write_text(textwrap.dedent("""\
                # Example

                ~~~
                secret = "abc123"
                ~~~
                """))
            findings = [{"severity": "high", "file": "docs.md", "line": 4,
                         "description": "WHAT: hardcoded secret. FIX: rotate."}]
            out = _run(findings, {"docs.md": [4]}, repo_root=root)
            self.assertEqual(out["kept"], [])
            self.assertEqual(out["dropped"][0]["drop_reason"], "doc-example-fp")

    def test_doc_example_kept_outside_fence(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / "docs.md").write_text("Hardcoded secret = abc123 (no fence).\n")
            findings = [{"severity": "high", "file": "docs.md", "line": 1,
                         "description": "WHAT: hardcoded secret. FIX: rotate."}]
            out = _run(findings, {"docs.md": [1]}, repo_root=root)
            self.assertEqual(len(out["kept"]), 1)

    def test_schema_only_mode_skips_scope_filter(self):
        findings = [{"severity": "low", "file": "other/Y.ts", "line": 1,
                     "description": "WHAT: x. FIX: y."}]
        out = _run(findings, {"src/X.ts": [10]}, schema_only=True)
        self.assertEqual(len(out["kept"]), 1)
        self.assertEqual(out["dropped"], [])

    def test_prose_wrapped_array_is_recovered(self):
        # Agents sometimes wrap their JSON array in narrative despite the
        # output contract (6 of 26 dogfood runs). The tolerant parser slices
        # from the first '[' to the last ']' so the findings still count.
        wrapped = ('Analysis complete. I verified everything carefully.\n\n'
                   '[{"severity": "high", "file": "src/X.ts", "line": 10, '
                   '"description": "WHAT: thing. FIX: change."}]\n\nDone.')
        with tempfile.TemporaryDirectory() as td:
            cl = Path(td) / "cl.json"
            cl.write_text(json.dumps({"src/X.ts": [10]}))
            proc = subprocess.run(
                [sys.executable, str(SCRIPT), "--changed-lines", str(cl),
                 "--repo-root", td],
                input=wrapped, capture_output=True, text=True, check=False,
            )
            out = json.loads(proc.stdout)
            self.assertEqual(len(out["kept"]), 1)
            self.assertEqual(out["counts"]["schema"], 0)

    def test_prose_wrapped_empty_array_is_recovered(self):
        wrapped = "All checks pass, nothing to report.\n\n[]\n"
        with tempfile.TemporaryDirectory() as td:
            cl = Path(td) / "cl.json"
            cl.write_text("{}")
            proc = subprocess.run(
                [sys.executable, str(SCRIPT), "--changed-lines", str(cl),
                 "--repo-root", td],
                input=wrapped, capture_output=True, text=True, check=False,
            )
            out = json.loads(proc.stdout)
            self.assertEqual(out["kept"], [])
            self.assertEqual(out["failed"], [])
            self.assertNotIn("error", out)

    def test_invalid_findings_json_returns_structured_error(self):
        with tempfile.TemporaryDirectory() as td:
            cl = Path(td) / "cl.json"
            cl.write_text("{}")
            proc = subprocess.run(
                [sys.executable, str(SCRIPT), "--changed-lines", str(cl)],
                input="not json at all",
                capture_output=True, text=True, check=False,
            )
            self.assertEqual(proc.returncode, 0)
            out = json.loads(proc.stdout)
            self.assertIn("error", out)
            self.assertIn("invalid findings JSON", out["error"])

    def test_invalid_changed_lines_json_returns_structured_error(self):
        out = _run(findings=[], changed_lines={},
                   changed_lines_override="not json at all")
        self.assertIn("error", out)
        self.assertIn("invalid changed-lines JSON", out["error"])

    def test_missing_findings_file_returns_structured_error(self):
        # F2 regression guard: --findings <missing> must return JSON, not crash.
        with tempfile.TemporaryDirectory() as td:
            cl = Path(td) / "cl.json"
            cl.write_text("{}")
            proc = subprocess.run(
                [sys.executable, str(SCRIPT),
                 "--findings", str(Path(td) / "does-not-exist.json"),
                 "--changed-lines", str(cl),
                 "--repo-root", td],
                capture_output=True, text=True, check=False,
            )
            self.assertEqual(proc.returncode, 0)
            out = json.loads(proc.stdout)
            self.assertIn("error", out)
            self.assertIn("cannot read findings file", out["error"])

    def test_missing_changed_lines_file_returns_structured_error(self):
        with tempfile.TemporaryDirectory() as td:
            proc = subprocess.run(
                [sys.executable, str(SCRIPT),
                 "--changed-lines", str(Path(td) / "does-not-exist.json"),
                 "--repo-root", td],
                input="[]",
                capture_output=True, text=True, check=False,
            )
            self.assertEqual(proc.returncode, 0)
            out = json.loads(proc.stdout)
            self.assertIn("error", out)
            self.assertIn("cannot read changed-lines file", out["error"])

    def test_runtime_sentinel_is_kept_and_bypasses_scope_filters(self):
        # runtime-validation emits file:"runtime", line:0 for findings with
        # no source location (dev-server boot failure, route-level console
        # error). The sentinel must pass the schema check AND bypass the
        # file/line scope filters.
        findings = [{"severity": "critical", "file": "runtime", "line": 0,
                     "description": "WHAT: /dashboard 500s on load. FIX: check the new loader."}]
        out = _run(findings, {"src/X.ts": [10]})
        self.assertEqual(len(out["kept"]), 1)
        self.assertEqual(out["counts"]["schema"], 0)
        self.assertEqual(out["dropped"], [])

    def test_runtime_sentinel_still_requires_what_fix_clauses(self):
        findings = [{"severity": "high", "file": "runtime", "line": 0,
                     "description": "the page looked broken"}]
        out = _run(findings, {"src/X.ts": [10]})
        self.assertEqual(out["kept"], [])
        self.assertEqual(out["counts"]["schema"], 1)

    def test_runtime_sentinel_negative_line_fails_schema(self):
        # The sentinel's line rule is `line >= 0` — a negative line is still
        # malformed even on file:"runtime".
        findings = [{"severity": "high", "file": "runtime", "line": -1,
                     "description": "WHAT: x. FIX: y."}]
        out = _run(findings, {"src/X.ts": [10]})
        self.assertEqual(out["kept"], [])
        self.assertEqual(out["counts"]["schema"], 1)

    def test_runtime_sentinel_positive_line_is_kept(self):
        # A positive line on the sentinel is valid too (agent pinned a line
        # but kept the runtime file label); it still bypasses scope filters.
        findings = [{"severity": "high", "file": "runtime", "line": 7,
                     "description": "WHAT: x. FIX: y."}]
        out = _run(findings, {"src/X.ts": [10]})
        self.assertEqual(len(out["kept"]), 1)
        self.assertEqual(out["dropped"], [])

    def test_zero_line_still_fails_schema_for_real_files(self):
        # line: 0 is only valid on the "runtime" sentinel, never on a path.
        findings = [{"severity": "high", "file": "src/X.ts", "line": 0,
                     "description": "WHAT: x. FIX: y."}]
        out = _run(findings, {"src/X.ts": [10]})
        self.assertEqual(out["kept"], [])
        self.assertEqual(out["counts"]["schema"], 1)

    def test_custom_line_tolerance(self):
        findings = [{"severity": "low", "file": "src/X.ts", "line": 30,
                     "description": "WHAT: x. FIX: y."}]
        out = _run(findings, {"src/X.ts": [10]}, line_tolerance=20)  # dist=20 within 20
        self.assertEqual(len(out["kept"]), 1)
        out = _run(findings, {"src/X.ts": [10]})  # dist=20, default tol=15
        self.assertEqual(out["kept"], [])


if __name__ == "__main__":
    unittest.main()
