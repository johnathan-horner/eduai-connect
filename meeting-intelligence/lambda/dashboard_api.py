import json
import boto3
from boto3.dynamodb.conditions import Key
from decimal import Decimal

dynamodb = boto3.resource('dynamodb', region_name='us-west-2')
table = dynamodb.Table('MeetingIntelligence')

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super(DecimalEncoder, self).default(obj)

def lambda_handler(event, context):
    try:
        path = event.get('path', '/')
        method = event.get('httpMethod', 'GET')
        
        if path == '/meetings' and method == 'GET':
            return get_all_meetings()
        elif path == '/meeting' and method == 'GET':
            meeting_id = event['queryStringParameters']['id']
            return get_meeting(meeting_id)
        elif path == '/action-items' and method == 'GET':
            return get_all_action_items()
        elif path == '/action-item/complete' and method == 'POST':
            body = json.loads(event['body'])
            return complete_action_item(body['meetingId'], body['taskIndex'])
        else:
            return {'statusCode': 404, 'body': json.dumps({'error': 'Not found'})}
            
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }

def get_all_meetings():
    response = table.scan(Limit=50)
    meetings = response.get('Items', [])
    
    summary = []
    for meeting in meetings:
        summary.append({
            'meetingId': meeting['meetingId'],
            'createdAt': meeting['createdAt'],
            'summary': meeting['ai_analysis']['executive_summary'],
            'action_items_count': len(meeting['ai_analysis']['action_items']),
            'sentiment': meeting.get('comprehend_sentiment', 'NEUTRAL')
        })
    
    return {
        'statusCode': 200,
        'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
        'body': json.dumps(summary, cls=DecimalEncoder)
    }

def get_meeting(meeting_id):
    response = table.get_item(Key={'meetingId': meeting_id})
    
    if 'Item' not in response:
        return {'statusCode': 404, 'body': json.dumps({'error': 'Meeting not found'})}
    
    return {
        'statusCode': 200,
        'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
        'body': json.dumps(response['Item'], cls=DecimalEncoder)
    }

def get_all_action_items():
    response = table.scan()
    all_items = []
    
    for meeting in response.get('Items', []):
        meeting_id = meeting['meetingId']
        created_at = meeting['createdAt']
        
        for idx, item in enumerate(meeting['ai_analysis']['action_items']):
            all_items.append({
                'meetingId': meeting_id,
                'meetingDate': created_at,
                'taskIndex': idx,
                'task': item['task'],
                'owner': item['owner'],
                'priority': item['priority'],
                'dueDate': item['due_date'],
                'completed': item.get('completed', False)
            })
    
    return {
        'statusCode': 200,
        'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
        'body': json.dumps(all_items, cls=DecimalEncoder)
    }

def complete_action_item(meeting_id, task_index):
    # Mark action item as complete
    # In production, update DynamoDB item
    return {
        'statusCode': 200,
        'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
        'body': json.dumps({'message': 'Action item marked complete'})
    }
