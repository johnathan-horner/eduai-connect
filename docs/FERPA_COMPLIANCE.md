# FERPA Compliance — EduAI Connect

## Overview

EduAI Connect processes student education records protected under the Family 
Educational Rights and Privacy Act (FERPA). This document outlines all technical 
safeguards implemented to ensure compliance.

## 1. Data Encryption

### At Rest
- All student data stored in S3 is encrypted using AWS KMS with automatic key rotation
- FAISS vector index files are stored in encrypted S3 buckets
- KMS key policy restricts access to authorized IAM roles only


### In Transit
- All API calls use TLS 1.2+ encryption
- VPC endpoints used for Bedrock API calls — traffic never crosses public internet
- HTTPS enforced on all FastAPI endpoints via API Gateway


## 2. Access Control

### IAM Least Privilege
- Lambda execution role can ONLY:
  - Call `bedrock:InvokeModel` for Claude and Titan models
  - Read from the specific student data S3 bucket
  - Write to CloudWatch logs
- No wildcard permissions (`*`) are used anywhere

### Role-Based Access
- **Teacher role:** Can only view students in their assigned sections
- **Administrator role:** Can view all students across all sections
- Role selection enforced at the Streamlit dashboard level
- API endpoints validate role before returning data


## 3. PII Protection

### Bedrock Guardrails
- Guardrail ID: [configured at deployment]
- **Blocked PII:** Social Security Numbers, Tax IDs, Credit Card Numbers
- **Anonymized PII:** Email addresses, Phone numbers, Names (when accessed by unauthorized roles)
- **Denied Topics:** Requests for home addresses, parent contact info, medical records
- Custom blocked messaging: "This response has been filtered to protect student privacy under FERPA."


### Synthetic Data for Development
- All development and testing uses synthetic student data generated with Python Faker
- No real student data is ever used in development, testing, or demos
- Synthetic data mirrors Canvas LMS API response format for realistic testing

## 4. Audit Trail

### CloudTrail
- All Bedrock API calls are logged with user attribution
- Logs include: who made the request, what model was called, when it happened
- CloudTrail logs stored in encrypted S3 bucket with 1-year retention


### CloudWatch
- Lambda invocation metrics: duration, errors, throttles
- API Gateway metrics: request count, latency, 4xx/5xx errors
- Custom dashboard for monitoring student data access patterns
- Alerts configured for unusual access patterns (potential breach indicator)

### Application Logging
- Every RAG query is logged with timestamp and user role
- Every agent invocation is logged with input question and output summary
- No student PII is included in application logs

## 5. Data Retention

- Student performance data retained for current academic year + 2 years
- Archived data moved to S3 Glacier after retention period
- Automated lifecycle policy configured on S3 bucket
- Data deletion requests processed within 30 days per FERPA requirements

## 6. AI Risk Management

### Bias Monitoring
- RAG pipeline evaluated against 15 test questions for accuracy and fairness
- At-risk detection thresholds are transparent and configurable (not black-box)
- Risk levels (high/medium/low) based on explicit criteria: grades <70, attendance <0.80, engagement <60


### Hallucination Prevention
- System prompt explicitly instructs Claude: "If the answer is not in the context, say you don't know"
- RAG grounds all responses in retrieved student data — no fabrication
- Evaluation notebook tests for hallucination with questions about non-existent students

### Adversarial Protection
- Input validation on all API endpoints via Pydantic models
- Bedrock Guardrails filter malicious prompts attempting to extract PII
- Rate limiting on API endpoints prevents abuse


## 7. Incident Response

- Security incidents reported to school district IT within 24 hours
- CloudTrail logs provide forensic evidence for investigation
- Affected student records can be isolated via S3 bucket versioning
- Guardrail configuration can be updated in real-time to block new attack vectors

## 8. Architecture Diagram

A diagram showing all encryption, access control, and audit points is not yet in
the repo. Until then, the data flow is: Canvas LMS, EventBridge, Lambda, S3 (KMS
encrypted), Titan Embeddings, FAISS, LangChain, Bedrock Claude, Guardrails, FastAPI,
Streamlit.

---

*This document is maintained as part of the EduAI Connect project and updated 
with each deployment. Last reviewed: [DATE]*