# EduAI Connect

**Status: In progress.** The demo runs today, locally and on Streamlit Cloud, but it shows a fixed
sample of synthetic students with preset risk levels; it does not call the AI. Full mode (RAG and
agents on Amazon Bedrock) runs locally with AWS credentials, but its accuracy has not been measured
and it has never been deployed.

Independent reference project by Shoot It Analytics LLC. Built with public or synthetic data.

Demo (Streamlit Cloud, demo mode): https://eduai-connect-horner.streamlit.app

## What it does

EduAI Connect is meant to help a teacher see which students may be falling behind and what to try
next, by asking plain-language questions about grades, attendance and engagement.

- **Demo mode** (no AWS): a class dashboard, an at-risk list, student profiles, a chat page with
  template answers and a system page, all built on a fixed sample of 12 synthetic students whose
  risk levels are preset in the code.
- **Full mode** (AWS credentials): synthetic student records are embedded with Amazon Titan Text
  Embeddings v2 into a FAISS index; questions are rewritten, results re-ranked, and Claude 3 Haiku on
  Amazon Bedrock answers. A LangGraph workflow runs a Grading Agent and an At-Risk Agent; the
  At-Risk Agent asks the model to apply three explicit criteria (grade below 70, attendance below
  0.80, engagement below 60). A FastAPI backend serves `/health`, `/chat`, `/insights/grading` and
  `/insights/at-risk`.
- An MCP server (`mcp_server.py`) exposes the same analytics to MCP clients.

All student data is synthetic, in Canvas LMS API format. No real student records have been used.

## Why I built this

**The problem.** Teachers often learn that a student is struggling only after a failed test or
report card, when it is late to help. The signals are usually already in the school's systems
(grades, attendance, assignment completion) but spread across screens nobody has time to read.

**What I set out to prove.** Whether a retrieval-and-agents design can answer a teacher's plain
questions about their class from those records, with explicit and explainable at-risk criteria, while
keeping student data inside the school's own cloud account.

**Key design decisions**
- **Data:** synthetic Canvas-format records only, so the design can be shown without any student data.
- **Explainable criteria:** the at-risk thresholds are written in the prompt and documented, not
  learned from data nobody can inspect.
- **Model:** Claude 3 Haiku for low cost per question; Titan embeddings and FAISS so the index can
  live in the school's AWS account.
- **Guardrails (partly built):** a script creates a Bedrock Guardrail for PII, but it is not applied
  to the chat chain yet. See [docs/FERPA_COMPLIANCE.md](docs/FERPA_COMPLIANCE.md) for what is built.
- **Cost:** the demo needs no AWS account; full mode uses the cheapest Claude model.

**Results.** No accuracy, false positive rate or hallucination rate has been measured yet. What is
measured: 11 automated tests (every demo page renders, the synthetic data loads, the API answers its
health check, the MCP server imports).

**Limits.** Synthetic data only; never used with real students. Not FERPA compliant as it stands,
and not a certified or regulated product. Several privacy controls are designed but not built.

**What I'd do next in a real deployment.** Apply the guardrail to every model call, add real
authentication and per-section access in the API, add audit logging, measure accuracy and false
positives on de-identified historical data with the school's permission, test for differences across
student groups, and complete the district's privacy review.

## Architecture

```mermaid
flowchart LR
    D[Synthetic Canvas-format data] --> E[Titan embeddings]
    E --> F[(FAISS index)]
    Q[Teacher question] --> R[Query rewrite]
    R --> F
    F --> RR[Re-rank]
    RR --> G[LangGraph: Grading Agent, At-Risk Agent]
    G --> H[Claude 3 Haiku on Bedrock]
    H --> A[FastAPI]
    A --> S[Streamlit dashboard]
```

Infrastructure as code: `terraform/main.py` is an AWS CDK app (despite the folder name) that defines
a KMS key, a KMS-encrypted S3 bucket, a log group, an ingestion Lambda and EventBridge schedules. It
has not been deployed.

## How to run

```bash
git clone https://github.com/johnathan-horner/eduai-connect.git
cd eduai-connect
```

Demo mode (no AWS account needed):

```bash
pip install -r requirements.txt
streamlit run streamlit_app/streamlit_app.py
```

Full mode (Python 3.11+, AWS credentials that can call Bedrock, model access for Claude 3 Haiku and
Titan Text Embeddings v2):

```bash
pip install -r requirements-full.txt
python3 src/etl/generate_data.py      # synthetic data
python3 src/rag/vector_store.py       # build the FAISS index
uvicorn src.api.main:app --reload     # API
streamlit run streamlit_app/app.py    # dashboard, in a second terminal
```

On an Intel Mac running macOS 12, install `faiss-cpu==1.10.0` first (newer versions have no wheel).

MCP server: `python3 mcp_server.py` (installed by `requirements-full.txt`).

Tests: `pip install pytest httpx` then `pytest`.

## Measured results

| What | Result | How |
|---|---|---|
| Automated tests | 11 (9 pass without the full dependencies; all 11 run in CI) | `pytest` |
| At-risk accuracy, false positives, hallucination rate | Not measured | The evaluation notebook has no saved results |

## Limits

- Demo mode shows preset risk levels for 12 synthetic students. It does not compute them.
- Full mode retrieves only the top 4 records per question, so it can miss students.
- The dashboard's role selector (teacher or administrator) does not change which data is shown.
- The Bedrock Guardrail is not applied; there is no audit logging and no authentication.
- Synthetic data does not reflect real classrooms.

## What's next

- Measure the At-Risk Agent on a labeled synthetic set (precision and recall per risk level).
- Apply the guardrail to every model call and test it with PII red-team prompts.
- Compute demo-mode risk levels from the data instead of presetting them.
- Move `cloudspace-deploy/` and `portfolio-index.html` out of this repo.

## More docs

- [docs/FERPA_COMPLIANCE.md](docs/FERPA_COMPLIANCE.md): privacy controls, built and not built
- [AI_SYSTEM_CARD.md](AI_SYSTEM_CARD.md): what the AI does and its limits
- `docs/decisions/`: architecture decision records
- [CONTRIBUTING.md](CONTRIBUTING.md)
