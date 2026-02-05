#!/bin/bash
cd lambda
BUCKET_NAME=$(cat bucket-name.txt 2>/dev/null)
API_ID=$(cat api-id.txt 2>/dev/null)
WORKFLOW_ARN=$(cat workflow-arn.txt 2>/dev/null)
echo "Deleting..."
aws lambda delete-function --function-name MeetingTranscriber --region us-west-2 2>/dev/null || true
aws lambda delete-function --function-name MeetingAnalyzer --region us-west-2 2>/dev/null || true
aws lambda delete-function --function-name MeetingWorkflowTrigger --region us-west-2 2>/dev/null || true
aws lambda delete-function --function-name MeetingDashboardAPI --region us-west-2 2>/dev/null || true
aws stepfunctions delete-state-machine --state-machine-arn $WORKFLOW_ARN --region us-west-2 2>/dev/null || true
aws apigateway delete-rest-api --rest-api-id $API_ID --region us-west-2 2>/dev/null || true
aws dynamodb delete-table --table-name MeetingIntelligence --region us-west-2 2>/dev/null || true
aws s3 rm s3://$BUCKET_NAME --recursive 2>/dev/null || true
aws s3 rb s3://$BUCKET_NAME 2>/dev/null || true
aws iam delete-role-policy --role-name MeetingIntelligenceRole --policy-name MeetingIntelligencePermissions 2>/dev/null || true
aws iam delete-role-policy --role-name MeetingIntelligenceRole --policy-name StepFunctionsLambdaInvoke 2>/dev/null || true
aws iam delete-role-policy --role-name MeetingIntelligenceRole --policy-name DynamoDBAccess 2>/dev/null || true
aws iam delete-role --role-name MeetingIntelligenceRole 2>/dev/null || true
echo "✅ Deleted!"
