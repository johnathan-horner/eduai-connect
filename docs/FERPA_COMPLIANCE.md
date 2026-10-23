# Privacy design: EduAI Connect

EduAI Connect is a reference project. It has only ever used synthetic student data and has not been
deployed to a school or used with real student records. This page lists the privacy controls the
design calls for and what exists in the repo today. It is not a compliance certification, and nothing
here makes a deployment FERPA compliant on its own.

Status key: **Built** (in the code and exercised by the demo or tests), **Defined** (written as
infrastructure code but never deployed), **Not built**.

| Control | Status | Where |
|---|---|---|
| Synthetic data only (Canvas LMS format, generated with Faker) | Built | `src/etl/generate_data.py`, `data/` |
| Request validation on API inputs (Pydantic models) | Built | `src/api/main.py` |
| Explicit at-risk criteria in the agent prompt (grade below 70, attendance below 0.80, engagement below 60) | Built | `src/agents/at_risk_agent.py` |
| KMS key with rotation, KMS-encrypted S3 bucket for student data | Defined | `terraform/main.py` (an AWS CDK app despite the folder name) |
| CloudWatch log group with 1-year retention | Defined | `terraform/main.py` |
| Ingestion Lambda and EventBridge schedule | Defined | `terraform/main.py` |
| Bedrock Guardrail that blocks or masks PII | Partly built: a script can create the guardrail, but nothing applies it to the chat chain | `src/guardrails/bedrock_guardrails.py` |
| Role-based access (teacher vs administrator) | Not built: the dashboard has a role selector, but it does not change which students are shown | `streamlit_app/app.py` |
| CloudTrail audit logging | Not built | |
| Application audit log of queries and agent runs | Not built | |
| VPC endpoints for Bedrock, API Gateway, rate limiting | Not built | |
| Data retention and deletion workflow | Not built | |
| Measured RAG accuracy or hallucination rate | Not measured: `notebooks/rag_evaluation.ipynb` has no saved results | |

## What a real deployment would need

- Apply the Bedrock Guardrail to every model call and test it with PII red-team prompts.
- Real authentication and per-section authorization enforced in the API, not only the UI.
- CloudTrail and an application audit log for every query, with no student PII in logs.
- A data processing agreement with the school or district, retention and deletion procedures, and
  a review by the district's privacy officer.
