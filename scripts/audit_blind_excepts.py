#!/usr/bin/env python3
"""Ratchet guard against *blind* exception handlers — the root cause behind the
silent-failure class found in the June 2026 QA audit.

A handler is "blind" when it swallows an exception with no observability and no
recovery the reader can see: the body is just ``pass`` / ``...`` (optionally a
``return``/``continue``/``break`` with a bare literal) AND it never logs. Bare
``except:`` is always counted (it also eats KeyboardInterrupt/SystemExit).

The codebase already carries a large legacy backlog of these, so this is a
RATCHET, not a hard ban: it records a per-area baseline in
``scripts/blind_except_baseline.json`` and fails only when an area's count
*increases*. Reduce the baseline as you clean handlers up.

Usage:
    python3 scripts/audit_blind_excepts.py            # check against baseline
    python3 scripts/audit_blind_excepts.py --update   # rewrite the baseline
    python3 scripts/audit_blind_excepts.py --list      # print every finding
"""
from __future__ import annotations

import ast
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
# Production code only — tests legitimately swallow in fixtures/teardown.
AREAS = ["routes", "src", "core", "services", "mcp_servers", "companion"]
BASELINE = Path(__file__).resolve().parent / "blind_except_baseline.json"

_LOG_CALLS = {"debug", "info", "warning", "error", "exception", "critical", "log"}


def _body_logs(node: ast.ExceptHandler) -> bool:
    """True if the handler body contains any logging call or a raise."""
    for sub in ast.walk(node):
        if isinstance(sub, ast.Raise):
            return True
        if isinstance(sub, ast.Call):
            f = sub.func
            if isinstance(f, ast.Attribute) and f.attr in _LOG_CALLS:
                return True
            if isinstance(f, ast.Name) and f.id in _LOG_CALLS:
                return True
    return False


def _is_blind(node: ast.ExceptHandler) -> bool:
    if node.type is None:
        return True  # bare except: — always blind
    if _body_logs(node):
        return False
    # Body that does nothing observable: only pass / ... / bare flow-control.
    for stmt in node.body:
        if isinstance(stmt, ast.Pass):
            continue
        if isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Constant):
            continue  # docstring / ``...``
        if isinstance(stmt, (ast.Continue, ast.Break)):
            continue
        if isinstance(stmt, ast.Return) and (
            stmt.value is None
            or isinstance(stmt.value, ast.Constant)
            or (isinstance(stmt.value, (ast.List, ast.Dict, ast.Tuple)) and not getattr(stmt.value, "elts", None) and not getattr(stmt.value, "keys", None))
        ):
            continue  # return / return None/False/[]/{} — swallow-and-fake
        return False
    return True


def scan() -> tuple[dict[str, int], list[str]]:
    counts: dict[str, int] = {a: 0 for a in AREAS}
    findings: list[str] = []
    for area in AREAS:
        root = REPO / area
        if not root.exists():
            continue
        for py in sorted(root.rglob("*.py")):
            try:
                tree = ast.parse(py.read_text(encoding="utf-8"))
            except (SyntaxError, UnicodeDecodeError):
                continue
            for node in ast.walk(tree):
                if isinstance(node, ast.ExceptHandler) and _is_blind(node):
                    counts[area] += 1
                    findings.append(f"{py.relative_to(REPO)}:{node.lineno}")
    return counts, findings


def main() -> int:
    counts, findings = scan()
    total = sum(counts.values())

    if "--list" in sys.argv:
        for f in findings:
            print(f)
        print(f"\nTotal blind handlers: {total}")
        return 0

    if "--update" in sys.argv:
        BASELINE.write_text(json.dumps(counts, indent=2, sort_keys=True) + "\n")
        print(f"Baseline updated: {counts} (total {total})")
        return 0

    if not BASELINE.exists():
        print("No baseline yet; run with --update to create one.", file=sys.stderr)
        return 1

    base = json.loads(BASELINE.read_text())
    regressed = False
    for area in AREAS:
        cur, was = counts.get(area, 0), base.get(area, 0)
        if cur > was:
            regressed = True
            print(f"::error:: blind exception handlers in {area}/ rose {was} -> {cur}. "
                  f"Add a log/raise, or run --list to find them.", file=sys.stderr)
    if regressed:
        print("Blind-except ratchet failed. New silent swallows were introduced.", file=sys.stderr)
        return 1
    print(f"Blind-except ratchet OK ({total} total, within baseline).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
