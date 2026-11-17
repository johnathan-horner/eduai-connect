"""EduAI Connect: production design (not deployed).

Drawn from terraform/main.py on origin/main, which is an AWS CDK (Python) app despite the folder
name. Every resource and permission below is as written there. The Lambda handler module
(src/etl/handler.py) the stack points at does not exist, and nothing in the repo defines the
producer of the "eduai.canvas" events, so those are labeled as such.
"""
from diagrams.aws.integration import Eventbridge
from diagrams.aws.compute import Lambda
from diagrams.aws.security import IAMRole, KMS
from diagrams.aws.storage import S3
from diagrams.aws.management import Cloudwatch
from diagrams.aws.ml import Bedrock

from archstyle import arch, aws_cloud, box, e, layer, linkedin, outside

OUT = "production-design"
with arch("EduAI Connect", "Production design (not deployed)", OUT):
    with outside("Canvas LMS"):
        canvas = box("External LMS events\n(producer not defined in IaC)")
    with aws_cloud():
        with layer("Triggers", margin=36):
            daily = Eventbridge("EventBridge rule\ncron 11:00 UTC, Mon-Fri")
            hook = Eventbridge("EventBridge rule\nsource eduai.canvas:\nGradeUpdated, SubmissionCreated")
        with layer("Ingestion", margin=36):
            role = IAMRole("IAM execution role\nS3 read, logs write,\nbedrock:InvokeModel")
            fn = Lambda("Ingestion Lambda\nPython 3.11, 512 MB, 5 min\n(handler file missing)")
        with layer("Logs", margin=40):
            logs = Cloudwatch("CloudWatch log group\n1-year retention")
        with layer("Generative AI", margin=64):
            llm = Bedrock("Amazon Bedrock\nClaude 3 Sonnet,\nTitan Embed\n(allowed by IAM,\nnot called)")
        with layer("Storage", margin=40):
            bucket = S3("S3 student data bucket\nSSE-KMS, versioned,\npublic access blocked,\nTLS only")
            key = KMS("KMS key\nrotation on")

    canvas >> e("custom events", headport="n") >> hook
    daily >> e("invokes on schedule", headport="n") >> fn
    hook >> e("invokes on match", headport="n") >> fn
    fn >> e("assumes", constraint="false") >> role
    fn >> e("writes logs", tailport="s", headport="n") >> logs
    fn >> e("GetObject (read-only grant)", tailport="s", headport="n") >> bucket
    bucket >> e("encrypts objects (SSE-KMS)", tailport="s", headport="n") >> key
    fn >> e("InvokeModel (permitted only)", style="dashed", tailport="s", headport="n") >> llm
linkedin(OUT)
