# EduAI Connect

**Status:** Working demo, still in development. Demo mode runs without an AWS account. Full mode needs Amazon Bedrock access. Three items in this repo belong to other projects and will move out once they have their own repos: `cdk-ai-constructs/`, `cloudspace-deploy/`, and `portfolio-index.html`.

Demo (Streamlit Cloud, demo mode): https://eduai-connect-horner.streamlit.app

## What it does

EduAI Connect helps teachers spot students who are falling behind before it is too late to help. It reads student grades, attendance, and engagement data, flags at-risk students, and suggests what to do next.

- Flags at-risk students with a high, medium, or low risk level
- Recommends interventions for each flagged student
- Lets teachers ask plain-language questions about their class, with follow-up questions
- Filters personal information with Bedrock Guardrails to support FERPA requirements
- Uses synthetic student data only (in Canvas LMS API format), never real student records

How it works:

- A RAG pipeline turns student records into documents, embeds them with Amazon Titan Text Embeddings v2, and stores them in a FAISS index.
- Questions are rewritten into better search queries, results are re-ranked, and Claude 3 Haiku on Amazon Bedrock writes the answer.
- Two agents run in a LangGraph workflow: a Grading Agent reviews grade trends, then an At-Risk Agent combines grades, attendance, and engagement into a risk level.
- A FastAPI backend exposes the features, and a Streamlit dashboard sits on top.

API endpoints:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Health check |
| POST | `/chat` | Questions and answers about student performance |
| POST | `/insights/grading` | Grade analysis from the Grading Agent |
| POST | `/insights/at-risk` | At-risk detection from the At-Risk Agent |

## How to run it

```bash
git clone https://github.com/johnathan-horner/eduai-connect.git
cd eduai-connect
```

### Demo mode (no AWS account needed)

```bash
pip install -r requirements.txt
streamlit run streamlit_app/streamlit_app.py
```

### Full mode (uses Amazon Bedrock)

Requirements:

- Python 3.11 or newer
- AWS CLI configured with credentials that can call Bedrock
- Bedrock model access enabled for Claude 3 Haiku and Titan Text Embeddings v2

```bash
pip install -r requirements-full.txt

# Generate synthetic data and build the vector index
python3 src/etl/generate_data.py
python3 src/rag/vector_store.py

# Start the API
uvicorn src.api.main:app --reload

# In a second terminal, start the dashboard
streamlit run streamlit_app/app.py
```

Then open http://localhost:8501.

On an Intel Mac running macOS 12, the newest `faiss-cpu` has no prebuilt wheel. Install `faiss-cpu==1.10.0` first.

### MCP server

`mcp_server.py` exposes education analytics tools to MCP clients. It is installed by `requirements-full.txt`.

```bash
python3 mcp_server.py
```

### Tests

```bash
pip install pytest flake8
pytest
```

## What's planned

- Move `cdk-ai-constructs/`, `cloudspace-deploy/`, and `portfolio-index.html` into their own repos
- Swap FAISS for OpenSearch Serverless in production (the infrastructure stack is already designed for this)
- Add more agents, such as attendance tracking and intervention follow-up
- Connect to a live Canvas LMS instance instead of synthetic data
- Pin versions in `requirements-full.txt`
- Add an architecture diagram (the old one was an empty file)

## More docs

- `docs/FERPA_COMPLIANCE.md`: privacy and compliance notes
- `AI_SYSTEM_CARD.md`: what the AI does, its limits, and how it is governed
- `docs/decisions/`: architecture decision records
- `CONTRIBUTING.md`: how to contribute

## Privacy

See `docs/FERPA_COMPLIANCE.md` for the full compliance notes. Development uses synthetic data only.

Built by Johnathan Horner.
