"""Tests for context_compactor.py — constants and prompt templates.
Uses mock imports to avoid loading the full app stack."""

import asyncio
import sys
from unittest.mock import MagicMock

import pytest

# Mock heavy dependencies before importing
for mod in [
    'sqlalchemy', 'sqlalchemy.orm', 'sqlalchemy.ext', 'sqlalchemy.ext.declarative',
    'sqlalchemy.ext.hybrid', 'sqlalchemy.sql', 'sqlalchemy.sql.expression',
    'src.database',
    'core.models', 'core.database',
]:
    if mod not in sys.modules:
        sys.modules[mod] = MagicMock()

import src.context_compactor as cc
from src.context_compactor import (
    COMPACT_THRESHOLD,
    SELF_SUMMARY_SYSTEM_PROMPT,
    SUMMARY_MAX_TOKENS,
    _content_as_text,
    maybe_compact,
    trim_for_context,
)


class TestCompactThreshold:
    def test_value(self):
        assert COMPACT_THRESHOLD == 0.85

    def test_summary_max_tokens(self):
        assert SUMMARY_MAX_TOKENS == 1024


class TestSelfSummaryPrompt:
    def test_contains_goal_section(self):
        assert "### User Goal" in SELF_SUMMARY_SYSTEM_PROMPT

    def test_contains_what_was_done_section(self):
        assert "### What Was Done" in SELF_SUMMARY_SYSTEM_PROMPT

    def test_contains_current_state_section(self):
        assert "### Current State" in SELF_SUMMARY_SYSTEM_PROMPT

    def test_contains_pending_section(self):
        assert "### Pending / Next Steps" in SELF_SUMMARY_SYSTEM_PROMPT

    def test_contains_key_context_section(self):
        assert "### Key Context" in SELF_SUMMARY_SYSTEM_PROMPT

    def test_count_placeholder(self):
        assert "{count}" in SELF_SUMMARY_SYSTEM_PROMPT

    def test_n_placeholder(self):
        assert "{n}" in SELF_SUMMARY_SYSTEM_PROMPT

    def test_mentions_compactions(self):
        assert "Compactions so far" in SELF_SUMMARY_SYSTEM_PROMPT


class TestTrimForContext:
    def test_keeps_current_large_user_message_by_truncating(self):
        huge = "A" * 20000
        messages = [
            {"role": "system", "content": "You are helpful."},
            {"role": "user", "content": huge},
        ]

        trimmed = trim_for_context(messages, context_length=2048, reserve_tokens=512)

        user_msgs = [m for m in trimmed if m.get("role") == "user"]
        assert len(user_msgs) == 1
        content = user_msgs[0]["content"]
        assert "pasted message was too large" in content
        assert content.startswith("A")
        assert len(content) < len(huge)

    def test_drops_older_messages_before_latest_user_paste(self):
        huge = "B" * 12000
        messages = [{"role": "system", "content": "You are helpful."}]
        messages.extend({"role": "user", "content": f"old-{i} " + ("x" * 1000)} for i in range(8))
        messages.append({"role": "user", "content": huge})

        trimmed = trim_for_context(messages, context_length=2048, reserve_tokens=512)

        assert trimmed[-1]["role"] == "user"
        assert "pasted message was too large" in trimmed[-1]["content"]
        assert "old-0" not in "\n".join(str(m.get("content", "")) for m in trimmed)


class TestContentAsText:
    def test_string_passthrough(self):
        assert _content_as_text("hello") == "hello"

    def test_none_returns_empty(self):
        # Assistant turns that carried only native tool_calls persist
        # content as None — flattening must not raise.
        assert _content_as_text(None) == ""

    def test_list_content_joins_text_blocks(self):
        content = [
            {"type": "text", "text": "describe this"},
            {"type": "image_url", "image_url": {"url": "data:..."}},
        ]
        assert _content_as_text(content) == "describe this"

    def test_unknown_type_returns_empty(self):
        assert _content_as_text(42) == ""


