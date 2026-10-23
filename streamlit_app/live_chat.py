"""
EduAI Connect: grounded teacher Q&A over the synthetic student records.

Retrieval: keyword matching over the 12 synthetic records. A question that names
students gets only those records; any other question gets the whole class, ordered
by the topic it asks about (risk, attendance, GPA, missing work or a subject).
No embeddings are used.

Answer: Claude Haiku 4.5 on Amazon Bedrock (Converse API, us.* inference profile),
told to use only the retrieved records and cite their IDs. The records sent to the
model are shown under every answer.

Safety rules (same as FinTech AI):
* Credentials come only from st.secrets["aws"] (access_key_id, secret_access_key,
  region). Outside Streamlit, the default AWS credential chain is used only when
  EDUAI_ALLOW_DEFAULT_CREDENTIALS=1 is set (local testing).
* With no credentials the chat runs in demo mode: it shows the matching records and
  says that no AI answer was generated. It never writes an answer itself.
* At most MAX_LIVE_REQUESTS_PER_SESSION live AI requests per browser session.
* One audit log entry (JSON Lines) per answer, whatever the mode.
* The Bedrock PII guardrail is not applied to this chat.
"""

from __future__ import annotations

import json
import os
import re
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Dict, List, MutableMapping, Optional, Tuple

MODEL_ID = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
MODEL_NAME = "Claude Haiku 4.5"
DEFAULT_REGION = "us-east-1"
MAX_LIVE_REQUESTS_PER_SESSION = 10
MAX_OUTPUT_TOKENS = 400
# Claude Haiku 4.5, us.* inference profile, on-demand, USD per 1M tokens (same figures as FinTech AI).
PRICE_PER_1M = {"input": 1.10, "output": 5.50}

DEFAULT_AUDIT_LOG = Path(__file__).resolve().parent.parent / "logs" / "chat_audit.jsonl"

SYSTEM_PROMPT = (
    "You answer a teacher's questions about students in one class. Use only the student records "
    "in the user message. Each record starts with an ID such as [S1002]; cite the IDs you rely on "
    "in square brackets. If the records do not contain the answer, say so plainly instead of "
    "guessing. Do not give medical, legal or disciplinary advice. Answer in under 150 words of "
    "plain wording, without em dashes. "
    "All records are synthetic."
)

COURSES = ["Math", "Biology", "English", "History", "Physics", "Chemistry"]

# Topic words -> (sort key, descending?) used to order class-wide results.
TOPICS = [
    (("risk", "intervention", "struggling", "failing", "behind", "help", "worry", "concern"),
     "risk_score", True),
    (("attendance", "absent", "absence", "absences", "missing class", "show up"), "attendance", False),
    (("missing", "assignment", "assignments", "homework", "late work"), "missing_assignments", True),
    (("gpa", "grades", "grade point", "performing", "lowest", "highest", "top", "best"), "gpa", False),
]


# -- Retrieval --------------------------------------------------------------------

def record_id(student: dict) -> str:
    return f"S{student['id']}"


