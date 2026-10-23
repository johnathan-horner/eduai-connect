"""Grounded chat: retrieval, demo fallback, session cap, audit log and the live path (with a fake client)."""

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "streamlit_app"))

import live_chat  # noqa: E402
from demo_pages import STUDENTS  # noqa: E402

SETTINGS = {"aws_access_key_id": "FAKEKEYID000", "aws_secret_access_key": "fake-secret-value",
            "region_name": "us-east-1"}


class FakeClient:
    def __init__(self, text="Marcus [S1002] is high risk: GPA 1.7 and 65% attendance.", fail=None):
        self.calls = []
        self.text = text
        self.fail = fail

    def converse(self, **kwargs):
        self.calls.append(kwargs)
        if self.fail:
            raise self.fail
        return {"output": {"message": {"content": [{"text": self.text}]}},
                "usage": {"inputTokens": 500, "outputTokens": 60}, "stopReason": "end_turn"}


@pytest.fixture
def audit(tmp_path):
    return tmp_path / "audit.jsonl"


def entries(path):
    return [json.loads(line) for line in path.read_text().splitlines()]


def test_named_student_gets_only_that_record():
    records, how = live_chat.retrieve("How is Marcus doing?", STUDENTS)
    assert [r["name"] for r in records] == ["Marcus Thompson"]
    assert how == "named in the question"


def test_hyphenated_last_name_matches():
    records, _ = live_chat.retrieve("Tell me about Hassan", STUDENTS)
    assert [r["name"] for r in records] == ["Fatima Al-Hassan"]


def test_class_question_orders_by_topic():
    records, how = live_chat.retrieve("Who is most at risk?", STUDENTS)
    assert len(records) == len(STUDENTS)
    assert [r["risk_score"] for r in records] == sorted((s["risk_score"] for s in STUDENTS), reverse=True)
    records, how = live_chat.retrieve("Who has low attendance?", STUDENTS)
    assert records[0]["attendance"] == min(s["attendance"] for s in STUDENTS)
    records, how = live_chat.retrieve("How is the class doing in Math?", STUDENTS)
    assert how == "whole class, by Math grade"


def test_grade_level_filter_ignores_other_numbers():
    records, _ = live_chat.retrieve("Who in grade 9 is struggling?", STUDENTS)
    assert records and {r["grade"] for r in records} == {9}
    records, _ = live_chat.retrieve("List the top 10 students by GPA", STUDENTS)
    assert len(records) == len(STUDENTS)


def test_prompt_contains_only_retrieved_records():
    records, _ = live_chat.retrieve("Compare Fatima and Tyler", STUDENTS)
    prompt = live_chat.build_prompt("Compare Fatima and Tyler", records)
    assert prompt.count("[S1") == 2
    assert "Marcus" not in prompt


def test_no_credentials_is_demo_mode_and_never_calls_or_invents(audit):
    state = {}
    called = []
    result = live_chat.answer_question("How is Marcus doing?", STUDENTS, state, settings=None,
                                       client_factory=lambda s: called.append(s), audit_path=audit)
    assert result["mode"] == "demo" and result["answer"] is None
    assert "no AWS credentials" in result["reason"]
    assert called == [] and state["live_requests_used"] == 0
    [entry] = entries(audit)
    assert entry["mode"] == "demo" and entry["answer"] is None and entry["record_ids"] == ["S1002"]


def test_live_answer_is_logged_with_sources_tokens_and_cost(audit):
    state, client = {}, FakeClient()
    result = live_chat.answer_question("How is Marcus doing?", STUDENTS, state, settings=SETTINGS,
                                       client_factory=lambda s: client, audit_path=audit)
    assert result["mode"] == "live" and "S1002" in result["answer"]
    assert result["cited_ids"] == ["S1002"] and result["citations_valid"] is True
    assert result["cost_usd"] == pytest.approx(500 * 1.10 / 1e6 + 60 * 5.50 / 1e6)
    call = client.calls[0]
    assert call["modelId"] == "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    assert "Marcus Thompson" in call["messages"][0]["content"][0]["text"]
    assert "only the student records" in call["system"][0]["text"]
    [entry] = entries(audit)
    assert entry["mode"] == "live" and entry["model_id"] == live_chat.MODEL_ID
    assert entry["input_tokens"] == 500 and entry["record_ids"] == ["S1002"]
    assert "FAKEKEYID000" not in audit.read_text() and "fake-secret-value" not in audit.read_text()


