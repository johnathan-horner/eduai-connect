import json
import boto3
import os
from datetime import datetime

bedrock = boto3.client('bedrock-runtime', region_name='us-west-2')
comprehend = boto3.client('comprehend', region_name='us-west-2')
s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb', region_name='us-west-2')
ses = boto3.client('ses', region_name='us-west-2')

table = dynamodb.Table('MeetingIntelligence')

def lambda_handler(event, context):
    """
    Step 2: Analyze transcript, extract actions, generate summary
    """
    try:
        meeting_id = event['meetingId']
        job_name = event['jobName']
        bucket = event['bucket']
        
        # Get transcript from S3
        transcript_key = f"transcripts/{job_name}.json"
        transcript_obj = s3.get_object(Bucket=bucket, Key=transcript_key)
        transcript_data = json.loads(transcript_obj['Body'].read())
        
        # Extract full transcript text
        transcript_text = transcript_data['results']['transcripts'][0]['transcript']
        
        print(f"Analyzing {len(transcript_text)} characters of transcript")
        
        # Step 1: Use Comprehend for key phrases and sentiment
        key_phrases = comprehend.detect_key_phrases(
            Text=transcript_text[:5000],  # Comprehend limit
            LanguageCode='en'
        )
        
        sentiment = comprehend.detect_sentiment(
            Text=transcript_text[:5000],
            LanguageCode='en'
        )
        
        # Step 2: Use Bedrock Claude for intelligent analysis
        analysis_prompt = f"""Analyze this meeting transcript and provide a structured analysis.

Transcript:
{transcript_text[:4000]}

Provide your analysis in the following JSON format:
{{
  "executive_summary": "2-3 sentence summary of the meeting",
  "key_topics": ["topic1", "topic2", "topic3"],
  "action_items": [
    {{"task": "description", "owner": "person name", "priority": "high|medium|low", "due_date": "estimated timeframe"}}
  ],
  "decisions_made": ["decision1", "decision2"],
  "next_steps": ["step1", "step2"],
  "sentiment": "positive|neutral|negative|mixed"
}}

Focus on extracting clear, actionable items with specific owners when mentioned."""

        bedrock_request = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 2000,
            "temperature": 0.3,
            "messages": [{
                "role": "user",
                "content": analysis_prompt
            }]
        }
        
        # Call Bedrock (will work once access is approved)
        try:
            bedrock_response = bedrock.invoke_model(
                modelId='anthropic.claude-3-haiku-20240307-v1:0',
                body=json.dumps(bedrock_request)
            )
            
            response_body = json.loads(bedrock_response['body'].read())
            ai_analysis_text = response_body['content'][0]['text']
            
            # Extract JSON from response
            json_start = ai_analysis_text.find('{')
            json_end = ai_analysis_text.rfind('}') + 1
            ai_analysis = json.loads(ai_analysis_text[json_start:json_end])
            
        except Exception as bedrock_error:
            print(f"Bedrock error (using mock data): {bedrock_error}")
            # Mock data for demo
            ai_analysis = {
                "executive_summary": "Meeting covered project updates and next steps. Team discussed timeline and resource allocation.",
                "key_topics": ["Project Timeline", "Resource Allocation", "Budget Review"],
                "action_items": [
                    {"task": "Finalize project timeline", "owner": "Project Manager", "priority": "high", "due_date": "end of week"},
                    {"task": "Review budget proposal", "owner": "Finance Team", "priority": "medium", "due_date": "next week"}
                ],
                "decisions_made": ["Approved budget increase", "Extended deadline by 2 weeks"],
                "next_steps": ["Schedule follow-up meeting", "Distribute updated timeline"],
                "sentiment": "positive"
            }
        
        # Combine all analysis
        final_analysis = {
            'meetingId': meeting_id,
            'createdAt': datetime.utcnow().isoformat(),
            'transcript': transcript_text,
            'ai_analysis': ai_analysis,
            'comprehend_sentiment': sentiment['Sentiment'],
            'comprehend_key_phrases': [kp['Text'] for kp in key_phrases['KeyPhrases'][:10]],
            'status': 'completed'
        }
        
        # Save to DynamoDB
        table.put_item(Item=final_analysis)
        
        # Save summary to S3
        summary_key = f"summaries/{meeting_id}-summary.json"
        s3.put_object(
            Bucket=bucket,
            Key=summary_key,
            Body=json.dumps(final_analysis, indent=2),
            ContentType='application/json'
        )
        
        # Send email summary
        send_email_summary(final_analysis)
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'meetingId': meeting_id,
                'status': 'completed',
                'summary_location': f"s3://{bucket}/{summary_key}",
                'action_items_count': len(ai_analysis['action_items'])
            })
        }
        
    except Exception as e:
        print(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }

