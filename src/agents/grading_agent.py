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
You are an education analytics assistant analyzing student grades.
Given the student data below, provide a detailed grading analysis.
Identify grade trends, students with low scores, and any concerns.

Context:
{context}

Question:
{question}

Analysis:
""")

chain = prompt | llm | StrOutputParser()


class State(TypedDict):
    question: str
    context: str
    result: str

def grading_node(state: State) -> dict:
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
graph.add_node("grading", grading_node)
graph.add_edge(START, "grading")
graph.add_edge("grading", END)

app = graph.compile()

res = app.invoke({
    "question": "What is the highest grade in English?",
    "context": "Student A got an A, Student B got a B.",
    "result": ""
})

print(res)