def _words(text: str) -> List[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def retrieve(question: str, students: List[dict]) -> Tuple[List[dict], str]:
    """Return (records, how they were chosen)."""
    words = set(_words(question))
    named = [s for s in students
             if {p for p in _words(s["name"]) if len(p) > 2} & words or record_id(s).lower() in words]
    if named:
        return named, "named in the question"

    pool = list(students)
    levels = {int(n) for n in re.findall(r"\bgrade\s*(9|10|11|12)\b", question.lower())}
    levels |= {int(n) for n in re.findall(r"\b(9|10|11|12)th\b", question.lower())}
    if levels:
        pool = [s for s in pool if s["grade"] in levels]

    text = question.lower()
    subject = next((c for c in COURSES if c.lower() in words), None)
    if subject:
        return sorted(pool, key=lambda s: s["grades"][subject]), f"whole class, by {subject} grade"
    for keys, field, desc in TOPICS:
        if any(k in text for k in keys):
            label = field.replace("_", " ")
            return sorted(pool, key=lambda s: s[field], reverse=desc), f"whole class, by {label}"
    return pool, "whole class"


def format_record(student: dict) -> str:
    grades = ", ".join(f"{c} {g}" for c, g in student["grades"].items())
    return (f"[{record_id(student)}] {student['name']} | grade {student['grade']} | GPA {student['gpa']} | "
            f"attendance {student['attendance']}% | missing assignments {student['missing_assignments']} | "
            f"risk {student['risk']} ({student['risk_score']}/100) | {grades}")


def build_prompt(question: str, records: List[dict]) -> str:
    body = "\n".join(format_record(s) for s in records)
    return f"Student records:\n{body}\n\nTeacher's question: {question.strip()}"


def cited_ids(answer: str) -> List[str]:
    found = re.findall(r"S\d{4}", answer or "")
    return list(dict.fromkeys(found))


# -- Credentials and model call -------------------------------------------------------

def aws_settings() -> Optional[Dict[str, str]]:
    """The [aws] block from Streamlit secrets, or None. Never logged or displayed."""
    try:
        import streamlit as st

        section = st.secrets["aws"]
        key_id = section.get("access_key_id")
        secret = section.get("secret_access_key")
        if key_id and secret:
            return {"aws_access_key_id": str(key_id), "aws_secret_access_key": str(secret),
                    "region_name": str(section.get("region") or DEFAULT_REGION)}
    except Exception:
        pass
    if os.environ.get("EDUAI_ALLOW_DEFAULT_CREDENTIALS") == "1":
        return {"region_name": os.environ.get("AWS_REGION", DEFAULT_REGION)}
    return None


def bedrock_client(settings: Dict[str, str]):
    import boto3

    return boto3.client("bedrock-runtime", **settings)


def call_model(client, question: str, records: List[dict]) -> dict:
    resp = client.converse(
        modelId=MODEL_ID,
        system=[{"text": SYSTEM_PROMPT}],
        messages=[{"role": "user", "content": [{"text": build_prompt(question, records)}]}],
        inferenceConfig={"maxTokens": MAX_OUTPUT_TOKENS, "temperature": 0.0},
    )
    text = plain_punctuation("".join(part.get("text", "") for part in resp["output"]["message"]["content"]).strip())
    usage = resp.get("usage", {})
    return {"text": text, "input_tokens": usage.get("inputTokens", 0),
            "output_tokens": usage.get("outputTokens", 0), "stop_reason": resp.get("stopReason")}


def plain_punctuation(text: str) -> str:
    """Replace em and en dashes the model sometimes writes despite the prompt. Punctuation only."""
    text = re.sub(r"\s*\u2014\s*", ", ", text)
    return re.sub(r"\s+\u2013\s+", " - ", text)


def cost_usd(input_tokens: int, output_tokens: int) -> float:
    return round(input_tokens * PRICE_PER_1M["input"] / 1e6 + output_tokens * PRICE_PER_1M["output"] / 1e6, 6)


# -- One chat turn ----------------------------------------------------------------------

def _session(state: MutableMapping) -> MutableMapping:
    state.setdefault("chat_session_id", uuid.uuid4().hex[:12])
    state.setdefault("live_requests_used", 0)
    return state


def requests_used(state: MutableMapping) -> int:
    return _session(state)["live_requests_used"]


def write_audit(entry: dict, path: Path = None) -> None:
    path = Path(path or os.environ.get("EDUAI_AUDIT_LOG") or DEFAULT_AUDIT_LOG)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False) + "\n")


def answer_question(
    question: str,
    students: List[dict],
    state: MutableMapping,
    *,
    settings: Optional[Dict[str, str]] = None,
    client_factory: Callable = bedrock_client,
    audit_path: Path = None,
) -> dict:
    """Answer one question. Never raises and never invents an answer."""
    state = _session(state)
    records, chosen_by = retrieve(question, students)
    result = {"question": question, "records": records, "chosen_by": chosen_by, "answer": None,
              "mode": "demo", "reason": None, "input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0,
              "latency_ms": 0.0, "cited_ids": [], "citations_valid": None}

    if settings is None:
        result["reason"] = "no AWS credentials are set for this app"
    elif state["live_requests_used"] >= MAX_LIVE_REQUESTS_PER_SESSION:
        result["reason"] = f"session cap reached ({MAX_LIVE_REQUESTS_PER_SESSION} live AI requests per session)"
    else:
        state["live_requests_used"] += 1
        start = time.perf_counter()
        try:
            out = call_model(client_factory(settings), question, records)
            if not out["text"]:
                raise ValueError("empty model response")
            ids = cited_ids(out["text"])
            allowed = {record_id(s) for s in records}
            result.update(mode="live", answer=out["text"], input_tokens=out["input_tokens"],
                          output_tokens=out["output_tokens"],
                          cost_usd=cost_usd(out["input_tokens"], out["output_tokens"]),
                          cited_ids=ids, citations_valid=all(i in allowed for i in ids))
        except Exception as exc:  # noqa: BLE001 - shown as a reason, never as an answer
            response = getattr(exc, "response", None)
            code = response.get("Error", {}).get("Code") if isinstance(response, dict) else None
            result.update(mode="error", reason=f"the live AI call failed ({code or type(exc).__name__})")
        result["latency_ms"] = round((time.perf_counter() - start) * 1000, 1)

    entry = {
        "audit_id": uuid.uuid4().hex[:12],
        "time_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "session_id": state["chat_session_id"],
        "mode": result["mode"],
        "reason": result["reason"],
        "model_id": MODEL_ID if result["mode"] == "live" else None,
        "question": question,
        "record_ids": [record_id(s) for s in records],
        "chosen_by": chosen_by,
        "answer": result["answer"],
        "cited_ids": result["cited_ids"],
        "citations_valid": result["citations_valid"],
        "input_tokens": result["input_tokens"],
        "output_tokens": result["output_tokens"],
        "cost_usd": result["cost_usd"],
        "latency_ms": result["latency_ms"],
    }
    try:
        write_audit(entry, audit_path)
        result["audit_id"] = entry["audit_id"]
    except OSError as exc:
        result["audit_id"] = None
        result["audit_error"] = type(exc).__name__
    state.setdefault("chat_audit", []).append(entry)
    return result
