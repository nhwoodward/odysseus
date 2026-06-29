"""Regression test for finding M8: research report must not be injected as role=system.

A research report is built from fetched external web content + LLM synthesis, so it
is untrusted (may contain prompt-injection). The follow-up-session priming message
that carries the report must therefore be added with a NON-system role and wrapped in
an explicit reference-only boundary marker, so injected instructions inside scraped
content are treated as data rather than honored as system directives.

This test inspects the source of routes/research_routes.py rather than importing the
heavy FastAPI app, keeping it hermetic and dependency-free.
"""
import ast
import os

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(REPO_ROOT, "routes", "research_routes.py")


def _source():
    with open(TARGET, "r", encoding="utf-8") as fh:
        return fh.read()


def test_research_spinoff_message_is_not_system_role():
    """The research-spinoff ChatMessage must be constructed with role != 'system'."""
    src = _source()
    tree = ast.parse(src)

    spinoff_calls = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        name = getattr(func, "attr", None) or getattr(func, "id", None)
        if name != "ChatMessage":
            continue
        kwargs = {kw.arg: kw.value for kw in node.keywords if kw.arg}
        meta = kwargs.get("metadata")
        # Identify the spinoff message by its distinctive metadata key.
        meta_src = ast.dump(meta) if meta is not None else ""
        if "research_spinoff_from" in meta_src:
            spinoff_calls.append(kwargs)

    assert spinoff_calls, "Could not locate the research-spinoff ChatMessage construction"

    for kwargs in spinoff_calls:
        role_node = kwargs.get("role")
        assert isinstance(role_node, ast.Constant), "role must be a literal string"
        assert role_node.value != "system", (
            "Untrusted research report must NOT be injected as a role='system' "
            "message (it is highest-trust / treated as instructions)"
        )
        assert role_node.value in ("user", "assistant"), (
            f"research report role should be user/assistant, got {role_node.value!r}"
        )


def test_research_primer_has_reference_only_boundary():
    """The priming text must include an explicit external/reference-only boundary."""
    src = _source()
    lower = src.lower()
    assert "reference only" in lower, "primer must mark the report as reference-only"
    assert "not instructions" in lower, "primer must state the report is NOT instructions"
    assert "external source" in lower, "primer must flag the report as an external source"
