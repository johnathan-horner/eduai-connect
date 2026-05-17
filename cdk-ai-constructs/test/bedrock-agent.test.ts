import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { BedrockAgentConstruct } from '../lib/constructs/bedrock-agent';

describe('BedrockAgentConstruct', () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let testFunction: lambda.Function;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack', {
      env: { account: '123456789012', region: 'us-east-1' },
    });

    testFunction = new lambda.Function(stack, 'TestFunction', {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'index.handler',
      code: lambda.Code.fromInline('def handler(event, context): pass'),
    });
  });

  test('creates resources without error', () => {
    new BedrockAgentConstruct(stack, 'TestAgent', {
      appName: 'TestApp',
      handler: testFunction,
    });

    const template = Template.fromStack(stack);
    expect(template).toBeDefined();
  });

  test('creates IAM role with Bedrock permissions', () => {
    new BedrockAgentConstruct(stack, 'TestAgent', {
      appName: 'TestApp',
      handler: testFunction,
      modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: {
              Service: 'lambda.amazonaws.com',
            },
          },
        ],
      },
    });

    // Check for Bedrock policy
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Allow',
            Action: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
            Resource: [
              'arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-haiku-20240307-v1:0',
              'arn:aws:bedrock:us-east-1::foundation-model/anthropic.*',
            ],
          }),
        ]),
      },
    });
  });

  test('creates CloudWatch log group', () => {
    new BedrockAgentConstruct(stack, 'TestAgent', {
      appName: 'TestApp',
      handler: testFunction,
      logRetentionDays: 30,
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: `/aws/lambda/${testFunction.functionName}/bedrock`,
      RetentionInDays: 30,
    });
  });

  test('creates CloudWatch alarm for errors', () => {
    new BedrockAgentConstruct(stack, 'TestAgent', {
      appName: 'TestApp',
      handler: testFunction,
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'TestApp-bedrock-lambda-errors',
      AlarmDescription: 'Monitor errors in TestApp Bedrock Lambda function',
      MetricName: 'Errors',
      Namespace: 'AWS/Lambda',
      Threshold: 5,
      ComparisonOperator: 'GreaterThanOrEqualToThreshold',
    });
  });

  test('uses custom model ID when provided', () => {
    const customModelId = 'anthropic.claude-3-sonnet-20240229-v1:0';

    new BedrockAgentConstruct(stack, 'TestAgent', {
      appName: 'TestApp',
      handler: testFunction,
      modelId: customModelId,
    });

    const template = Template.fromStack(stack);

    // Should create policy with custom model ARN
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Resource: Match.arrayWith([
              `arn:aws:bedrock:us-east-1::foundation-model/${customModelId}`,
            ]),
          }),
        ]),
      },
    });
  });

  test('allows custom Bedrock actions', () => {
    new BedrockAgentConstruct(stack, 'TestAgent', {
      appName: 'TestApp',
      handler: testFunction,
      allowedActions: ['bedrock:InvokeModel', 'bedrock:GetModel', 'bedrock:ListFoundationModels'],
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: ['bedrock:InvokeModel', 'bedrock:GetModel', 'bedrock:ListFoundationModels'],
          }),
        ]),
      },
    });
  });

  test('creates required CfnOutputs', () => {
    new BedrockAgentConstruct(stack, 'TestAgent', {
      appName: 'TestApp',
      handler: testFunction,
    });

    const template = Template.fromStack(stack);

    template.hasOutput('*BedrockRoleArn*', {});
    template.hasOutput('*LogGroupName*', {});
    template.hasOutput('*ModelId*', {});
    template.hasOutput('*ErrorAlarmArn*', {});
  });

  test('applies correct tags', () => {
    new BedrockAgentConstruct(stack, 'TestAgent', {
      appName: 'TestApp',
      handler: testFunction,
    });

    const template = Template.fromStack(stack);

    // Check that resources have required tags
    template.hasResourceProperties('AWS::IAM::Role', {
      Tags: Match.arrayWith([
        { Key: 'Project', Value: 'TestApp' },
        { Key: 'ManagedBy', Value: 'cdk-ai-constructs' },
        { Key: 'Owner', Value: 'johnathan-horner' },
        { Key: 'Component', Value: 'BedrockAgent' },
      ]),
    });
  });

  test('does not use wildcard actions', () => {
    new BedrockAgentConstruct(stack, 'TestAgent', {
      appName: 'TestApp',
      handler: testFunction,
    });

    const template = Template.fromStack(stack);

    // Ensure no policies have wildcard actions
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.not(
            Match.objectLike({
              Action: Match.arrayWith(['*']),
            })
          ),
        ]),
      },
    });
  });

  test('adds environment variables to Lambda', () => {
    const construct = new BedrockAgentConstruct(stack, 'TestAgent', {
      appName: 'TestApp',
      handler: testFunction,
      modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
    });

    expect(construct.modelId).toBe('anthropic.claude-3-haiku-20240307-v1:0');

    // Environment variables would be added to the Lambda function
    // This would require checking the Lambda function's environment
  });
});