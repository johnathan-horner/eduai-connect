import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { MultiTenantAuth } from '../lib/constructs/multi-tenant-auth';

describe('MultiTenantAuth', () => {
  let app: cdk.App;
  let stack: cdk.Stack;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack', {
      env: { account: '123456789012', region: 'us-east-1' },
    });
  });

  test('creates resources without error', () => {
    new MultiTenantAuth(stack, 'TestAuth', {
      appName: 'TestApp',
      callbackUrls: ['https://example.com/callback'],
    });

    const template = Template.fromStack(stack);
    expect(template).toBeDefined();
  });

  test('creates Cognito User Pool with correct configuration', () => {
    new MultiTenantAuth(stack, 'TestAuth', {
      appName: 'TestApp',
      callbackUrls: ['https://example.com/callback'],
      mfaRequired: true,
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Cognito::UserPool', {
      UserPoolName: 'TestApp-users',
      AutoVerifiedAttributes: ['email'],
      UsernameAttributes: ['email'],
      MfaConfiguration: 'ON',
      EnabledMfas: ['SMS_MFA', 'SOFTWARE_TOKEN_MFA'],
      Policies: {
        PasswordPolicy: {
          MinimumLength: 8,
          RequireLowercase: true,
          RequireNumbers: true,
          RequireSymbols: true,
          RequireUppercase: true,
        },
      },
    });
  });

  test('creates User Pool Client with OAuth configuration', () => {
    new MultiTenantAuth(stack, 'TestAuth', {
      appName: 'TestApp',
      callbackUrls: ['https://example.com/callback'],
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      UserPoolClientName: 'TestApp-client',
      GenerateSecret: false,
      SupportedIdentityProviders: ['COGNITO'],
      CallbackURLs: ['https://example.com/callback'],
      LogoutURLs: ['https://example.com/callback'],
      AllowedOAuthFlows: ['code'],
      AllowedOAuthScopes: ['openid', 'email', 'profile'],
    });
  });

  test('creates DynamoDB tenants table', () => {
    new MultiTenantAuth(stack, 'TestAuth', {
      appName: 'TestApp',
      callbackUrls: ['https://example.com/callback'],
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'TestApp-tenants',
      KeySchema: [
        {
          AttributeName: 'tenant_id',
          KeyType: 'HASH',
        },
      ],
      BillingMode: 'PAY_PER_REQUEST',
      PointInTimeRecoverySpecification: {
        PointInTimeRecoveryEnabled: true,
      },
    });

    // Check for GSI
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      GlobalSecondaryIndexes: Match.arrayWith([
        {
          IndexName: 'stripe-customer-index',
          KeySchema: [
            {
              AttributeName: 'stripe_customer_id',
              KeyType: 'HASH',
            },
          ],
          Projection: {
            ProjectionType: 'ALL',
          },
        },
      ]),
    });
  });

  test('creates post-confirmation Lambda trigger', () => {
    new MultiTenantAuth(stack, 'TestAuth', {
      appName: 'TestApp',
      callbackUrls: ['https://example.com/callback'],
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'TestApp-post-confirmation',
      Runtime: 'python3.11',
      Handler: 'index.handler',
    });

    // Check that User Pool has the trigger configured
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      LambdaConfig: {
        PostConfirmation: {
          Ref: Match.anyValue(),
        },
      },
    });
  });

  test('creates API Gateway authorizer', () => {
    new MultiTenantAuth(stack, 'TestAuth', {
      appName: 'TestApp',
      callbackUrls: ['https://example.com/callback'],
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::ApiGateway::Authorizer', {
      Name: 'TestApp-authorizer',
      Type: 'COGNITO_USER_POOLS',
      IdentitySource: 'method.request.header.Authorization',
    });
  });

  test('includes custom attributes in User Pool', () => {
    new MultiTenantAuth(stack, 'TestAuth', {
      appName: 'TestApp',
      callbackUrls: ['https://example.com/callback'],
      customAttributes: ['company_size', 'industry'],
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Cognito::UserPool', {
      Schema: Match.arrayWith([
        // Standard tenant attributes
        {
          AttributeDataType: 'String',
          Name: 'tenant_id',
          Mutable: true,
        },
        {
          AttributeDataType: 'String',
          Name: 'tier',
          Mutable: true,
        },
        {
          AttributeDataType: 'String',
          Name: 'plan',
          Mutable: true,
        },
        // Custom attributes
        {
          AttributeDataType: 'String',
          Name: 'company_size',
          Mutable: true,
        },
        {
          AttributeDataType: 'String',
          Name: 'industry',
          Mutable: true,
        },
      ]),
    });
  });

  test('creates User Pool Domain when prefix provided', () => {
    new MultiTenantAuth(stack, 'TestAuth', {
      appName: 'TestApp',
      callbackUrls: ['https://example.com/callback'],
      domainPrefix: 'testapp-auth',
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Cognito::UserPoolDomain', {
      Domain: 'testapp-auth',
    });
  });

  test('grants proper DynamoDB permissions to Lambda', () => {
    new MultiTenantAuth(stack, 'TestAuth', {
      appName: 'TestApp',
      callbackUrls: ['https://example.com/callback'],
    });

    const template = Template.fromStack(stack);

    // Check that Lambda has DynamoDB write permissions
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Allow',
            Action: Match.arrayWith(['dynamodb:PutItem']),
            Resource: {
              'Fn::GetAtt': [Match.anyValue(), 'Arn'],
            },
          }),
        ]),
      },
    });
  });

  test('creates required CfnOutputs', () => {
    new MultiTenantAuth(stack, 'TestAuth', {
      appName: 'TestApp',
      callbackUrls: ['https://example.com/callback'],
      domainPrefix: 'testapp-auth',
    });

    const template = Template.fromStack(stack);

    template.hasOutput('*UserPoolId*', {});
    template.hasOutput('*UserPoolClientId*', {});
    template.hasOutput('*TenantsTableName*', {});
    template.hasOutput('*TenantsTableArn*', {});
    template.hasOutput('*UserPoolDomainUrl*', {});
  });

  test('applies correct tags', () => {
    new MultiTenantAuth(stack, 'TestAuth', {
      appName: 'TestApp',
      callbackUrls: ['https://example.com/callback'],
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Cognito::UserPool', {
      UserPoolTags: {
        Project: 'TestApp',
        ManagedBy: 'cdk-ai-constructs',
        Owner: 'johnathan-horner',
        Component: 'MultiTenantAuth',
      },
    });
  });

  test('does not use wildcard actions in IAM policies', () => {
    new MultiTenantAuth(stack, 'TestAuth', {
      appName: 'TestApp',
      callbackUrls: ['https://example.com/callback'],
    });

    const template = Template.fromStack(stack);

    // Ensure no policies have wildcard actions
    const policies = template.findResources('AWS::IAM::Policy');
    Object.values(policies).forEach((policy: any) => {
      const statements = policy.Properties.PolicyDocument.Statement;
      statements.forEach((statement: any) => {
        if (Array.isArray(statement.Action)) {
          expect(statement.Action).not.toContain('*');
        } else if (typeof statement.Action === 'string') {
          expect(statement.Action).not.toBe('*');
        }
      });
    });
  });

  test('configures password policy correctly', () => {
    new MultiTenantAuth(stack, 'TestAuth', {
      appName: 'TestApp',
      callbackUrls: ['https://example.com/callback'],
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Cognito::UserPool', {
      Policies: {
        PasswordPolicy: {
          MinimumLength: 12,
          RequireLowercase: true,
          RequireNumbers: true,
          RequireSymbols: false,
          RequireUppercase: true,
        },
      },
    });
  });
});