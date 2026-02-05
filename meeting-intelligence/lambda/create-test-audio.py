import boto3

polly = boto3.client('polly', region_name='us-west-2')

text = """
Hello team, this is our weekly status meeting. Let me cover three items.
First, the project timeline. John, please finalize the architecture by Friday.
Second, budget review. Sarah, can you send the updated costs by Thursday?
Third, we decided to use AWS for deployment. Next meeting is Monday at 2pm.
Thanks everyone.
"""

response = polly.synthesize_speech(
    Text=text,
    OutputFormat='mp3',
    VoiceId='Matthew',
    Engine='neural'
)

with open('test-meeting-audio.mp3', 'wb') as f:
    f.write(response['AudioStream'].read())

print("Created test-meeting-audio.mp3")
