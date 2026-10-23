"""
EduAI Connect: Demo Pages
All synthetic data. Only the AI chat page calls AWS, and only when [aws] secrets are set.
"""

import streamlit as st
import pandas as pd
import numpy as np
import random

from live_chat import (
    MAX_LIVE_REQUESTS_PER_SESSION,
    MODEL_NAME,
    answer_question,
    aws_settings,
    record_id,
    requests_used,
)

# ─────────────────────────────────────────────
# Synthetic Dataset
# ─────────────────────────────────────────────

COURSES = ["Math", "Biology", "English", "History", "Physics", "Chemistry"]

STUDENTS = [
    {
        "id": 1001, "name": "Sandra Lopez",    "grade": 9,  "gpa": 1.9,
        "attendance": 72, "missing_assignments": 5,
        "risk": "HIGH",   "risk_score": 87,
        "grades": {"Math": 61, "Biology": 58, "English": 72, "History": 68, "Physics": 55, "Chemistry": 63},
    },
    {
        "id": 1002, "name": "Marcus Thompson", "grade": 10, "gpa": 1.7,
        "attendance": 65, "missing_assignments": 7,
        "risk": "HIGH",   "risk_score": 92,
        "grades": {"Math": 55, "Biology": 60, "English": 58, "History": 62, "Physics": 50, "Chemistry": 57},
    },
    {
        "id": 1003, "name": "Aisha Patel",      "grade": 11, "gpa": 2.1,
        "attendance": 78, "missing_assignments": 4,
        "risk": "HIGH",   "risk_score": 81,
        "grades": {"Math": 64, "Biology": 69, "English": 71, "History": 66, "Physics": 60, "Chemistry": 68},
    },
    {
        "id": 1004, "name": "Devon Richards",   "grade": 9,  "gpa": 2.4,
        "attendance": 82, "missing_assignments": 3,
        "risk": "MEDIUM", "risk_score": 58,
        "grades": {"Math": 74, "Biology": 71, "English": 76, "History": 73, "Physics": 69, "Chemistry": 72},
    },
    {
        "id": 1005, "name": "Yuki Nakamura",    "grade": 10, "gpa": 2.6,
        "attendance": 85, "missing_assignments": 2,
        "risk": "MEDIUM", "risk_score": 51,
        "grades": {"Math": 78, "Biology": 75, "English": 80, "History": 77, "Physics": 72, "Chemistry": 76},
    },
    {
        "id": 1006, "name": "Priya Sharma",     "grade": 11, "gpa": 2.3,
        "attendance": 80, "missing_assignments": 3,
        "risk": "MEDIUM", "risk_score": 62,
        "grades": {"Math": 70, "Biology": 73, "English": 75, "History": 71, "Physics": 67, "Chemistry": 70},
    },
    {
        "id": 1007, "name": "Jordan Williams",  "grade": 12, "gpa": 2.8,
        "attendance": 88, "missing_assignments": 1,
        "risk": "MEDIUM", "risk_score": 44,
        "grades": {"Math": 80, "Biology": 82, "English": 85, "History": 79, "Physics": 76, "Chemistry": 81},
    },
    {
        "id": 1008, "name": "Emily Chen",       "grade": 9,  "gpa": 3.4,
        "attendance": 94, "missing_assignments": 0,
        "risk": "LOW",    "risk_score": 18,
        "grades": {"Math": 88, "Biology": 91, "English": 93, "History": 87, "Physics": 85, "Chemistry": 90},
    },
    {
        "id": 1009, "name": "Carlos Mendez",    "grade": 10, "gpa": 3.6,
        "attendance": 96, "missing_assignments": 0,
        "risk": "LOW",    "risk_score": 12,
        "grades": {"Math": 92, "Biology": 90, "English": 94, "History": 91, "Physics": 88, "Chemistry": 93},
    },
    {
        "id": 1010, "name": "Fatima Al-Hassan", "grade": 11, "gpa": 3.8,
        "attendance": 98, "missing_assignments": 0,
        "risk": "LOW",    "risk_score": 8,
        "grades": {"Math": 95, "Biology": 96, "English": 97, "History": 94, "Physics": 92, "Chemistry": 96},
    },
    {
        "id": 1011, "name": "Tyler Brooks",     "grade": 12, "gpa": 3.1,
        "attendance": 91, "missing_assignments": 1,
        "risk": "LOW",    "risk_score": 22,
        "grades": {"Math": 84, "Biology": 86, "English": 88, "History": 83, "Physics": 80, "Chemistry": 85},
    },
    {
        "id": 1012, "name": "Sofia Rossi",      "grade": 9,  "gpa": 3.3,
        "attendance": 93, "missing_assignments": 0,
        "risk": "LOW",    "risk_score": 20,
        "grades": {"Math": 87, "Biology": 89, "English": 90, "History": 85, "Physics": 83, "Chemistry": 88},
    },
]

# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def _risk_color(risk: str) -> str:
    return {"HIGH": "🔴", "MEDIUM": "🟡", "LOW": "🟢"}.get(risk, "⚪")


def _grade_label(score: int) -> str:
    if score >= 90: return "A"
    if score >= 80: return "B"
    if score >= 70: return "C"
    if score >= 60: return "D"
    return "F"


def _students_df() -> pd.DataFrame:
    rows = []
    for s in STUDENTS:
        rows.append({
            "Name": s["name"],
            "Grade": s["grade"],
            "GPA": s["gpa"],
            "Attendance %": s["attendance"],
            "Missing Assignments": s["missing_assignments"],
            "Risk": f"{_risk_color(s['risk'])} {s['risk']}",
            "Risk Score": s["risk_score"],
        })
    return pd.DataFrame(rows)


# ─────────────────────────────────────────────
# Page 1: Class Dashboard
# ─────────────────────────────────────────────

def page_class_dashboard():
    st.title("📊 Class Dashboard")
    st.caption("Section B: Spring 2025 · 12 students · Demo Mode")
    st.divider()

    high   = sum(1 for s in STUDENTS if s["risk"] == "HIGH")
    medium = sum(1 for s in STUDENTS if s["risk"] == "MEDIUM")
    low    = sum(1 for s in STUDENTS if s["risk"] == "LOW")
    avg_gpa        = round(sum(s["gpa"] for s in STUDENTS) / len(STUDENTS), 2)
    avg_attendance = round(sum(s["attendance"] for s in STUDENTS) / len(STUDENTS), 1)
    avg_missing    = round(sum(s["missing_assignments"] for s in STUDENTS) / len(STUDENTS), 1)

    c1, c2, c3, c4, c5, c6 = st.columns(6)
    c1.metric("👥 Students",      12)
    c2.metric("🔴 High Risk",     high,   delta=f"-{high} need action", delta_color="inverse")
    c3.metric("🟡 Medium Risk",   medium)
    c4.metric("📈 Avg GPA",       avg_gpa)
    c5.metric("📅 Avg Attendance", f"{avg_attendance}%")
    c6.metric("📋 Avg Missing",   avg_missing, delta_color="inverse")

    st.divider()
    st.subheader("All Students")

    df = _students_df()
    st.dataframe(
        df,
        use_container_width=True,
        hide_index=True,
        column_config={
            "GPA":         st.column_config.NumberColumn(format="%.1f"),
            "Attendance %":st.column_config.ProgressColumn(min_value=0, max_value=100, format="%d%%"),
            "Risk Score":  st.column_config.ProgressColumn(min_value=0, max_value=100, format="%d"),
        },
    )

    st.divider()
    st.subheader("Course Average Scores")

    course_avgs = {
        course: round(sum(s["grades"][course] for s in STUDENTS) / len(STUDENTS), 1)
        for course in COURSES
    }
    course_df = pd.DataFrame(
        [{"Course": k, "Class Average": v, "Grade": _grade_label(int(v))} for k, v in course_avgs.items()]
    )
    st.dataframe(
        course_df,
        use_container_width=True,
        hide_index=True,
        column_config={
            "Class Average": st.column_config.ProgressColumn(min_value=0, max_value=100, format="%.1f"),
        },
    )


