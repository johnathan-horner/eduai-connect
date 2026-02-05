import json
import boto3
import uuid

transcribe = boto3.client('transcribe', region_name='us-west-2')

def lambda_handler(event, context):
    try:
        bucket = event.get('bucket')
        key = event.get('key')
        
        job_name = f"meeting-{uuid.uuid4()}"
        meeting_id = job_name
        audio_url = f"s3://{bucket}/{key}"
        
        transcribe.start_transcription_job(
            TranscriptionJobName=job_name,
            Media={'MediaFileUri': audio_url},
            MediaFormat='mp3',
            LanguageCode='en-US',
            Settings={'ShowSpeakerLabels': True, 'MaxSpeakerLabels': 10},
            OutputBucketName=bucket,
            OutputKey=f"transcripts/{job_name}.json"
        )
        
        print(f"Started job: {job_name}")
        
        return {
            'meetingId': meeting_id,
            'jobName': job_name,
            'status': 'IN_PROGRESS',
            'bucket': bucket,
            'audioKey': key
        }
        
    except Exception as e:
        print(f"Error: {str(e)}")
        raise