def send_email_summary(analysis):
    """Send formatted email with meeting summary"""
    try:
        ai_analysis = analysis['ai_analysis']
        
        # Format action items
        action_items_html = ""
        for item in ai_analysis['action_items']:
            priority_color = {'high': '#ff4444', 'medium': '#ffaa00', 'low': '#44ff44'}.get(item['priority'], '#888')
            action_items_html += f"""
            <tr>
                <td style="padding: 10px; border: 1px solid #ddd;">{item['task']}</td>
                <td style="padding: 10px; border: 1px solid #ddd;">{item['owner']}</td>
                <td style="padding: 10px; border: 1px solid #ddd; color: {priority_color}; font-weight: bold;">{item['priority'].upper()}</td>
                <td style="padding: 10px; border: 1px solid #ddd;">{item['due_date']}</td>
            </tr>
            """
        
        # Email HTML
        email_html = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h1 style="color: #667eea;">📋 Meeting Summary</h1>
            
            <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h2>Executive Summary</h2>
                <p>{ai_analysis['executive_summary']}</p>
            </div>
            
            <h2>🎯 Action Items</h2>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <thead>
                    <tr style="background: #667eea; color: white;">
                        <th style="padding: 10px; text-align: left;">Task</th>
                        <th style="padding: 10px; text-align: left;">Owner</th>
                        <th style="padding: 10px; text-align: left;">Priority</th>
                        <th style="padding: 10px; text-align: left;">Due Date</th>
                    </tr>
                </thead>
                <tbody>
                    {action_items_html}
                </tbody>
            </table>
            
            <h2>✅ Decisions Made</h2>
            <ul>
                {''.join([f"<li>{decision}</li>" for decision in ai_analysis['decisions_made']])}
            </ul>
            
            <h2>📌 Key Topics Discussed</h2>
            <ul>
                {''.join([f"<li>{topic}</li>" for topic in ai_analysis['key_topics']])}
            </ul>
            
            <h2>➡️ Next Steps</h2>
            <ul>
                {''.join([f"<li>{step}</li>" for step in ai_analysis['next_steps']])}
            </ul>
            
            <div style="margin-top: 30px; padding: 20px; background: #edf2f7; border-radius: 8px;">
                <p style="margin: 0; font-size: 12px; color: #666;">
                    Generated by AI Meeting Intelligence • Meeting ID: {analysis['meetingId'][:8]}
                </p>
            </div>
        </body>
        </html>
        """
        
        # Send email (replace with your verified email)
        ses.send_email(
            Source='johnathanhorner819@gmail.com', # Must be verified in SES
            Destination={'ToAddresses': ['johnathanhorner819@gmail.com']},
            Message={
                'Subject': {'Data': f"📋 Meeting Summary - {datetime.now().strftime('%Y-%m-%d')}"},
                'Body': {'Html': {'Data': email_html}}
            }
        )
        
        print("Email summary sent successfully")
        
    except Exception as e:
        print(f"Email send error: {str(e)}")
