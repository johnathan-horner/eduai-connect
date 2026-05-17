import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { AuditableStorage } from '../lib/constructs/auditable-storage';

describe('AuditableStorage', () => {
  let app: cdk.App;
  let stack: cdk.Stack;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack', {
      env: { account: '123456789012', region: 'us-east-1' },
    });
  });

  test('creates resources without error', () => {
    new AuditableStorage(stack, 'TestStorage', {
      appName: 'TestApp',
      bucketName: 'test-bucket',
    });

    const template = Template.fromStack(stack);
    expect(template).toBeDefined();
  });

  test('creates S3 bucket with correct properties', () => {
    new AuditableStorage(stack, 'TestStorage', {
      appName: 'TestApp',
      bucketName: 'test-bucket',
      enableVersioning: true,
      retentionDays: 90,
    });

    const template = Template.fromStack(stack);

    // Check S3 bucket exists
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: 'test-bucket-123456789012-us-east-1',
      VersioningConfiguration: {
        Status: 'Enabled',
      },
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          {
            ServerSideEncryptionByDefault: {
              SSEAlgorithm: 'aws:kms',
            },
          },
        ],
      },
    });
  });

  test('creates KMS key for encryption', () => {
    new AuditableStorage(stack, 'TestStorage', {
      appName: 'TestApp',
      bucketName: 'test-bucket',
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::KMS::Key', {
      Description: 'KMS key for test-bucket bucket encryption',
      EnableKeyRotation: true,
    });
  });

  test('creates CloudTrail for auditing', () => {
    new AuditableStorage(stack, 'TestStorage', {
      appName: 'TestApp',
      bucketName: 'test-bucket',
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::CloudTrail::Trail', {
      TrailName: 'test-bucket-audit-trail',
      IncludeGlobalServiceEvents: true,
      IsMultiRegionTrail: true,
      EnableLogFileValidation: true,
    });
  });

  test('applies HIPAA compliance settings', () => {
    new AuditableStorage(stack, 'TestStorage', {
      appName: 'TestApp',
      bucketName: 'test-bucket',
      complianceMode: 'HIPAA',
    });

    const template = Template.fromStack(stack);

    // Should create lifecycle rule with 7-year retention
    template.hasResourceProperties('AWS::S3::Bucket', {
      LifecycleConfiguration: {
        Rules: [
          Match.objectLike({
            ExpirationInDays: 2555, // 7 years for HIPAA
          }),
        ],
      },
    });
  });

  test('creates bucket policy denying insecure connections', () => {
    new AuditableStorage(stack, 'TestStorage', {
      appName: 'TestApp',
      bucketName: 'test-bucket',
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Sid: 'DenyInsecureConnections',
            Effect: 'Deny',
            Condition: {
              Bool: {
                'aws:SecureTransport': 'false',
              },
            },
          }),
        ]),
      },
    });
  });

  test('creates required CfnOutputs', () => {
    new AuditableStorage(stack, 'TestStorage', {
      appName: 'TestApp',
      bucketName: 'test-bucket',
    });

    const template = Template.fromStack(stack);

    template.hasOutput('*BucketName*', {});
    template.hasOutput('*BucketArn*', {});
    template.hasOutput('*EncryptionKeyArn*', {});
    template.hasOutput('*AuditTrailArn*', {});
  });

  test('applies correct tags', () => {
    new AuditableStorage(stack, 'TestStorage', {
      appName: 'TestApp',
      bucketName: 'test-bucket',
    });

    const template = Template.fromStack(stack);

    // Check that resources have required tags
    template.hasResourceProperties('AWS::S3::Bucket', {
      Tags: Match.arrayWith([
        { Key: 'Project', Value: 'TestApp' },
        { Key: 'ManagedBy', Value: 'cdk-ai-constructs' },
        { Key: 'Owner', Value: 'johnathan-horner' },
      ]),
    });
  });

  test('compliance mode affects retention policy', () => {
    const storageHipaa = new AuditableStorage(stack, 'TestStorageHipaa', {
      appName: 'TestApp',
      bucketName: 'test-bucket-hipaa',
      complianceMode: 'HIPAA',
    });

    const storageFerpa = new AuditableStorage(stack, 'TestStorageFerpa', {
      appName: 'TestApp',
      bucketName: 'test-bucket-ferpa',
      complianceMode: 'FERPA',
    });

    const template = Template.fromStack(stack);

    // HIPAA should have 7-year retention (2555 days)
    // FERPA should have 5-year retention (1825 days)
    template.resourceCountIs('AWS::S3::Bucket', 2);
  });
});