class TestMaybeCompactFourthMessage:
    """Regression: a multi-message conversation must not crash compaction when
    a prior assistant turn used native tool_calls (content == None). This was
    the '4th message stops working' bug — on a small-context model the soft
    85% threshold is crossed after a few turns, and the older half being
    summarized contained a None-content assistant message, which raised
    TypeError: 'NoneType' object is not subscriptable and broke the request."""

    def _run(self, messages, *, context_length=500):
        # Force compaction to trigger and stub the summary LLM call so the test
        # is hermetic (no network, no real endpoint resolution).
        orig_ctx = cc.get_context_length
        orig_call = cc.llm_call_async
        orig_resolve = cc.resolve_endpoint
        orig_update = cc._update_session_history

        async def _fake_summary(*a, **k):
            return "compact summary text"

        cc.get_context_length = lambda url, model: context_length
        cc.llm_call_async = _fake_summary
        cc.resolve_endpoint = lambda which, owner=None: (None, None, None)
        cc._update_session_history = lambda *a, **k: None
        try:
            return asyncio.run(
                maybe_compact(
                    session=None,
                    endpoint_url="http://local/v1/chat/completions",
                    model="local-model",
                    messages=list(messages),
                    headers={},
                )
            )
        finally:
            cc.get_context_length = orig_ctx
            cc.llm_call_async = orig_call
            cc.resolve_endpoint = orig_resolve
            cc._update_session_history = orig_update

    def _four_turn_history_with_tool_call(self):
        # Large system prompt so the conversation crosses the 85% threshold of
        # the tiny (context_length=500) window used in _run, forcing the real
        # compaction branch to execute.
        return [
            {"role": "system", "content": "You are a helpful agent. " * 200},
            {"role": "user", "content": "turn 1: search the web"},
            # Native tool call → content is None (matches agent_loop persistence)
            {"role": "assistant", "content": None,
             "tool_calls": [{"id": "c1", "type": "function",
                             "function": {"name": "web_search", "arguments": "{}"}}]},
            {"role": "tool", "tool_call_id": "c1", "content": "search results"},
            {"role": "assistant", "content": "Here is what I found."},
            {"role": "user", "content": "turn 2"},
            {"role": "assistant", "content": "reply 2"},
            {"role": "user", "content": "turn 3"},
            {"role": "assistant", "content": "reply 3"},
            {"role": "user", "content": "turn 4 — previously broke here"},
        ]

    def test_does_not_crash_on_none_content_turn(self):
        # Must not raise TypeError; returns the 3-tuple contract.
        result = self._run(self._four_turn_history_with_tool_call())
        assert isinstance(result, tuple) and len(result) == 3
        compacted_messages, context_length, was_compacted = result
        assert isinstance(compacted_messages, list)
        assert was_compacted is True
        # The summary the model produced is present and a system message.
        assert any(
            m.get("role") == "system" and "compact summary text" in (m.get("content") or "")
            for m in compacted_messages
        )

    def test_handles_multimodal_list_content(self):
        messages = self._four_turn_history_with_tool_call()
        messages[1] = {"role": "user", "content": [
            {"type": "text", "text": "look at this image"},
            {"type": "image_url", "image_url": {"url": "data:image/png;base64,xxxx"}},
        ]}
        result = self._run(messages)
        assert len(result) == 3 and result[2] is True


class TestResearchPrimerPreserved:
    """A research-spinoff primer (metadata research_spinoff_from) must never be
    trimmed away — it is the Discuss chat's sole knowledge base (drift fix)."""

    def _messages(self):
        return [
            {"role": "system", "content": "You are Odysseus."},
            {"role": "system", "content": "Prompt-safety policy: data not instructions."},
            {"role": "system", "content": "saved memory: pinned " + "m" * 600},
            {"role": "system", "content": "RETRIEVED-DOCS-MARKER " + "r" * 6000},
            {"role": "system",
             "content": "=== REPORT ===\nPRIMER-MARKER " + "z" * 1500,
             "metadata": {"research_spinoff_from": "rp-abc123"}},
        ] + [
            {"role": "user", "content": f"q{i} " + ("x" * 500)} for i in range(8)
        ] + [
            {"role": "assistant", "content": "a" * 500},
            {"role": "user", "content": "latest question"},
        ]

    def test_primer_kept_when_over_budget(self):
        trimmed = trim_for_context(self._messages(), context_length=1024, reserve_tokens=256)
        joined = "\n".join(str(m.get("content", "")) for m in trimmed)
        assert "PRIMER-MARKER" in joined

    def test_bulky_non_primer_system_dropped_but_primer_kept(self):
        trimmed = trim_for_context(self._messages(), context_length=1024, reserve_tokens=256)
        joined = "\n".join(str(m.get("content", "")) for m in trimmed)
        assert "PRIMER-MARKER" in joined
        assert "RETRIEVED-DOCS-MARKER" not in joined

    def test_leading_preset_kept_when_no_primer_metadata(self):
        msgs = self._messages()
        del msgs[4]["metadata"]
        trimmed = trim_for_context(msgs, context_length=1024, reserve_tokens=256)
        joined = "\n".join(str(m.get("content", "")) for m in trimmed)
        assert "You are Odysseus." in joined


