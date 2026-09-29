from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

import boto3
from langchain_aws import ChatBedrockConverse, BedrockEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

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

prompt = ChatPromptTemplate.from_template("""
You are an education analytics assistant identifying at-risk students.
Analyze the student data below. A student is at risk if they have:
- Grades below 70 (D or lower)
- Attendance rate below 0.80
- Engagement score below 60
Flag each at-risk student with a risk level (high/medium/low) and recommend actions.

Context:
{context}

Question:
{question}

At-Risk Analysis:
""")

chain = prompt | llm | StrOutputParser()


class State(TypedDict):
    question: str
    context: str
    result: str

def at_risk_node(state: State) -> dict:
    question = state["question"]
    docs = retriever.invoke(question)
    context = "\n\n".join([doc.page_content for doc in docs])
    answer = chain.invoke({
        "context": context,
        "question": question,
        "chat_history": ""
    })
    return {"result": answer, "context": context}
graph = StateGraph(State)
graph.add_node("at_risk", at_risk_node)
graph.add_edge(START, "at_risk")
graph.add_edge("at_risk", END)

app = graph.compile()

res = app.invoke({
    "question": "Which student is at risk of failing based on low grades, attendance, and assignment completion?",
    "context": "Student A got a B in the last test, has missed 3 classes, and has completed all assignments.\n\nStudent B got a D in the last test, has missed 10 classes, and has not completed several assignments.\n\nStudent C got an A in the last test, has perfect attendance, and has completed all assignments.",      

    "result": ""
})

print(res)