#!/bin/bash
set -e
echo "🚀 Deploying Meeting Intelligence..."
BUCKET_NAME="meeting-intelligence-$(date +%s)"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
aws s3 mb s3://$BUCKET_NAME --region us-west-2
aws s3api put-object --bucket $BUCKET_NAME --key audio-uploads/
aws s3api put-object --bucket $BUCKET_NAME --key transcripts/
aws s3api put-object --bucket $BUCKET_NAME --key summaries/
cd lambda
echo $BUCKET_NAME > bucket-name.txt
aws iam create-role --role-name MeetingIntelligenceRole --assume-role-policy-document file://trust-policy.json
aws iam put-role-policy --role-name MeetingIntelligenceRole --policy-name MeetingIntelligencePermissions --policy-document file://lambda-permissions.json
aws iam put-role-policy --role-name MeetingIntelligenceRole --policy-name StepFunctionsLambdaInvoke --policy-document file://stepfunctions-lambda-permissions.json
aws iam put-role-policy --role-name MeetingIntelligenceRole --policy-name DynamoDBAccess --policy-document file://dynamodb-permissions.json
ROLE_ARN=$(aws iam get-role --role-name MeetingIntelligenceRole --query 'Role.Arn' --output text)
sleep 15
aws dynamodb create-table --table-name MeetingIntelligence --attribute-definitions AttributeName=meetingId,AttributeType=S AttributeName=createdAt,AttributeType=S --key-schema AttributeName=meetingId,KeyType=HASH AttributeName=createdAt,KeyType=RANGE --billing-mode PAY_PER_REQUEST --region us-west-2
aws lambda create-function --function-name MeetingTranscriber --runtime python3.11 --role $ROLE_ARN --handler transcribe_audio.lambda_handler --zip-file fileb://transcribe-package.zip --timeout 60 --memory-size 512 --environment Variables={BUCKET_NAME=$BUCKET_NAME} --region us-west-2
aws lambda create-function --function-name MeetingAnalyzer --runtime python3.11 --role $ROLE_ARN --handler analyze_meeting.lambda_handler --zip-file fileb://analyze-package.zip --timeout 120 --memory-size 1024 --environment Variables={BUCKET_NAME=$BUCKET_NAME} --region us-west-2
aws lambda create-function --function-name MeetingDashboardAPI --runtime python3.11 --role $ROLE_ARN --handler dashboard_api.lambda_handler --zip-file fileb://dashboard-package.zip --timeout 30 --memory-size 256 --region us-west-2
sed "s/ACCOUNT_ID/$ACCOUNT_ID/g" workflow-updated.json > workflow-deploy.json
WORKFLOW_ARN=$(aws stepfunctions create-state-machine --name MeetingIntelligenceWorkflow --definition file://workflow-deploy.json --role-arn $ROLE_ARN --region us-west-2 --query 'stateMachineArn' --output text)
echo $WORKFLOW_ARN > workflow-arn.txt
sed "s|WORKFLOW_ARN_PLACEHOLDER|$WORKFLOW_ARN|g" trigger_workflow_updated.py > trigger_deploy.py
zip -q trigger-deploy.zip trigger_deploy.py
aws lambda create-function --function-name MeetingWorkflowTrigger --runtime python3.11 --role $ROLE_ARN --handler trigger_deploy.lambda_handler --zip-file fileb://trigger-deploy.zip --timeout 30 --region us-west-2
sleep 5
aws lambda add-permission --function-name MeetingWorkflowTrigger --statement-id s3-trigger --action lambda:InvokeFunction --principal s3.amazonaws.com --source-arn arn:aws:s3:::$BUCKET_NAME --region us-west-2
cat > s3-notif.json << NOTIF
{"LambdaFunctionConfigurations":[{"LambdaFunctionArn":"arn:aws:lambda:us-west-2:$ACCOUNT_ID:function:MeetingWorkflowTrigger","Events":["s3:ObjectCreated:*"],"Filter":{"Key":{"FilterRules":[{"Name":"prefix","Value":"audio-uploads/"}]}}}]}
NOTIF
aws s3api put-bucket-notification-configuration --bucket $BUCKET_NAME --notification-configuration file://s3-notif.json
API_ID=$(aws apigateway create-rest-api --name "Meeting Intelligence API" --region us-west-2 --query 'id' --output text)
echo $API_ID > api-id.txt
ROOT_ID=$(aws apigateway get-resources --rest-api-id $API_ID --region us-west-2 --query 'items[0].id' --output text)
MEETINGS_RESOURCE=$(aws apigateway create-resource --rest-api-id $API_ID --parent-id $ROOT_ID --path-part meetings --region us-west-2 --query 'id' --output text)
aws apigateway put-method --rest-api-id $API_ID --resource-id $MEETINGS_RESOURCE --http-method GET --authorization-type NONE --region us-west-2
LAMBDA_ARN=$(aws lambda get-function --function-name MeetingDashboardAPI --region us-west-2 --query 'Configuration.FunctionArn' --output text)
aws apigateway put-integration --rest-api-id $API_ID --resource-id $MEETINGS_RESOURCE --http-method GET --type AWS_PROXY --integration-http-method POST --uri "arn:aws:apigateway:us-west-2:lambda:path/2015-03-31/functions/$LAMBDA_ARN/invocations" --region us-west-2
aws lambda add-permission --function-name MeetingDashboardAPI --statement-id apigateway-meetings --action lambda:InvokeFunction --principal apigateway.amazonaws.com --source-arn "arn:aws:execute-api:us-west-2:$ACCOUNT_ID:$API_ID/*/*" --region us-west-2
aws apigateway create-deployment --rest-api-id $API_ID --stage-name prod --region us-west-2
cd ..
sed "s|API_PLACEHOLDER|https://$API_ID.execute-api.us-west-2.amazonaws.com/prod|g" meeting-dashboard.html > dashboard.html
echo ""
echo "✅ COMPLETE!"
echo "API: https://$API_ID.execute-api.us-west-2.amazonaws.com/prod/meetings"