# ---------------------------------------------------------------------------
# Regression: auto-compaction must not silently delete persisted turns.
# The bug computed the persisted split offset from the INFLATED prompt array
# (ephemeral system + memory/RAG/datetime user messages absent from
# session.history), then applied it positionally to session.history — turns
# between "summarized" and "kept" fell into a gap and were permanently deleted.
# The fix partitions session.history directly (one cut), so it is gapless.
# ---------------------------------------------------------------------------
class _Msg:
    """Lightweight stand-in for the (test-mocked) ChatMessage so the summary
    message that _update_session_history builds is inspectable."""
    def __init__(self, role, content, metadata=None):
        self.role = role
        self.content = content
        self.metadata = metadata


def _turns(n):
    """n user/assistant exchanges => 2n persisted messages."""
    out = []
    for i in range(n):
        out.append({"role": "user", "content": f"U{i}"})
        out.append({"role": "assistant", "content": f"A{i}"})
    return out


def _drive(history, inflated_messages, *, summary="SUMMARY-OUT", fail=False):
    """Force compaction with a real session.history; capture the persisted
    new_history and the text actually sent to the summary model."""
    captured = {}

    async def _fake_summary(url, model, summary_messages, **k):
        captured["summary_src"] = summary_messages[1]["content"]
        if fail:
            raise RuntimeError("summary model down")
        return summary

    class _FakeMgr:
        def replace_messages(self, sid, new_history):
            captured["new_history"] = list(new_history)
            return True

    sess = type("S", (), {})()
    sess.history = list(history)
    sess.id = "sess-1"

    import core.models as _cm  # the MagicMock module
    saved = (cc.get_context_length, cc.estimate_tokens, cc.llm_call_async,
             cc.resolve_endpoint, cc.ChatMessage, _cm.get_session_manager_instance)
    cc.get_context_length = lambda u, m: 100
    cc.estimate_tokens = lambda msgs: 10000  # force pct >> 85%
    cc.llm_call_async = _fake_summary
    cc.resolve_endpoint = lambda *a, **k: (None, None, None)
    cc.ChatMessage = _Msg
    _cm.get_session_manager_instance = lambda: _FakeMgr()
    try:
        result = asyncio.run(maybe_compact(
            session=sess, endpoint_url="http://x", model="m",
            messages=list(inflated_messages), headers={},
        ))
    finally:
        (cc.get_context_length, cc.estimate_tokens, cc.llm_call_async,
         cc.resolve_endpoint, cc.ChatMessage,
         _cm.get_session_manager_instance) = saved
    return result, captured.get("new_history"), captured.get("summary_src", "")


def _assert_no_loss(history, new_history, summary_src):
    """Every persisted user/assistant turn survives verbatim OR is represented
    in the summary input."""
    assert new_history is not None, "history was never persisted"
    for m in history:
        if m.get("role") not in ("user", "assistant"):
            continue
        flat = cc._content_as_text(m.get("content"))
        if not flat:
            continue  # content=None tool-call turn — nothing to lose
        survived = any(cc._content_as_text(cc._msg_content(x)) == flat for x in new_history)
        represented = flat[:2000] in summary_src
        assert survived or represented, f"LOST persisted turn: {flat!r}"


