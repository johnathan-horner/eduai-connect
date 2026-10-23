"""
EduAI Connect: Demo Pages
All synthetic data, no AWS credentials required.
"""

import streamlit as st
import pandas as pd
import numpy as np
import random

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
# Page 4: AI Chat (Demo)
# ─────────────────────────────────────────────

def _demo_ai_response(question: str) -> str:
    q = question.lower()

    # Student name lookup
    for student in STUDENTS:
        first = student["name"].split()[0].lower()
        last  = student["name"].split()[-1].lower()
        if first in q or last in q:
            s = student
            failing = [c for c, g in s["grades"].items() if g < 70]
            top     = max(s["grades"], key=s["grades"].get)
            bottom  = min(s["grades"], key=s["grades"].get)
            resp = (
                f"**{s['name']}** (Grade {s['grade']})\n\n"
                f"- GPA: {s['gpa']} | Attendance: {s['attendance']}% | Missing assignments: {s['missing_assignments']}\n"
                f"- Risk level: {_risk_color(s['risk'])} **{s['risk']}** (score: {s['risk_score']}/100)\n"
                f"- Strongest subject: **{top}** ({s['grades'][top]})\n"
                f"- Weakest subject: **{bottom}** ({s['grades'][bottom]})\n"
            )
            if failing:
                resp += f"- Currently failing: **{', '.join(failing)}**\n"
                resp += "\n⚠️ This student needs academic support in the subjects listed above."
            else:
                resp += "\n[OK] This student is passing all courses."
            return resp

    # Subject queries
    for course in COURSES:
        if course.lower() in q:
            scores   = [(s["name"], s["grades"][course]) for s in STUDENTS]
            scores.sort(key=lambda x: x[1])
            avg      = round(sum(s[1] for s in scores) / len(scores), 1)
            failing  = [(n, g) for n, g in scores if g < 70]
            top3     = scores[-3:][::-1]
            resp     = f"**{course} Class Overview**\n\n- Class average: **{avg}** ({_grade_label(int(avg))})\n"
            resp    += f"- Students failing: **{len(failing)}**\n\n"
            resp    += "**Top performers:**\n"
            for name, grade in top3:
                resp += f"  - {name}: {grade}\n"
            if failing:
                resp += "\n**Students needing support:**\n"
                for name, grade in failing:
                    resp += f"  - {name}: {grade} ({_grade_label(grade)})\n"
            return resp

    # Attendance queries
    if any(word in q for word in ["attendance", "absent", "missing class"]):
        low_att = sorted([s for s in STUDENTS if s["attendance"] < 85], key=lambda x: x["attendance"])
        if low_att:
            resp = f"**{len(low_att)} students have attendance below 85%:**\n\n"
            for s in low_att:
                resp += f"- {s['name']}: {s['attendance']}% ({_risk_color(s['risk'])} {s['risk']})\n"
            return resp
        return "All students currently have attendance above 85%. Great work!"

    # At-risk queries
    if any(word in q for word in ["risk", "failing", "struggling", "help", "intervention"]):
        high   = [s for s in STUDENTS if s["risk"] == "HIGH"]
        medium = [s for s in STUDENTS if s["risk"] == "MEDIUM"]
        resp   = f"**At-Risk Summary**\n\n🔴 **HIGH RISK ({len(high)} students):**\n"
        for s in high:
            resp += f"  - {s['name']}: GPA: {s['gpa']}, Attendance: {s['attendance']}%, Missing: {s['missing_assignments']}\n"
        resp += f"\n🟡 **MEDIUM RISK ({len(medium)} students):**\n"
        for s in medium:
            resp += f"  - {s['name']}: GPA: {s['gpa']}, Attendance: {s['attendance']}%\n"
        resp += "\n**Recommendation:** Schedule immediate interventions for HIGH RISK students. Monitor MEDIUM RISK weekly."
        return resp

    # Class overview
    if any(word in q for word in ["class", "overview", "summary", "performance", "how is"]):
        avg_gpa  = round(sum(s["gpa"] for s in STUDENTS) / len(STUDENTS), 2)
        avg_att  = round(sum(s["attendance"] for s in STUDENTS) / len(STUDENTS), 1)
        high_ct  = sum(1 for s in STUDENTS if s["risk"] == "HIGH")
        med_ct   = sum(1 for s in STUDENTS if s["risk"] == "MEDIUM")
        return (
            f"**Class Overview: Section B**\n\n"
            f"- Total students: **12**\n"
            f"- Average GPA: **{avg_gpa}**\n"
            f"- Average attendance: **{avg_att}%**\n"
            f"- 🔴 High risk: **{high_ct}** | 🟡 Medium risk: **{med_ct}** | 🟢 Low risk: **{12 - high_ct - med_ct}**\n\n"
            f"The class is performing at a **C+ average**. Immediate attention is needed for the {high_ct} high-risk students."
        )

    # GPA / grades general
    if any(word in q for word in ["gpa", "grade", "grades", "score"]):
        top    = max(STUDENTS, key=lambda s: s["gpa"])
        bottom = min(STUDENTS, key=lambda s: s["gpa"])
        return (
            f"**GPA Overview**\n\n"
            f"- Class average GPA: **{round(sum(s['gpa'] for s in STUDENTS) / len(STUDENTS), 2)}**\n"
            f"- Highest GPA: **{top['name']}** ({top['gpa']})\n"
            f"- Lowest GPA: **{bottom['name']}** ({bottom['gpa']})\n\n"
            f"Use the **Student Profiles** page for a detailed per-student breakdown."
        )

    return (
        "I can answer questions about:\n\n"
        "- **Specific students**: e.g., *'How is Marcus doing?'*\n"
        "- **Subjects**: e.g., *'How is the class doing in Math?'*\n"
        "- **Attendance**: e.g., *'Who has low attendance?'*\n"
        "- **At-risk students**: e.g., *'Who needs intervention?'*\n"
        "- **Class overview**: e.g., *'Give me a class summary'*"
    )