def test_citation_outside_retrieved_records_is_flagged(audit):
    client = FakeClient(text="See [S1009].")
    result = live_chat.answer_question("How is Marcus doing?", STUDENTS, {}, settings=SETTINGS,
                                       client_factory=lambda s: client, audit_path=audit)
    assert result["citations_valid"] is False


def test_session_cap_stops_live_calls(audit):
    state, client = {}, FakeClient()
    for _ in range(live_chat.MAX_LIVE_REQUESTS_PER_SESSION):
        assert live_chat.answer_question("How is Marcus doing?", STUDENTS, state, settings=SETTINGS,
                                         client_factory=lambda s: client, audit_path=audit)["mode"] == "live"
    capped = live_chat.answer_question("How is Marcus doing?", STUDENTS, state, settings=SETTINGS,
                                       client_factory=lambda s: client, audit_path=audit)
    assert capped["mode"] == "demo" and "session cap" in capped["reason"] and capped["answer"] is None
    assert len(client.calls) == live_chat.MAX_LIVE_REQUESTS_PER_SESSION
    assert len(entries(audit)) == live_chat.MAX_LIVE_REQUESTS_PER_SESSION + 1


def test_model_error_shows_reason_not_an_answer(audit):
    from botocore.exceptions import ClientError

    err = ClientError({"Error": {"Code": "AccessDeniedException", "Message": "secret detail"}}, "Converse")
    result = live_chat.answer_question("How is Marcus doing?", STUDENTS, {}, settings=SETTINGS,
                                       client_factory=lambda s: FakeClient(fail=err), audit_path=audit)
    assert result["mode"] == "error" and result["answer"] is None
    assert "AccessDeniedException" in result["reason"] and "secret detail" not in result["reason"]
    assert entries(audit)[0]["mode"] == "error"


def test_settings_need_secrets_or_explicit_opt_in(monkeypatch):
    monkeypatch.delenv("EDUAI_ALLOW_DEFAULT_CREDENTIALS", raising=False)
    assert live_chat.aws_settings() is None
    monkeypatch.setenv("EDUAI_ALLOW_DEFAULT_CREDENTIALS", "1")
    assert live_chat.aws_settings() == {"region_name": "us-east-1"}


def test_chat_page_in_demo_mode_says_no_ai_answer(monkeypatch, tmp_path):
    from streamlit.testing.v1 import AppTest

    monkeypatch.delenv("EDUAI_ALLOW_DEFAULT_CREDENTIALS", raising=False)
    monkeypatch.setenv("EDUAI_AUDIT_LOG", str(tmp_path / "audit.jsonl"))
    at = AppTest.from_file(str(ROOT / "streamlit_app" / "streamlit_app.py"), default_timeout=90).run()
    at.sidebar.radio[0].set_value("💬 AI Chat").run()
    at.chat_input[0].set_value("How is Marcus doing?").run()
    assert not at.exception
    text = " ".join(w.value for w in at.warning) + " ".join(m.value for m in at.markdown)
    assert "Demo mode" in text and "No AI answer was generated" in text
    assert at.dataframe  # source records are shown


def test_em_and_en_dashes_are_replaced():
    text = ("These factors combined\u2014poor attendance and low GPA\u2014place him first. "
            "Attendance first \u2013 then work.")
    out = live_chat.plain_punctuation(text)
    assert "\u2014" not in out and "\u2013" not in out
    assert out == "These factors combined, poor attendance and low GPA, place him first. Attendance first - then work."
