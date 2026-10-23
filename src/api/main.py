from fastapi import FastAPI
from pydantic import BaseModel
import boto3
from langchain_aws import ChatBedrockConverse, BedrockEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

app = FastAPI()

# Bedrock setup: ONE time only
region = "us-east-1"
bedrock_runtime = boto3.client(service_name="bedrock-runtime", region_name=region)
llm = ChatBedrockConverse(client=bedrock_runtime, model="us.anthropic.claude-3-haiku-20240307-v1:0", temperature=0, max_tokens=1000)
embeddings = BedrockEmbeddings(client=bedrock_runtime, model_id="amazon.titan-embed-text-v2:0")
vectorstore = FAISS.load_local("faiss_index", embeddings, allow_dangerous_deserialization=True)
retriever = vectorstore.as_retriever(search_kwargs={"k": 4})

prompt = ChatPromptTemplate.from_template("""
You are an education analytics assistant.
Use the context below to answer the question. If the answer is not in the context, say you don't know.

Context:
{context}

Question:
{question}

Answer:
""")

chain = prompt | llm | StrOutputParser()

class QuestionRequest(BaseModel):
    question: str

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/chat")
async def chat(request: QuestionRequest):
    docs = retriever.invoke(request.question)
    context = "\n\n".join([doc.page_content for doc in docs])
    answer = chain.invoke({"context": context, "question": request.question})
    return {"answer": answer}

@app.post("/insights/grading")  
async def grading(request: QuestionRequest):
    docs = retriever.invoke(request.question)
    context = "\n\n".join([doc.page_content for doc in docs])
    grading_prompt = ChatPromptTemplate.from_template("""
You are an education analytics assistant analyzing student grades.
Identify grade trends, students with low scores, and any concerns.

Context:
{context}

Question:
{question}

Grading Analysis:
""")
    grading_chain = grading_prompt | llm | StrOutputParser()
    answer = grading_chain.invoke({"context": context, "question": request.question})
    return {"analysis": answer}

@app.post("/insights/at-risk")
async def at_risk(request: QuestionRequest):
    docs = retriever.invoke(request.question)
    context = "\n\n".join([doc.page_content for doc in docs])
    risk_prompt = ChatPromptTemplate.from_template("""
You are an education analytics assistant identifying at-risk students.
A student is at risk if they have:
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
    risk_chain = risk_prompt | llm | StrOutputParser()
    answer = risk_chain.invoke({"context": context, "question": request.question})
    return {"analysis": answer}

# -------------------------