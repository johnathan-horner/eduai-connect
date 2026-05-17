import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { APIGatewayLambda } from '../lib/constructs/api-gateway-lambda';

describe('APIGatewayLambda', () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let testFunction: lambda.Function;
  let userPool: cognito.UserPool;

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

    userPool = new cognito.UserPool(stack, 'TestUserPool', {
      userPoolName: 'test-pool',
    });
  });

  test('creates resources without error', () => {
    new APIGatewayLambda(stack, 'TestAPI', {
      appName: 'TestApp',
      apiName: 'test-api',
      routes: [
        {
          method: 'GET',
          path: '/test',
          handler: testFunction,
        },
      ],
    });

    const template = Template.fromStack(stack);
    expect(template).toBeDefined();
  });

  test('creates API Gateway with correct configuration', () => {
    new APIGatewayLambda(stack, 'TestAPI', {
      appName: 'TestApp',
      apiName: 'test-api',
      routes: [
        {
          method: 'GET',
          path: '/test',
          handler: testFunction,
        },
      ],
      stageName: 'prod',
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::ApiGateway::RestApi', {
      Name: 'test-api',
      Description: 'REST API for TestApp',
    });

    template.hasResourceProperties('AWS::ApiGateway::Deployment', {
      StageName: 'prod',
    });
  });

  test('creates resources and methods for routes', () => {
    new APIGatewayLambda(stack, 'TestAPI', {
      appName: 'TestApp',
      apiName: 'test-api',
      routes: [
        {
          method: 'GET',
          path: '/users',
          handler: testFunction,
        },
        {
          method: 'POST',
          path: '/users',
          handler: testFunction,
        },
        {
          method: 'GET',
          path: '/users/{id}',
          handler: testFunction,
        },
      ],
    });

    const template = Template.fromStack(stack);

    // Should create resources
    template.hasResourceProperties('AWS::ApiGateway::Resource', {
      PathPart: 'users',
    });

    template.hasResourceProperties('AWS::ApiGateway::Resource', {
      PathPart: '{id}',
    });

    // Should create methods
    template.hasResourceProperties('AWS::ApiGateway::Method', {
      HttpMethod: 'GET',
    });

    template.hasResourceProperties('AWS::ApiGateway::Method', {
      HttpMethod: 'POST',
    });
  });

  test('creates Cognito authorizer when user pool provided', () => {
    new APIGatewayLambda(stack, 'TestAPI', {
      appName: 'TestApp',
      apiName: 'test-api',
      routes: [
        {
          method: 'GET',
          path: '/protected',
          handler: testFunction,
        },
      ],
      cognitoAuthorizer: userPool,
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::ApiGateway::Authorizer', {
      Name: 'test-api-authorizer',
      Type: 'COGNITO_USER_POOLS',
      IdentitySource: 'method.request.header.Authorization',
    });
  });

  test('creates Lambda integrations', () => {
    new APIGatewayLambda(stack, 'TestAPI', {
      appName: 'TestApp',
      apiName: 'test-api',
      routes: [
        {
          method: 'GET',
          path: '/test',
          handler: testFunction,
        },
      ],
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::ApiGateway::Method', {
      Integration: {
        Type: 'AWS_PROXY',
        IntegrationHttpMethod: 'POST',
        Uri: {
          'Fn::Join': [
            '',
            [
              'arn:',
              { Ref: 'AWS::Partition' },
              ':apigateway:',
              { Ref: 'AWS::Region' },
              ':lambda:path/2015-03-31/functions/',
              { 'Fn::GetAtt': [Match.anyValue(), 'Arn'] },
              '/invocations',
            ],
          ],
        },
      },
    });
  });

  test('grants Lambda invoke permissions', () => {
    new APIGatewayLambda(stack, 'TestAPI', {
      appName: 'TestApp',
      apiName: 'test-api',
      routes: [
        {
          method: 'GET',
          path: '/test',
          handler: testFunction,
        },
      ],
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Lambda::Permission', {
      Action: 'lambda:InvokeFunction',
      Principal: 'apigateway.amazonaws.com',
    });
  });

  test('creates usage plan and API key when throttle configured', () => {
    new APIGatewayLambda(stack, 'TestAPI', {
      appName: 'TestApp',
      apiName: 'test-api',
      routes: [
        {
          method: 'GET',
          path: '/test',
          handler: testFunction,
        },
      ],
      throttle: {
        rateLimit: 100,
        burstLimit: 200,
      },
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::ApiGateway::UsagePlan', {
      UsagePlanName: 'test-api-usage-plan',
      Throttle: {
        RateLimit: 100,
        BurstLimit: 200,
      },
    });

    template.hasResourceProperties('AWS::ApiGateway::ApiKey', {
      Name: 'test-api-key',
    });
  });

  test('configures CORS correctly', () => {
    new APIGatewayLambda(stack, 'TestAPI', {
      appName: 'TestApp',
      apiName: 'test-api',
      routes: [
        {
          method: 'GET',
          path: '/test',
          handler: testFunction,
        },
      ],
      corsOrigins: ['https://example.com', 'https://app.example.com'],
    });

    const template = Template.fromStack(stack);

    // Should create OPTIONS method for CORS
    template.hasResourceProperties('AWS::ApiGateway::Method', {
      HttpMethod: 'OPTIONS',
    });
  });

  test('creates CloudWatch monitoring', () => {
    new APIGatewayLambda(stack, 'TestAPI', {
      appName: 'TestApp',
      apiName: 'test-api',
      routes: [
        {
          method: 'GET',
          path: '/test',
          handler: testFunction,
        },
      ],
    });

    const template = Template.fromStack(stack);

    // Should create alarms for monitoring
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'TestApp-api-4xx-errors',
      MetricName: '4XXError',
      Namespace: 'AWS/ApiGateway',
    });

    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'TestApp-api-5xx-errors',
      MetricName: '5XXError',
      Namespace: 'AWS/ApiGateway',
    });

    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'TestApp-api-high-latency',
      MetricName: 'Latency',
      Namespace: 'AWS/ApiGateway',
    });
  });

  test('creates access logging when enabled', () => {
    new APIGatewayLambda(stack, 'TestAPI', {
      appName: 'TestApp',
      apiName: 'test-api',
      routes: [
        {
          method: 'GET',
          path: '/test',
          handler: testFunction,
        },
      ],
      enableAccessLogs: true,
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/aws/apigateway/test-api',
    });
  });

  test('creates required CfnOutputs', () => {
    new APIGatewayLambda(stack, 'TestAPI', {
      appName: 'TestApp',
      apiName: 'test-api',
      routes: [
        {
          method: 'GET',
          path: '/test',
          handler: testFunction,
        },
      ],
      throttle: {
        rateLimit: 100,
        burstLimit: 200,
      },
    });

    const template = Template.fromStack(stack);

    template.hasOutput('*ApiUrl*', {});
    template.hasOutput('*ApiId*', {});
    template.hasOutput('*ApiKeyId*', {});
    template.hasOutput('*RoutesSummary*', {});
  });

  test('applies correct tags', () => {
    new APIGatewayLambda(stack, 'TestAPI', {
      appName: 'TestApp',
      apiName: 'test-api',
      routes: [
        {
          method: 'GET',
          path: '/test',
          handler: testFunction,
        },
      ],
    });

    const template = Template.fromStack(stack);

    // Check that resources have required tags
    template.hasResourceProperties('AWS::ApiGateway::RestApi', {
      Tags: Match.arrayWith([
        { Key: 'Project', Value: 'TestApp' },
        { Key: 'ManagedBy', Value: 'cdk-ai-constructs' },
        { Key: 'Owner', Value: 'johnathan-horner' },
        { Key: 'Component', Value: 'APIGateway' },
      ]),
    });
  });

  test('handles authorization correctly', () => {
    new APIGatewayLambda(stack, 'TestAPI', {
      appName: 'TestApp',
      apiName: 'test-api',
      routes: [
        {
          method: 'GET',
          path: '/public',
          handler: testFunction,
          requiresAuth: false,
        },
        {
          method: 'GET',
          path: '/protected',
          handler: testFunction,
          requiresAuth: true,
        },
      ],
      cognitoAuthorizer: userPool,
    });

    const template = Template.fromStack(stack);

    // Should have both authorized and non-authorized methods
    const methods = template.findResources('AWS::ApiGateway::Method');
    const nonOptionsMethods = Object.values(methods).filter(
      (method: any) => method.Properties.HttpMethod !== 'OPTIONS'
    );

    expect(nonOptionsMethods.length).toBeGreaterThanOrEqual(2);
  });
});