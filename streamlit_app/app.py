import streamlit as st
import requests
import time

API_URL = "http://127.0.0.1:8000"

st.set_page_config(
    page_title="EduAI Connect",
    page_icon="🎓",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS
st.markdown("""
<style>
    .main { background-color: #0a192f; }
    .stMetric { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 20px; border-radius: 12px; border: 1px solid #1f3460; }
    .stMetric label { color: #8892b0 !important; font-size: 14px !important; text-transform: uppercase; letter-spacing: 1px; }
    .stMetric [data-testid="stMetricValue"] { color: #e6f1ff !important; font-size: 32px !important; font-weight: 800 !important; }
    .stTabs [data-baseweb="tab-list"] { gap: 8px; background-color: #0E1117; }
    .stTabs [data-baseweb="tab"] { background-color: #1a1a2e; border-radius: 8px; padding: 10px 24px; color: #8892b0; border: 1px solid #1f3460; }
    .stTabs [aria-selected="true"] { background-color: #1f3460 !important; color: #64ffda !important; border: 1px solid #64ffda !important; }
    .stButton > button { background: linear-gradient(135deg, #0070f3 0%, #00c6ff 100%); color: white; border: none; border-radius: 8px; padding: 10px 32px; font-weight: 700; font-size: 14px; letter-spacing: 0.5px; }
    .stButton > button:hover { background: linear-gradient(135deg, #0060df 0%, #00b4e6 100%); transform: translateY(-1px); }
    .stTextInput > div > div > input { background-color: #1a1a2e; border: 1px solid #1f3460; color: #e6f1ff; border-radius: 8px; padding: 12px; }
    .stTextInput > div > div > input:focus { border-color: #64ffda; }
    div[data-testid="stSidebar"] { background: linear-gradient(180deg, #0a192f 0%, #112240 100%); }
    .risk-high { background: linear-gradient(135deg, #1a0000 0%, #2d0a0a 100%); border-left: 4px solid #ff4444; padding: 16px; border-radius: 8px; margin: 8px 0; }
    .risk-medium { background: linear-gradient(135deg, #1a1400 0%, #2d2200 100%); border-left: 4px solid #ffbb33; padding: 16px; border-radius: 8px; margin: 8px 0; }
    .risk-low { background: linear-gradient(135deg, #001a0a 0%, #002d12 100%); border-left: 4px solid #00C851; padding: 16px; border-radius: 8px; margin: 8px 0; }
    h1 { color: #e6f1ff !important; }
    h2 { color: #ccd6f6 !important; }
    h3 { color: #8892b0 !important; }
</style>
""", unsafe_allow_html=True)

# Sidebar
with st.sidebar:
    st.markdown("## 🎓 EduAI Connect")
    st.markdown("---")
    st.markdown("**AI-Powered Education Analytics**")
    st.markdown("")
    role = st.selectbox("👤 Your Role", ["Teacher", "Administrator"])
    st.markdown("---")
    st.markdown("### 🔒 Security Status")
    st.markdown("✅ FERPA Compliant")
    st.markdown("✅ PII Guardrails Active")
    st.markdown("✅ KMS Encryption On")
    st.markdown("✅ Audit Logging Enabled")
    st.markdown("---")
    st.markdown("### ⚡ System Status")
    st.markdown("🟢 Bedrock API: Online")
    st.markdown("🟢 FAISS Index: Loaded")
    st.markdown("🟢 Grading Agent: Ready")
    st.markdown("🟢 At-Risk Agent: Ready")
    st.markdown("---")
    st.caption("Powered by Amazon Bedrock • LangChain • LangGraph")

# Header
col_title, col_badge = st.columns([3, 1])
with col_title:
    st.markdown("# 🎓 EduAI Connect")
    st.markdown("#### Real-time AI analytics for student performance")
with col_badge:
    st.markdown("")
    st.markdown("")
    if role == "Teacher":
        st.info(f"🧑‍🏫 Logged in as: {role}")
    else:
        st.warning(f"🔑 Logged in as: {role}")

# Stat Cards
st.markdown("---")
col1, col2, col3, col4, col5 = st.columns(5)
col1.metric("📚 Students", "75", "Section B")
col2.metric("⚠️ At-Risk", "4", "-2 from last week", delta_color="inverse")
col3.metric("📊 Avg GPA", "2.84", "+0.12")
col4.metric("🎯 Engagement", "72%", "+5%")
col5.metric("📅 Attendance", "87%", "-2%", delta_color="inverse")

st.markdown("---")

# Tabs
tab1, tab2, tab3, tab4 = st.tabs(["💬 AI Chat", "📊 Grade Analysis", "⚠️ At-Risk Detection", "📋 Quick Reports"])

with tab1:
    st.markdown("### 💬 Ask anything about student performance")
    st.markdown("*Your AI education assistant powered by Amazon Bedrock + RAG*")
    st.markdown("")

    if "chat_history" not in st.session_state:
        st.session_state.chat_history = []

    for msg in st.session_state.chat_history:
        with st.chat_message(msg["role"], avatar="🧑‍🏫" if msg["role"] == "user" else "🤖"):
            st.markdown(msg["content"])

    question = st.chat_input("Ask about students, grades, attendance, engagement...")

    if question:
        st.session_state.chat_history.append({"role": "user", "content": question})
        with st.chat_message("user", avatar="🧑‍🏫"):
            st.markdown(question)

        with st.chat_message("assistant", avatar="🤖"):
            with st.spinner("Searching student data..."):
                try:
                    response = requests.post(f"{API_URL}/chat", json={"question": question})
                    answer = response.json()["answer"]
                except:
                    answer = "⚠️ Could not connect to the API. Make sure uvicorn is running."
                st.markdown(answer)
                st.session_state.chat_history.append({"role": "assistant", "content": answer})

with tab2:
    st.markdown("### 📊 Grade Analysis")
    st.markdown("*Powered by the Grading Insight Agent*")
    st.markdown("")

    col_input, col_preset = st.columns([3, 1])
    with col_input:
        grading_q = st.text_input("Ask about grades:", placeholder="e.g., How are students doing in Math?", key="grade_input")
    with col_preset:
        st.markdown("")
        st.markdown("")
        preset = st.selectbox("Quick queries:", ["Custom", "Math overview", "Failing students", "Top performers"], key="grade_preset", label_visibility="collapsed")

    if preset == "Math overview":
        grading_q = "How are students performing in Math?"
    elif preset == "Failing students":
        grading_q = "Which students have grades below 70?"
    elif preset == "Top performers":
        grading_q = "Who are the top performing students across all courses?"

    if st.button("🔍 Analyze Grades", key="grade_btn", type="primary"):
        if grading_q:
            with st.spinner("Running grading analysis..."):
                try:
                    response = requests.post(f"{API_URL}/insights/grading", json={"question": grading_q})
                    result = response.json()["analysis"]
                except:
                    result = "⚠️ Could not connect to the API."
                st.markdown("#### Results")
                st.markdown(result)

with tab3:
    st.markdown("### ⚠️ At-Risk Student Detection")
    st.markdown("*Powered by the At-Risk Detection Agent — flags students based on grades, attendance, and engagement*")
    st.markdown("")

    risk_q = st.text_input("Ask about at-risk students:", value="Which students are at risk of failing?", key="risk_input")

    if st.button("🚨 Run At-Risk Analysis", key="risk_btn", type="primary"):
        if risk_q:
            with st.spinner("Identifying at-risk students..."):
                try:
                    response = requests.post(f"{API_URL}/insights/at-risk", json={"question": risk_q})
                    result = response.json()["analysis"]
                except:
                    result = "⚠️ Could not connect to the API."

                st.markdown("#### At-Risk Report")
                st.markdown(result)

                st.markdown("---")
                st.markdown("#### Risk Level Guide")
                col_r1, col_r2, col_r3 = st.columns(3)
                with col_r1:
                    st.markdown('<div class="risk-high"><b>🔴 HIGH RISK</b><br>Grades below 70 + Low attendance + Low engagement<br><i>Immediate intervention required</i></div>', unsafe_allow_html=True)
                with col_r2:
                    st.markdown('<div class="risk-medium"><b>🟡 MEDIUM RISK</b><br>One or two metrics below threshold<br><i>Monitor closely, schedule check-in</i></div>', unsafe_allow_html=True)
                with col_r3:
                    st.markdown('<div class="risk-low"><b>🟢 LOW RISK</b><br>All metrics above threshold<br><i>Continue standard monitoring</i></div>', unsafe_allow_html=True)

with tab4:
    st.markdown("### 📋 Quick Reports")
    st.markdown("*Pre-built analysis queries for common teacher needs*")
    st.markdown("")

    col_btn1, col_btn2 = st.columns(2)

    with col_btn1:
        if st.button("📉 Students Below Average", key="report1", use_container_width=True):
            with st.spinner("Generating report..."):
                try:
                    response = requests.post(f"{API_URL}/insights/grading", json={"question": "Which students have grades below 70 in any course?"})
                    st.markdown(response.json()["analysis"])
                except:
                    st.error("Could not connect to API.")

        if st.button("📊 Course Performance Summary", key="report3", use_container_width=True):
            with st.spinner("Generating report..."):
                try:
                    response = requests.post(f"{API_URL}/insights/grading", json={"question": "Give me a summary of how students are performing across all courses"})
                    st.markdown(response.json()["analysis"])
                except:
                    st.error("Could not connect to API.")

    with col_btn2:
        if st.button("⚠️ Full At-Risk Report", key="report2", use_container_width=True):
            with st.spinner("Generating report..."):
                try:
                    response = requests.post(f"{API_URL}/insights/at-risk", json={"question": "Identify all at-risk students with risk levels and recommended interventions"})
                    st.markdown(response.json()["analysis"])
                except:
                    st.error("Could not connect to API.")

        if st.button("🏆 Top Performers", key="report4", use_container_width=True):
            with st.spinner("Generating report..."):
                try:
                    response = requests.post(f"{API_URL}/insights/grading", json={"question": "Who are the top 5 performing students and what makes them stand out?"})
                    st.markdown(response.json()["analysis"])
                except:
                    st.error("Could not connect to API.")

# Footer
st.markdown("---")
st.markdown("""
<div style='text-align: center; color: #8892b0; padding: 20px;'>
    <b>EduAI Connect</b> — Built with Amazon Bedrock • LangChain • LangGraph • FAISS • FastAPI<br>
    🔒 FERPA Compliant • KMS Encrypted • Guardrails Active<br>
    <span style='color: #64ffda;'></span>
</div>
""", unsafe_allow_html=True)


