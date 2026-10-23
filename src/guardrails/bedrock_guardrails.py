import boto3
import json


region = "us-east-1"
bedrock = boto3.client(service_name="bedrock", region_name=region)


def create_guardrail():
    """
    Creates a Bedrock Guardrail for FERPA-compliant PII filtering.
    """
    response = bedrock.create_guardrail(
        name="EduAI-FERPA-Guardrail",
        description="Filters PII from student data responses for FERPA compliance",
        topicPolicyConfig={
            "topicsConfig": [
                {
                    "name": "StudentPII",
                    "definition": "Requests for student social security numbers, home addresses, parent contact info, or medical records",
                    "examples": [
                        "What is the student's SSN?",
                        "Give me the home address for Marcus Thompson",
                        "What are the parent phone numbers?"
                    ],
                    "type": "DENY"
                }
            ]
        },
        contentPolicyConfig={
            "filtersConfig": [
                {
                    "type": "SEXUAL",
                    "inputStrength": "HIGH",
                    "outputStrength": "HIGH"
                },
                {
                    "type": "VIOLENCE",
                    "inputStrength": "HIGH",
                    "outputStrength": "HIGH"
                },
                {
                    "type": "HATE",
                    "inputStrength": "HIGH",
                    "outputStrength": "HIGH"
                },
                {
                    "type": "INSULTS",
                    "inputStrength": "HIGH",
                    "outputStrength": "HIGH"
                }
            ]
        },
        sensitiveInformationPolicyConfig={
            "piiEntitiesConfig": [
                {"type": "US_SOCIAL_SECURITY_NUMBER", "action": "BLOCK"},
                {"type": "EMAIL", "action": "ANONYMIZE"},
                {"type": "PHONE", "action": "ANONYMIZE"},
                {"type": "NAME", "action": "ANONYMIZE"},
                {"type": "US_INDIVIDUAL_TAX_IDENTIFICATION_NUMBER", "action": "BLOCK"},
                {"type": "CREDIT_DEBIT_CARD_NUMBER", "action": "BLOCK"},
            ]
        },
        blockedInputMessaging="This request contains information that cannot be processed due to FERPA privacy requirements.",
        blockedOutputMessaging="This response has been filtered to protect student privacy under FERPA.",
    )

    guardrail_id = response["guardrailId"]
    print(f"Guardrail created: {guardrail_id}")
    return guardrail_id


def list_guardrails():
    """List all existing guardrails."""
    response = bedrock.list_guardrails()
    for g in response["guardrails"]:
        print(f"  {g['name']}, ID: {g['id']}, Status: {g['status']}")
    return response["guardrails"]


def apply_guardrail_to_chain(guardrail_id, guardrail_version="DRAFT"):
    """
    Returns guardrail config to pass to ChatBedrock.
    Use this in your rag_chain.py or agents:
    
    llm = ChatBedrock(
        client=bedrock_runtime,
        model_id="us.anthropic.claude-3-haiku-20240307-v1:0",
        model_kwargs={"temperature": 0, "max_tokens": 1000},
        guardrails={"guardrailIdentifier": guardrail_id, "guardrailVersion": guardrail_version}
    )
    

    """
    return {
        "guardrailIdentifier": guardrail_id,
        "guardrailVersion": guardrail_version
    }


if __name__ == "__main__":
    print("Creating FERPA guardrail...")
    gid = create_guardrail()
    print(f"\nGuardrail ID: {gid}")
    print("\nAll guardrails:")
    list_guardrails()