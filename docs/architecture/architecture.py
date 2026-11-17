"""EduAI Connect: what runs today (live on Streamlit Community Cloud)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from diagrams import Diagram
from diagrams.aws.ml import Bedrock
from diagrams.aws.security import IAM
from diagrams.onprem.client import User

from style import EDGE, GRAPH, NODE, area, flow, icon, primary, soft

with Diagram("EduAI Connect  |  Live architecture",
             filename=str(Path(__file__).with_name("architecture")), outformat="png", direction="TB",
             show=False, graph_attr=GRAPH, node_attr=NODE, edge_attr=EDGE):
    user = User("Teacher\n(browser)")

    with area("Streamlit Community Cloud", "host"):
        app = icon("streamlit", "Streamlit app\ndashboard, at-risk,\nprofiles, AI chat")
        with area("Data"):
            records = icon("database-green", "12 synthetic\nstudent records")
        with area("Grounded chat"):
            cap = icon("gauge-red", "Session cap\n10 live answers")
            retrieve = icon("search-ink", "Record retrieval\nby name, topic, subject")
        with area("Audit"):
            audit = icon("scroll-text-green", "Audit log (JSON Lines)\none entry per answer")

    with area("AWS Cloud  (us-east-1)", "aws"):
        iam = IAM("IAM user\nallowed: Haiku 4.5 only")
        bedrock = Bedrock("Amazon Bedrock\nClaude Haiku 4.5\nUS inference profile")

    user >> flow("question") >> app
    app >> flow("dashboards") >> records
    app >> flow("chat question") >> cap
    cap >> flow("under cap") >> retrieve
    records >> flow("matching\nrecords") >> retrieve
    retrieve >> primary("Converse API\nanswer only from these\nrecords, cite their IDs") >> bedrock
    iam >> soft() >> bedrock
    bedrock >> primary("answer + cited IDs") >> audit
    cap >> soft("over cap or no keys:\nshow records, no AI answer") >> audit
