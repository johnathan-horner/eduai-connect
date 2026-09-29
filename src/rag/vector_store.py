from langchain_aws import BedrockEmbeddings
from langchain_community.vectorstores import FAISS
from document_loader import load_documents

embeddings = BedrockEmbeddings(model_id="amazon.titan-embed-text-v2:0")
documents = load_documents()
vector_store = FAISS.from_documents(documents, embeddings)
# Save the vector store to disk for later use
vector_store.save_local("faiss_index")
print("Vector store created and saved locally as 'faiss_index'")

results = vector_store.similarity_search("which students are failing")
for r in results[:3]:
    print(r.page_content)
    print("---")