# ─────────────────────────────────────────────
# Page 2: At-Risk Students
# ─────────────────────────────────────────────

def page_at_risk():
    st.title("⚠️ At-Risk Students")
    st.caption("Students flagged based on GPA, attendance, and missing assignments")
    st.divider()

    c1, c2, c3 = st.columns(3)
    with c1:
        st.error("**🔴 HIGH RISK**\nGPA < 2.2 · Attendance < 80% · Missing ≥ 4\nImmediate intervention required")
    with c2:
        st.warning("**🟡 MEDIUM RISK**\nOne or two metrics below threshold\nMonitor closely, schedule check-in")
    with c3:
        st.success("**🟢 LOW RISK**\nAll metrics within healthy range\nStandard monitoring")

    st.divider()

    for level, header, renderer in [
        ("HIGH",   "🔴 High Risk Students",   st.error),
        ("MEDIUM", "🟡 Medium Risk Students", st.warning),
        ("LOW",    "🟢 Low Risk Students",    st.success),
    ]:
        cohort = [s for s in STUDENTS if s["risk"] == level]
        st.subheader(f"{header} ({len(cohort)})")
        for s in cohort:
            with st.expander(f"{_risk_color(s['risk'])} {s['name']}: Risk Score: {s['risk_score']}/100 · GPA: {s['gpa']} · Attendance: {s['attendance']}%"):
                col1, col2, col3, col4 = st.columns(4)
                col1.metric("GPA",         s["gpa"])
                col2.metric("Attendance",  f"{s['attendance']}%")
                col3.metric("Missing",     s["missing_assignments"])
                col4.metric("Risk Score",  s["risk_score"])

                st.caption("Course Grades")
                grades_df = pd.DataFrame([
                    {"Course": course, "Score": score, "Grade": _grade_label(score)}
                    for course, score in s["grades"].items()
                ])
                st.dataframe(
                    grades_df,
                    use_container_width=True,
                    hide_index=True,
                    column_config={
                        "Score": st.column_config.ProgressColumn(min_value=0, max_value=100, format="%d"),
                    },
                )

                if level == "HIGH":
                    st.info("**Recommended Actions:** Schedule parent conference · Assign peer tutor · Weekly check-ins · Review IEP if applicable")
                elif level == "MEDIUM":
                    st.info("**Recommended Actions:** Schedule 1:1 check-in · Review assignment completion · Monitor next 2 weeks")
        st.divider()


# ─────────────────────────────────────────────
# Page 3: Student Profiles
# ─────────────────────────────────────────────

def page_student_profiles():
    st.title("👤 Student Profiles")
    st.caption("Detailed view of individual student performance")
    st.divider()

    names = [s["name"] for s in STUDENTS]
    selected = st.selectbox("Select a student:", names)
    student = next(s for s in STUDENTS if s["name"] == selected)

    st.divider()
    st.subheader(f"{_risk_color(student['risk'])} {student['name']}")

    c1, c2, c3, c4, c5 = st.columns(5)
    c1.metric("Grade Level",      student["grade"])
    c2.metric("GPA",              student["gpa"])
    c3.metric("Attendance",       f"{student['attendance']}%")
    c4.metric("Missing Assignments", student["missing_assignments"])
    c5.metric("Risk Score",       f"{student['risk_score']}/100")

    # Attendance progress bar
    st.caption("Attendance Rate")
    st.progress(student["attendance"] / 100)

    # Risk score bar
    st.caption("Risk Score (higher = more at risk)")
    st.progress(student["risk_score"] / 100)

    st.divider()
    st.subheader("Course Performance")
    grades_df = pd.DataFrame([
        {
            "Course":  course,
            "Score":   score,
            "Grade":   _grade_label(score),
            "Status":  "[OK] Passing" if score >= 70 else "❌ Failing",
        }
        for course, score in student["grades"].items()
    ])
    st.dataframe(
        grades_df,
        use_container_width=True,
        hide_index=True,
        column_config={
            "Score": st.column_config.ProgressColumn(min_value=0, max_value=100, format="%d"),
        },
    )

    st.divider()
    st.subheader("Risk Assessment")
    if student["risk"] == "HIGH":
        st.error(f"**{student['name']} is HIGH RISK.** Multiple indicators are below acceptable thresholds. Immediate teacher or counselor intervention is recommended.")
    elif student["risk"] == "MEDIUM":
        st.warning(f"**{student['name']} is MEDIUM RISK.** One or more indicators need attention. Schedule a check-in within the next week.")
    else:
        st.success(f"**{student['name']} is LOW RISK.** All performance indicators are within healthy ranges. Continue standard monitoring.")


