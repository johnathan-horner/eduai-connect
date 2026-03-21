# EduAI Connect -- AI-Powered Education Analytics Platform

**FERPA-Compliant | Amazon Bedrock | LangGraph | Multi-Agent RAG**

**Live Demo:** https://eduai-connect-horner.streamlit.app

EduAI Connect helps teachers proactively identify at-risk students using AI-driven insights. A teacher types a natural language question like "who needs help in Math?" and the system analyzes every student's grades, attendance, and engagement data, returning specific students with risk levels (HIGH/MEDIUM/LOW) and recommended interventions. Built on Amazon Bedrock with full FERPA compliance enforced at the infrastructure level.

## Tech Stack

| Layer | Technology |
|---|---|
| AI/ML | Amazon Bedrock (Claude 3 Sonnet, Titan Embeddings) |
| RAG Framework | LangChain 0.3, LCEL |
| Agent Orchestration | LangGraph (StateGraph) |
| Vector Store | FAISS |
| API Backend | FastAPI |
| Dashboard | Streamlit |
| Infrastructure | AWS CDK (Python) |
| Security | Bedrock Guardrails, KMS, IAM, CloudTrail |

## Architecture

**Data Flow:** Canvas LMS -> EventBridge -> Lambda -> S3 (KMS Encrypted) -> Titan Embeddings -> FAISS -> LangChain LCEL -> Bedrock Claude -> Guardrails -> FastAPI -> Streamlit

**Agent Orchestration:** START -> Grading Agent -> At-Risk Detection Agent -> END

## Key Architecture Decisions

- **RAG over fine-tuning:** student data stays in FAISS/S3, never baked into model weights. Supports FERPA requirements for data deletion, auditing, and access control
- **HyDE query transformation:** generates a hypothetical answer first, embeds that, and uses it as the search query -- produces significantly better retrieval than embedding the raw question
- **LangGraph over simple functions:** shared TypedDict state enables grading analysis to directly inform risk scoring. Adding new agents requires only a new node and edge
- **FAISS for dev, OpenSearch Serverless for prod:** CDK stack designed for the swap -- vector store interface abstracted so migration requires one config change

## FERPA Compliance

| Control | Implementation |
|---|---|
| Encryption at Rest | KMS CMK with auto key rotation |
| Encryption in Transit | TLS 1.2+ |
| Access Control | IAM least-privilege, scoped to specific ARNs |
| PII Protection | Bedrock Guardrails -- SSNs blocked, names anonymized |
| Audit Trail | CloudTrail logs every Bedrock API call |
| Data Privacy | Synthetic data only -- no real student data |

## Demo Queries

| Question | What It Does |
|---|---|
| "Who needs help in Math?" | Finds students with low Math grades |
| "Which students are at risk?" | Full at-risk analysis with risk levels |
| "Tell me about Marcus Johnson" | Full student profile with grades and trends |
| "How is my class doing overall?" | Class-wide performance summary |

## Quick Start

- Clone the repo
- `pip install requirements`
- Run in demo mode: `DEMO_MODE=true streamlit run streamlit_app/streamlit_app.py`
- For full AWS mode: configure Bedrock credentials and run `vector_store.py` first

---

**Built by Johnathan Horner**
AWS Solutions Architect Professional | AWS Certified Generative AI Professional
[resume.johnathancloudspace.com](https://resume.johnathancloudspace.com)