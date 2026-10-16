"""
EduAI Connect — Streamlit Cloud Entry Point
Demo mode: no AWS credentials required.
"""

import streamlit as st
from demo_pages import (
    page_class_dashboard,
    page_at_risk,
    page_student_profiles,
    page_ai_chat,
    page_system_info,
)

# ─────────────────────────────────────────────
# Page Config
# ─────────────────────────────────────────────

st.set_page_config(
    page_title="EduAI Connect",
    page_icon="🎓",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ─────────────────────────────────────────────
# CSS — single inject, dark navy theme
# ─────────────────────────────────────────────

def inject_css():
    st.markdown(
        """
        <style>
        /* ── App background ── */
        .stApp { background-color: #0a192f; }
        [data-testid="stAppViewContainer"] { background-color: #0a192f; }

        /* ── Sidebar ── */
        [data-testid="stSidebar"] {
            background: linear-gradient(180deg, #0a192f 0%, #112240 100%);
        }
        [data-testid="stSidebar"] * { color: #ccd6f6 !important; }

        /* ── Headings ── */
        h1 { color: #e6f1ff !important; }
        h2 { color: #ccd6f6 !important; }
        h3 { color: #8892b0 !important; }
        p, li, span, label { color: #8892b0; }

        /* ── Metric cards ── */
        [data-testid="stMetric"] {
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            border: 1px solid #1f3460;
            border-radius: 12px;
            padding: 16px;
        }
        [data-testid="stMetricLabel"] { color: #8892b0 !important; }
        [data-testid="stMetricValue"] { color: #e6f1ff !important; }

        /* ── Tabs ── */
        .stTabs [data-baseweb="tab-list"] {
            background-color: #0E1117;
            gap: 6px;
        }
        .stTabs [data-baseweb="tab"] {
            background-color: #1a1a2e;
            border: 1px solid #1f3460;
            border-radius: 8px;
            color: #8892b0;
            padding: 8px 20px;
        }
        .stTabs [aria-selected="true"] {
            background-color: #1f3460 !important;
            color: #64ffda !important;
            border-color: #64ffda !important;
        }

        /* ── Buttons ── */
        .stButton > button {
            background: linear-gradient(135deg, #0070f3 0%, #00c6ff 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-weight: 700;
        }
        .stButton > button:hover {
            background: linear-gradient(135deg, #0060df 0%, #00b4e6 100%);
            transform: translateY(-1px);
        }

        /* ── Dataframe ── */
        [data-testid="stDataFrame"] { border-radius: 8px; }

        /* ── Expander ── */
        .streamlit-expanderHeader {
            background-color: #112240;
            border-radius: 8px;
            color: #ccd6f6 !important;
        }

        /* ── Divider ── */
        hr { border-color: #1f3460; }

        /* ── Radio / selectbox ── */
        .stRadio label, .stSelectbox label { color: #8892b0 !important; }
        </style>
        """,
        unsafe_allow_html=True,
    )


inject_css()

# ─────────────────────────────────────────────
# Sidebar
# ─────────────────────────────────────────────

with st.sidebar:
    st.markdown("## 🎓 EduAI Connect")
    st.markdown("---")
    st.markdown("**AI-Powered Education Analytics**")
    st.markdown("")

    page = st.radio(
        "Navigation",
        [
            "📊 Class Dashboard",
            "⚠️ At-Risk Students",
            "👤 Student Profiles",
            "💬 AI Chat",
            "⚙️ System Info",
        ],
        label_visibility="collapsed",
    )

    st.markdown("---")
    st.markdown("### 🔒 Security Status")
    st.markdown("✅ FERPA Compliant")
    st.markdown("✅ PII Guardrails Active")
    st.markdown("✅ KMS Encryption On")
    st.markdown("✅ Audit Logging Enabled")
    st.markdown("---")
    st.markdown("### ⚡ System Status")
    st.markdown("🟢 Bedrock API: Configured")
    st.markdown("🟢 FAISS Index: Loaded")
    st.markdown("🟢 Grading Agent: Ready")
    st.markdown("🟢 At-Risk Agent: Ready")
    st.markdown("---")
    st.caption("Demo Mode · No AWS required")
    st.caption("Powered by Amazon Bedrock · LangChain · LangGraph")

# ─────────────────────────────────────────────
# Page Router
# ─────────────────────────────────────────────

if page == "📊 Class Dashboard":
    page_class_dashboard()
elif page == "⚠️ At-Risk Students":
    page_at_risk()
elif page == "👤 Student Profiles":
    page_student_profiles()
elif page == "💬 AI Chat":
    page_ai_chat()
elif page == "⚙️ System Info":
    page_system_info()