# ─────────────────────────────────────────────
# Page 4: AI Chat (grounded in the student records)
# ─────────────────────────────────────────────

def _sources_df(records: list) -> pd.DataFrame:
    return pd.DataFrame([{
        "ID": record_id(s), "Name": s["name"], "Grade": s["grade"], "GPA": s["gpa"],
        "Attendance %": s["attendance"], "Missing": s["missing_assignments"],
        "Risk": f"{_risk_color(s['risk'])} {s['risk']}", "Risk Score": s["risk_score"],
    } for s in records])


def _badge(result: dict) -> str:
    if result["mode"] == "live":
        return f"Live AI · Amazon Bedrock · {MODEL_NAME}"
    if result["mode"] == "error":
        return f"No AI answer: {result['reason']}"
    return f"Demo mode: {result['reason']}"


def _render_turn(result: dict) -> None:
    if result["mode"] == "live":
        st.success(_badge(result))
        st.markdown(result["answer"])
        note = f"{result['input_tokens']} input / {result['output_tokens']} output tokens, " \
               f"about USD {result['cost_usd']:.4f}"
        if result["citations_valid"] is False:
            note += " · warning: the answer cites a record that was not retrieved"
        st.caption(note)
    else:
        st.warning(_badge(result))
        st.markdown("No AI answer was generated. These are the student records that match the question.")
    st.caption(f"Source records ({len(result['records'])}, {result['chosen_by']}) · audit entry "
               f"{result.get('audit_id') or 'not written'}")
    st.dataframe(_sources_df(result["records"]), hide_index=True, use_container_width=True)


def page_ai_chat():
    st.title("💬 Ask About the Class")
    settings = aws_settings()
    used = requests_used(st.session_state)
    if settings:
        st.caption(f"Live AI: {MODEL_NAME} on Amazon Bedrock, answering only from the synthetic student "
                   f"records shown under each answer · {used}/{MAX_LIVE_REQUESTS_PER_SESSION} live requests "
                   f"used this session")
    else:
        st.warning("Demo mode: no AWS credentials are set for this app, so no AI answers are generated. "
                   "Each question shows the matching student records only.")
    st.divider()

    with st.expander("💡 Try these example questions"):
        st.markdown(
            "- How is Marcus doing?\n"
            "- Who is most at risk, and why?\n"
            "- Which students have low attendance?\n"
            "- How is the class doing in Math?\n"
            "- Compare Fatima and Tyler"
        )

    history = st.session_state.setdefault("chat_turns", [])
    for turn in history:
        with st.chat_message("user", avatar="🧑‍🏫"):
            st.markdown(turn["question"])
        with st.chat_message("assistant", avatar="🤖" if turn["mode"] == "live" else "📋"):
            _render_turn(turn)

    question = st.chat_input("Ask about students, grades, attendance, risk levels...")
    if question:
        with st.chat_message("user", avatar="🧑‍🏫"):
            st.markdown(question)
        with st.spinner("Retrieving records" + (" and asking Claude..." if settings else "...")):
            result = answer_question(question, STUDENTS, st.session_state, settings=settings)
        history.append(result)
        with st.chat_message("assistant", avatar="🤖" if result["mode"] == "live" else "📋"):
            _render_turn(result)

    audit = st.session_state.get("chat_audit", [])
    if audit:
        with st.expander(f"Audit log for this session ({len(audit)} entries)"):
            st.dataframe(pd.DataFrame(audit)[["audit_id", "time_utc", "mode", "model_id", "question", "record_ids",
                                              "cited_ids", "input_tokens", "output_tokens", "cost_usd", "latency_ms"]],
                         hide_index=True, use_container_width=True)


