from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END
import boto3
from langchain_aws import ChatBedrockConverse, BedrockEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

# -------------------------
# Bedrock / FAISS Setup
# -------------------------
region = "us-east-1"
bedrock_runtime = boto3.client(service_name="bedrock-runtime", region_name=region)

llm = ChatBedrockConverse(
    client=bedrock_runtime,
    model="us.anthropic.claude-3-haiku-20240307-v1:0",
    temperature=0, max_tokens=1000
)

embeddings = BedrockEmbeddings(client=bedrock_runtime, model_id="amazon.titan-embed-text-v2:0")
vectorstore = FAISS.load_local("faiss_index", embeddings, allow_dangerous_deserialization=True)
retriever = vectorstore.as_retriever(search_kwargs={"k": 4})

# -------------------------
# Prompts — one per agent
# -------------------------
grading_prompt = ChatPromptTemplate.from_template("""
You are an education analytics assistant analyzing student grades.
Identify grade trends, students with low scores, and any concerns.

Context:
{context}

Question:
{question}

Grading Analysis:
""")

at_risk_prompt = ChatPromptTemplate.from_template("""
You are an education analytics assistant identifying at-risk students.
A student is at risk if they have:
- Grades below 70 (D or lower)
- Attendance rate below 0.80
- Engagement score below 60
Use the grading analysis below to inform your assessment.
Flag each at-risk student with a risk level (high/medium/low) and recommend actions.

Grading Analysis:
{grading_result}

Context:
{context}

Question:
{question}

At-Risk Analysis:
""")

grading_chain = grading_prompt | llm | StrOutputParser()
at_risk_chain = at_risk_prompt | llm | StrOutputParser()

# -------------------------
# State — shared between both agents
# -------------------------
class State(TypedDict):
    question: str
    context: str
    grading_result: str
    at_risk_result: str

# -------------------------
# Node 1: Grading Agent
# -------------------------
def grading_node(state: State) -> dict:
    question = state["question"]
    docs = retriever.invoke(question)
    context = "\n\n".join([doc.page_content for doc in docs])
    result = grading_chain.invoke({"context": context, "question": question})
    return {"grading_result": result, "context": context}

# -------------------------
# Node 2: At-Risk Agent — reads grading_result from state
# -------------------------
def at_risk_node(state: State) -> dict:
    result = at_risk_chain.invoke({
        "context": state["context"],
        "question": state["question"],
        "grading_result": state["grading_result"]
    })
    return {"at_risk_result": result}

# -------------------------
# Graph: grading → at_risk
# -------------------------
graph = StateGraph(State)
graph.add_node("grading", grading_node)
graph.add_node("at_risk", at_risk_node)
graph.add_edge(START, "grading")
graph.add_edge("grading", "at_risk")
graph.add_edge("at_risk", END)

app = graph.compile()

# -------------------------
# Run it
# -------------------------
if __name__ == "__main__":
    res = app.invoke({
        "question": "Analyze student performance and identify who is at risk",
        "context": "",
        "grading_result": "",
        "at_risk_result": ""
    })

    print("=== GRADING ANALYSIS ===")
    print(res["grading_result"])
    print("\n=== AT-RISK ANALYSIS ===")
    print(res["at_risk_result"])