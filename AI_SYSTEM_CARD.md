# AI system card: EduAI Connect

**Status:** reference project, in progress. Synthetic data only. Not deployed to any school and not
used with real students.
**Built by:** Shoot It Analytics LLC (independent reference project)
**Last updated:** October 2026

## Intended use

Help a teacher see which students in a class may be falling behind and what to try next, by asking
questions about grades, attendance and engagement in plain language. A teacher makes every decision;
the system only suggests.

Out of scope: grading, discipline, placement or any decision about a student without a teacher's
review; use with real student records before the controls in `docs/FERPA_COMPLIANCE.md` are built.

## How it works

- **Data:** synthetic students, courses, assignments and submissions in Canvas LMS API format
  (`src/etl/generate_data.py`).
- **Retrieval:** records are turned into text documents, embedded with Amazon Titan Text Embeddings
  v2 and stored in a FAISS index. Questions are rewritten into search queries and results are
  re-ranked before the model answers.
- **Model:** Claude 3 Haiku on Amazon Bedrock (`anthropic.claude-3-haiku-20240307-v1:0`).
- **Agents:** a LangGraph workflow with a Grading Agent (grade trends) and an At-Risk Agent. The
  At-Risk Agent asks the model to apply three explicit criteria: grade below 70, attendance below
  0.80, engagement below 60.
- **Hosted app:** a fixed sample of 12 synthetic students with preset risk levels. Its chat calls
  Claude Haiku 4.5 on Amazon Bedrock (`us.anthropic.claude-haiku-4-5-20251001-v1:0`) only when the
  app has `[aws]` secrets, answers only from keyword-retrieved records, shows those records under
  each answer, caps live requests at 10 per session and writes one audit log entry per answer.
  Without credentials it shows the matching records and states that no AI answer was generated.
  The Bedrock PII guardrail is not applied.

## Evaluation

No accuracy, false positive rate or hallucination rate has been measured. The evaluation notebook
(`notebooks/rag_evaluation.ipynb`) has no saved results. Automated tests check that every demo page
renders, the synthetic data loads, and the API answers its health check.

## Limits and risks

- Synthetic data does not reflect real classrooms, so any future accuracy number on it would not
  carry over to real students.
- A model applying thresholds can still misread or miss records it was not shown; retrieval returns
  only the top 4 documents.
- Labeling a student "at risk" can stigmatize them. The design keeps a teacher in the loop for every
  recommendation.
- Privacy controls are partly designed and partly built; see `docs/FERPA_COMPLIANCE.md`.

## Before any real use

Measure accuracy and false positives on de-identified historical data with the school's permission,
test for differences across student groups, build the missing privacy controls, and complete the
district's privacy review.