def page_ai_chat():
    st.title("💬 AI Education Assistant")
    st.caption("Demo mode: powered by synthetic data, no AWS required")
    st.divider()

    with st.expander("💡 Try these example questions"):
        st.markdown(
            "- How is Marcus doing?\n"
            "- Who is at risk?\n"
            "- How is the class performing in Math?\n"
            "- Which students have low attendance?\n"
            "- Give me a class overview\n"
            "- Tell me about Fatima"
        )

    if "demo_chat_history" not in st.session_state:
        st.session_state.demo_chat_history = []

    for msg in st.session_state.demo_chat_history:
        with st.chat_message(msg["role"], avatar="🧑‍🏫" if msg["role"] == "user" else "🤖"):
            st.markdown(msg["content"])

    question = st.chat_input("Ask about students, grades, attendance, risk levels...")
    if question:
        st.session_state.demo_chat_history.append({"role": "user", "content": question})
        with st.chat_message("user", avatar="🧑‍🏫"):
            st.markdown(question)
        with st.chat_message("assistant", avatar="🤖"):
            answer = _demo_ai_response(question)
            st.markdown(answer)
            st.session_state.demo_chat_history.append({"role": "assistant", "content": answer})


# ─────────────────────────────────────────────
# Page 5: System Info
# ─────────────────────────────────────────────

def page_system_info():
    st.title("⚙️ System Info")
    st.caption("Architecture, compliance, and tech stack details")
    st.divider()

    st.subheader("Tech Stack")
    stack_df = pd.DataFrame([
        {"Layer":       "LLM",              "Technology": "Amazon Bedrock: Claude 3 Haiku",    "Purpose": "AI-powered student analysis"},
        {"Layer":       "Embeddings",       "Technology": "Amazon Titan Embed Text v2",          "Purpose": "Semantic search over student data"},
        {"Layer":       "Vector Store",     "Technology": "FAISS",                               "Purpose": "Fast similarity search"},
        {"Layer":       "RAG Orchestration","Technology": "LangChain + LangGraph",               "Purpose": "Multi-agent retrieval pipeline"},
        {"Layer":       "API",              "Technology": "FastAPI + Uvicorn",                   "Purpose": "Backend REST endpoints"},
        {"Layer":       "Frontend",         "Technology": "Streamlit",                           "Purpose": "Interactive teacher dashboard"},
        {"Layer":       "Infrastructure",   "Technology": "AWS CDK + Terraform",                 "Purpose": "Cloud infrastructure as code"},
        {"Layer":       "Data Source",      "Technology": "Canvas LMS API (synthetic)",          "Purpose": "Student records and grades"},
    ])
    st.dataframe(stack_df, use_container_width=True, hide_index=True)

    st.divider()
    st.subheader("Privacy controls: what exists today")
    st.dataframe(pd.DataFrame([
        {"Control": "Synthetic data only", "Status": "Built"},
        {"Control": "API input validation (Pydantic)", "Status": "Built"},
        {"Control": "KMS-encrypted S3 bucket", "Status": "Defined in CDK, not deployed"},
        {"Control": "Bedrock Guardrail for PII", "Status": "Script exists, not applied to the chat chain"},
        {"Control": "Role-based access", "Status": "Not built (the role selector does not filter data)"},
        {"Control": "Audit logging (CloudTrail, app log)", "Status": "Not built"},
    ]), hide_index=True)
    st.caption("This demo is not FERPA compliant and has never handled real student records.")

    st.divider()
    st.subheader("Architecture Decisions")

    decisions = [
        ("Why FAISS?",       "In-memory vector search for low-latency RAG on student documents. No external vector DB dependency for local dev."),
        ("Why LangGraph?",   "Multi-agent orchestration: grading agent feeds into at-risk detection agent as a structured pipeline with shared state."),
        ("Why Bedrock?",     "Native AWS integration with IAM, KMS and Guardrails, so student data can stay inside the school's AWS account. The VPC setup is not built yet."),
        ("Why Haiku?",       "Lowest-cost Claude model for high-frequency teacher queries. Sufficient capability for structured data analysis tasks."),
        ("Why FastAPI?",     "Async endpoints support concurrent Streamlit users. Clean OpenAPI docs auto-generated for integration testing."),
        ("Guardrails Role",  "Planned: block SSNs and mask names and emails in model output. A script creates the guardrail; it is not yet applied to the chat chain."),
    ]
    for title, detail in decisions:
        with st.expander(f"- {title}"):
            st.write(detail)

    st.divider()
    st.subheader("Demo Mode Status")
    st.info(
        "**This deployment runs in demo mode.**\n\n"
        "No AWS credentials or Bedrock API calls are made. All student data is synthetic. "
        "Full mode (run locally with AWS credentials) calls Claude 3 Haiku on Amazon Bedrock and a FAISS "
        "index built from the same synthetic Canvas-format data. It has not been deployed."
    )