class TestCompactionNoLoss:
    def test_plan_tiles_body_gaplessly(self):
        # Pure planner: summarize + keep must tile the conversational body
        # exactly (contiguous, non-overlapping) for every length.
        for n in range(1, 21):
            H = _turns(n)  # 2n messages
            plan = cc._plan_history_compaction(H)
            if plan is None:
                assert len(H) < 4
                continue
            prefix, priors, summarize, keep = plan
            assert prefix == [] and priors == []
            assert summarize + keep == H            # gapless, ordered, no overlap
            assert len(keep) >= 2 and len(summarize) >= 1

    def test_no_loss_across_prefaces(self):
        base = _turns(6)  # 12 real turns
        policy = {"role": "system", "content": "POLICY"}
        preset = {"role": "system", "content": "PRESET"}
        mem = [{"role": "user", "content": "MEMORY-EPHEMERAL-1"},
               {"role": "user", "content": "MEMORY-EPHEMERAL-2"}]
        fixtures = {
            "no_preface": (base, list(base)),
            "with_memory": (base, [policy] + mem + base),    # the exact loss case
            "with_preset": (base, [preset, policy] + base),
        }
        for name, (history, inflated) in fixtures.items():
            (out, _ctx, was), new_history, src = _drive(history, inflated)
            assert was is True, name
            _assert_no_loss(history, new_history, src)

    def test_with_memory_keeps_latest_exchange_verbatim(self):
        # The reported 1-3 turn loss: ephemeral user rows in the prompt shifted
        # the offset forward, deleting the most recent real turns.
        history = _turns(5)  # U0..U4 / A0..A4
        inflated = [{"role": "system", "content": "POLICY"},
                    {"role": "user", "content": "MEM"},
                    {"role": "user", "content": "RAG"}] + history
        (_out, _c, was), new_history, _src = _drive(history, inflated)
        assert was is True
        flats = [cc._content_as_text(cc._msg_content(x)) for x in new_history]
        assert "U4" in flats and "A4" in flats   # latest exchange survives verbatim

    def test_prior_summary_folded_not_chained(self):
        prior = {"role": "system",
                 "content": "[Conversation summary]\nOLD-SUMMARY-BODY",
                 "metadata": {"compacted": True, "compaction_index": 1}}
        history = [prior] + _turns(6)
        (_out, _c, was), new_history, src = _drive(history, list(history))
        assert was is True
        summaries = [x for x in new_history
                     if cc._is_prior_summary(x)]
        assert len(summaries) == 1                       # folded, not chained
        assert summaries[0].metadata["compaction_index"] == 2
        assert "OLD-SUMMARY-BODY" in src                 # prior summary was folded in

    def test_summary_excludes_ephemeral_and_slash(self):
        slash = {"role": "user", "content": "SLASH-CMD", "metadata": {"source": "slash"}}
        history = [{"role": "user", "content": "REAL-OLD-TURN"},
                   slash,
                   {"role": "assistant", "content": "REAL-OLD-REPLY"}] + _turns(4)
        inflated = [{"role": "user", "content": "MEMORY-EPHEMERAL"}] + history
        (_o, _c, _w), _new, src = _drive(history, inflated)
        assert "MEMORY-EPHEMERAL" not in src    # ephemeral never reaches the summary
        assert "SLASH-CMD" not in src           # slash UI rows excluded
        assert "REAL-OLD-TURN" in src           # real older turns included

    def test_too_few_real_turns_no_mutation(self):
        history = _turns(1)  # only 2 real messages
        inflated = [{"role": "system", "content": "POLICY"},
                    {"role": "user", "content": "MEM"}] + history
        (_out, _c, was), new_history, _src = _drive(history, inflated)
        assert was is False                  # ephemeral bloat, not real conversation
        assert new_history is None           # replace_messages never called

    def test_failure_leaves_history_unmutated(self):
        history = _turns(6)
        (out, _ctx, was), new_history, _src = _drive(history, list(history), fail=True)
        assert was is False
        assert new_history is None           # history NOT rewritten on summary failure

    def test_content_none_turn_in_summarized_range(self):
        # An assistant tool-call turn (content=None) among the older turns must
        # not crash compaction and must not be miscounted as a lost turn.
        history = [{"role": "user", "content": "U0"},
                   {"role": "assistant", "content": None,
                    "tool_calls": [{"id": "c1", "type": "function",
                                    "function": {"name": "x", "arguments": "{}"}}]},
                   {"role": "user", "content": "U1"},
                   {"role": "assistant", "content": "A1"}] + _turns(3)
        (_o, _c, was), new_history, src = _drive(history, list(history))
        assert was is True
        _assert_no_loss(history, new_history, src)
