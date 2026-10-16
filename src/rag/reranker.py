from langchain_core.prompts import PromptTemplate
from langchain_aws import ChatBedrockConverse
import boto3

# Create a prompt template that reranks retrieved documents by relevance 

rerank_template = """You are given a question and 4 student profiles. 
Pick the 2 most relevant profiles for answering the question.
Return ONLY the selected profiles, nothing else.

Question: {question}

Student Profiles:
{documents}

Most relevant profiles:"""

rerank_prompt = PromptTemplate(
    input_variables=["question", "documents"],
    template=rerank_template,
)


region = "us-east-1"
bedrock_runtime = boto3.client(service_name="bedrock-runtime", region_name=region)

llm = ChatBedrockConverse(
    client=bedrock_runtime,
    model="us.anthropic.claude-3-haiku-20240307-v1:0",
    temperature=0, max_tokens=1000,
)


# Generate a search query from the original question
def rerank_docs(question: str, docs: list) -> str:
    docs_text = "\n\n---\n\n".join([doc.page_content for doc in docs])
    prompt = rerank_prompt.format(question=question, documents=docs_text)
    response = llm.invoke(prompt)
    return getattr(response, "content", str(response))


if __name__ == "__main__":
    from document_loader import load_documents
    docs = load_documents()[:4]  # grab first 4 docs to test
    result = rerank_docs("who is failing physics", docs)
    print(result)