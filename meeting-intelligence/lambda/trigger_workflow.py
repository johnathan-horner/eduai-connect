import json
import boto3

stepfunctions = boto3.client('stepfunctions')

WORKFLOW_ARN = 'arn:aws:states:us-west-2:ACCOUNT_ID:stateMachine:MeetingIntelligenceWorkflow'

def lambda_handler(event, context):
    """
    Triggered when audio file is uploaded to S3
    Starts the Step Functions workflow
    """
    try:
        # Get S3 event details
        record = event['Records'][0]
        bucket = record['s3']['bucket']['name']
        key = record['s3']['object']['key']
        
        print(f"Processing: s3://{bucket}/{key}")
        
        # Start workflow
        response = stepfunctions.start_execution(
            stateMachineArn=WORKFLOW_ARN,
            input=json.dumps({
                'bucket': bucket,
                'key': key
            })
        )
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Workflow started',
                'executionArn': response['executionArn']
            })
        }
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }
