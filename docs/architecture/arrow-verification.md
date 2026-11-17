# Arrow check

Every arrow that touches an AWS service, with the official AWS page that confirms it and its direction. Arrows between non-AWS parts (Streamlit, Gemini, SQLite, scikit-learn and so on) were checked against the code only. Links come from docs.aws.amazon.com only.

## architecture.png (live)

| From | To | Action | AWS doc |
|---|---|---|---|
| Record retrieval (Streamlit app) | Amazon Bedrock, Claude Haiku 4.5 | Converse API, us. inference profile | https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html |
| IAM user | Amazon Bedrock | Authorizes the call (Converse needs bedrock:InvokeModel) | https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_InvokeModel.html |
| Amazon Bedrock | Audit log | Converse response returns the answer, which the app logs | https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html |

## UNVERIFIED

None.