# ─────────────────────────────────────────────
# Page 5: System Info
# ─────────────────────────────────────────────

def page_system_info():
    st.title("⚙️ System Info")
    st.caption("Architecture, compliance, and tech stack details")
    st.divider()

    st.subheader("Tech Stack")
    stack_df = pd.DataFrame([
        {"Where": "This app", "Layer": "LLM", "Technology": "Claude Haiku 4.5 on Amazon Bedrock (Converse API)", "Purpose": "Answers chat questions from the retrieved records only"},
        {"Where": "This app", "Layer": "Retrieval", "Technology": "Keyword match over the 12 synthetic records", "Purpose": "Picks the records sent to the model and shown as sources"},
        {"Where": "This app", "Layer": "Audit log", "Technology": "JSON Lines file, one entry per answer", "Purpose": "Question, records used, model, tokens, cost"},
        {"Where": "This app", "Layer": "Frontend", "Technology": "Streamlit", "Purpose": "Teacher dashboard and chat"},
        {"Where": "Repo, local only", "Layer": "RAG pipeline", "Technology": "LangChain + LangGraph, FAISS, Titan Embed Text v2", "Purpose": "Multi-agent retrieval (not deployed)"},
        {"Where": "Repo, local only", "Layer": "API", "Technology": "FastAPI + Uvicorn", "Purpose": "REST endpoints (not deployed)"},
        {"Where": "Repo, local only", "Layer": "Infrastructure", "Technology": "AWS CDK + Terraform", "Purpose": "Infrastructure as code (not deployed)"},
    ])
    st.dataframe(stack_df, use_container_width=True, hide_index=True)

    st.divider()
    st.subheader("Privacy controls: what exists today")
    st.dataframe(pd.DataFrame([
        {"Control": "Synthetic data only", "Status": "Built"},
        {"Control": "API input validation (Pydantic)", "Status": "Built"},
        {"Control": "KMS-encrypted S3 bucket", "Status": "Defined in CDK, not deployed"},
        {"Control": "Bedrock Guardrail for PII", "Status": "Not applied. A script can create one; the chat does not use it"},
        {"Control": "Role-based access", "Status": "Not built (the role selector does not filter data)"},
        {"Control": "Chat audit log", "Status": "Built: one entry per answer (resets when the hosted app restarts)"},
        {"Control": "Live AI session cap", "Status": "Built: 10 live requests per browser session"},
        {"Control": "CloudTrail audit logging", "Status": "Not built"},
    ]), hide_index=True)
    st.caption("This demo is not FERPA compliant and has never handled real student records.")

    st.divider()
    st.subheader("Architecture Decisions")

    decisions = [
        ("Why FAISS?",       "In-memory vector search for low-latency RAG on student documents. No external vector DB dependency for local dev."),
        ("Why LangGraph?",   "Multi-agent orchestration: grading agent feeds into at-risk detection agent as a structured pipeline with shared state."),
        ("Why Bedrock?",     "Native AWS integration with IAM and KMS, so student data could stay inside a school's AWS account. This app's key may only call Claude Haiku 4.5."),
        ("Why Haiku 4.5?",   "Low cost per question and enough for answering from a handful of structured records. Each answer costs well under a cent."),
        ("Why FastAPI?",     "Async endpoints support concurrent Streamlit users. Clean OpenAPI docs auto-generated for integration testing."),
        ("Guardrails",       "Not applied. Planned for real data: block SSNs and mask names and emails in model output. The demo uses synthetic records only."),
    ]
    for title, detail in decisions:
        with st.expander(f"- {title}"):
            st.write(detail)

    st.divider()
    st.subheader("AI Chat Status")
    if aws_settings():
        st.success(f"Live: the chat calls {MODEL_NAME} on Amazon Bedrock, at most "
                   f"{MAX_LIVE_REQUESTS_PER_SESSION} times per browser session. All student data is synthetic.")
    else:
        st.info("Demo mode: no AWS credentials are set, so the chat shows matching records and no AI answers. "
                "All student data is synthetic.")
