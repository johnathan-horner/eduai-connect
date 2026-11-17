"""EduAI Connect: what runs today on Streamlit Community Cloud.

Traced from origin/main: streamlit_app/streamlit_app.py (entry point), demo_pages.py, live_chat.py.
src/ (LangGraph agents, FAISS RAG, FastAPI), mcp_server.py and streamlit_app/app.py are local-only
and are not imported by the hosted app, so they are not drawn.
"""
from diagrams.aws.general import User
from diagrams.aws.ml import Bedrock

from archstyle import arch, aws_cloud, box, e, layer, linkedin, outside

OUT = "architecture"
with arch("EduAI Connect", "What runs today", OUT):
    teacher = User("Teacher (visitor)")
    with outside("Streamlit Community Cloud"):
        with layer("App"):
            router = box("streamlit_app.py\npage router")
            pages = box("Dashboard pages\nclass, at-risk, profiles,\nsystem info")
        with layer("Grounded chat (live_chat.py)", margin=36):
            chat = box("answer_question\nmax 10 live AI calls / session\nno key, cap or error:\nrecords only, no AI answer")
            retr = box("Keyword retrieval\nnamed students, else whole\nclass sorted by topic")
            cite = box("Citation check\ncited IDs vs retrieved")
        with layer("Data"):
            records = box("12 synthetic student records\ninline in demo_pages.py\n(risk levels preset)")
        with layer("Governance"):
            audit = box("Audit log (JSON Lines)\non app disk,\nresets on restart")
            secrets = box("Streamlit secrets [aws]\naccess key + region")
    with aws_cloud():
        with layer("Generative AI", margin=40):
            llm = Bedrock("Amazon Bedrock\nClaude Haiku 4.5\n(us. inference profile)")

    teacher >> e("HTTPS") >> router
    router >> e("renders page") >> pages
    router >> e("chat question") >> chat
    pages >> e("reads records") >> records
    chat >> e("question") >> retr
    retr >> e("keyword match") >> records
    chat >> e("reads [aws] key") >> secrets
    chat >> e("Converse API (SigV4):\nrecords + question", minlen="2", headport="n") >> llm
    chat >> e("answer text") >> cite
    chat >> e("appends 1 entry per answer") >> audit
linkedin(OUT)
