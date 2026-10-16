from aws_cdk import (
    App, Stack, RemovalPolicy, Duration, CfnOutput,
    aws_s3 as s3,
    aws_lambda as _lambda,
    aws_events as events,
    aws_events_targets as targets,
    aws_iam as iam,
    aws_kms as kms,
    aws_logs as logs,   
)   
from constructs import Construct



class EduAIStack(Stack):
    def __init__(self, scope: Construct, id: str, **kwargs):
        super().__init__(scope, id, **kwargs)

        # -----------------------------------------------
        # KMS Key — encrypts student data for FERPA compliance
        # -----------------------------------------------
        encryption_key = kms.Key(
            self, "EduAIKey",
            alias="eduai-encryption-key",
            description="Encrypts student data for FERPA compliance",
            enable_key_rotation=True,
            removal_policy=RemovalPolicy.DESTROY
        )

        # -----------------------------------------------
        # S3 Bucket — stores student data, encrypted
        # -----------------------------------------------
        student_data_bucket = s3.Bucket(
            self, "StudentDataBucket",
            bucket_name="eduai-student-data",
            encryption=s3.BucketEncryption.KMS,
            encryption_key=encryption_key,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True,
            versioned=True,
            enforce_ssl=True,
        )

        # -----------------------------------------------
        # CloudWatch Log Group — audit trail for FERPA compliance
        # -----------------------------------------------
        log_group = logs.LogGroup(
            self, "EduAILogs",
            log_group_name="/eduai/data-ingestion",
            retention=logs.RetentionDays.ONE_YEAR,
            removal_policy=RemovalPolicy.DESTROY
        )

        # -----------------------------------------------
        # IAM Role — least privilege for Lambda
        # -----------------------------------------------
        lambda_role = iam.Role(
            self, "DataIngestionRole",
            assumed_by=iam.ServicePrincipal("lambda.amazonaws.com"),
            description="Role for EduAI data ingestion Lambda"
        )

        # Only allow reading from our specific bucket
        student_data_bucket.grant_read(lambda_role)

        # Only allow invoking Bedrock models
        lambda_role.add_to_policy(iam.PolicyStatement(
            actions=["bedrock:InvokeModel"],
            resources=["arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-sonnet*",
                       "arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed*"]
        ))

        # Allow writing to CloudWatch logs
        log_group.grant_write(lambda_role)

        # -----------------------------------------------
        # Lambda Function — data ingestion from Canvas API
        # -----------------------------------------------
        ingestion_lambda = _lambda.Function(
            self, "DataIngestionLambda",
            runtime=_lambda.Runtime.PYTHON_3_11,
            handler="handler.lambda_handler",
            code=_lambda.Code.from_asset("src/etl"),
            role=lambda_role,
            timeout=Duration.minutes(5),
            memory_size=512,
            environment={
                "STUDENT_DATA_BUCKET": student_data_bucket.bucket_name,
                "AWS_REGION_NAME": "us-east-1",
            },
            log_group=log_group,
        )

        # -----------------------------------------------
        # EventBridge Rule — daily data sync at 6 AM EST
        # -----------------------------------------------
        daily_sync_rule = events.Rule(
            self, "DailySyncRule",
            schedule=events.Schedule.cron(
                minute="0",
                hour="11",  # 11 UTC = 6 AM EST
                week_day="MON-FRI"
            ),
            description="Triggers daily student data sync from Canvas LMS"
        )
        daily_sync_rule.add_target(targets.LambdaFunction(ingestion_lambda))

        # -----------------------------------------------
        # EventBridge Rule — webhook trigger for real-time grade updates
        # -----------------------------------------------
        webhook_rule = events.Rule(
            self, "WebhookTriggerRule",
            event_pattern=events.EventPattern(
                source=["eduai.canvas"],
                detail_type=["GradeUpdated", "SubmissionCreated"]
            ),
            description="Triggers on Canvas LMS grade change webhooks"
        )
        webhook_rule.add_target(targets.LambdaFunction(ingestion_lambda))

        # -----------------------------------------------
        # Outputs
        # -----------------------------------------------
        CfnOutput(self, "BucketName", value=student_data_bucket.bucket_name)
        CfnOutput(self, "LambdaArn", value=ingestion_lambda.function_arn)
        CfnOutput(self, "KmsKeyArn", value=encryption_key.key_arn)


app = App()
EduAIStack(app, "EduAIStack", env={"region": "us-east-1"})
app.synth()