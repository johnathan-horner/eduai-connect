import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { ModelCardConstruct } from '../lib/constructs/model-card';

describe('ModelCardConstruct', () => {
  let app: cdk.App;
  let stack: cdk.Stack;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack', {
      env: { account: '123456789012', region: 'us-east-1' },
    });
  });

  test('creates resources without error', () => {
    new ModelCardConstruct(stack, 'TestModelCard', {
      appName: 'TestApp',
      modelName: 'test-model',
      modelVersion: '1.0.0',
      intendedUse: 'Test model for unit testing',
      trainingDataDescription: 'Synthetic test data',
      evaluationMetrics: [
        { name: 'accuracy', value: 0.95, unit: 'percentage' },
      ],
      limitations: ['Test limitation'],
    });

    const template = Template.fromStack(stack);
    expect(template).toBeDefined();
  });

  test('creates SageMaker Model Card with correct properties', () => {
    new ModelCardConstruct(stack, 'TestModelCard', {
      appName: 'TestApp',
      modelName: 'sentiment-classifier',
      modelVersion: '2.1.0',
      intendedUse: 'Classify text sentiment',
      trainingDataDescription: 'Customer feedback dataset',
      evaluationMetrics: [
        { name: 'accuracy', value: 0.94, unit: 'percentage' },
        { name: 'f1_score', value: 0.92 },
      ],
      limitations: ['English only', 'E-commerce bias'],
      complianceMode: 'HIPAA',
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::SageMaker::ModelCard', {
      ModelCardName: 'sentiment-classifier-2.1.0',
      ModelCardStatus: 'PendingReview',
      Content: {
        ModelOverview: {
          ModelName: 'sentiment-classifier',
          ModelVersion: '2.1.0',
          ModelDescription: 'sentiment-classifier version 2.1.0',
          ProblemType: 'Classification',
          AlgorithmType: 'Deep Learning',
        },
        IntendedUses: {
          PurposeOfModel: 'Classify text sentiment',
          IntendedUses: 'Classify text sentiment',
          RiskRating: 'High', // High because of HIPAA compliance
          RecommendedActions: 'Ensure compliance with HIPAA regulations',
        },
        TrainingDetails: {
          AlgorithmType: 'Deep Learning',
          TrainingDatasets: 'Customer feedback dataset',
        },
      },
    });
  });

  test('creates S3 bucket for artifacts', () => {
    new ModelCardConstruct(stack, 'TestModelCard', {
      appName: 'TestApp',
      modelName: 'test-model',
      modelVersion: '1.0.0',
      intendedUse: 'Testing',
      trainingDataDescription: 'Test data',
      evaluationMetrics: [{ name: 'accuracy', value: 0.95 }],
      limitations: ['Test only'],
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: 'testapp-model-cards-123456789012-us-east-1',
      VersioningConfiguration: {
        Status: 'Enabled',
      },
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          {
            ServerSideEncryptionByDefault: {
              SSEAlgorithm: 'AES256',
            },
          },
        ],
      },
    });

    // Check S3 object for model card JSON
    template.hasResourceProperties('AWS::S3::Object', {
      Key: 'model-cards/test-model-1.0.0/model-card.json',
      ContentType: 'application/json',
    });
  });

  test('creates DynamoDB model registry table', () => {
    new ModelCardConstruct(stack, 'TestModelCard', {
      appName: 'TestApp',
      modelName: 'test-model',
      modelVersion: '1.0.0',
      intendedUse: 'Testing',
      trainingDataDescription: 'Test data',
      evaluationMetrics: [{ name: 'accuracy', value: 0.95 }],
      limitations: ['Test only'],
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'TestApp-model-registry',
      KeySchema: [
        {
          AttributeName: 'model_id',
          KeyType: 'HASH',
        },
      ],
      BillingMode: 'PAY_PER_REQUEST',
      PointInTimeRecoverySpecification: {
        PointInTimeRecoveryEnabled: true,
      },
    });

    // Check GSI for compliance mode queries
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      GlobalSecondaryIndexes: Match.arrayWith([
        {
          IndexName: 'compliance-mode-index',
          KeySchema: [
            {
              AttributeName: 'compliance_mode',
              KeyType: 'HASH',
            },
            {
              AttributeName: 'created_at',
              KeyType: 'RANGE',
            },
          ],
          Projection: {
            ProjectionType: 'ALL',
          },
        },
      ]),
    });
  });

  test('creates DynamoDB item with model metadata', () => {
    new ModelCardConstruct(stack, 'TestModelCard', {
      appName: 'TestApp',
      modelName: 'test-model',
      modelVersion: '1.0.0',
      intendedUse: 'Testing',
      trainingDataDescription: 'Test data',
      evaluationMetrics: [{ name: 'accuracy', value: 0.95 }],
      limitations: ['Test only'],
      complianceMode: 'FERPA',
      responsibleTeam: 'Test Team',
      contactEmail: 'test@example.com',
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::DynamoDB::Item', {
      Item: {
        model_id: { S: 'test-model-1.0.0' },
        model_name: { S: 'test-model' },
        model_version: { S: '1.0.0' },
        intended_use: { S: 'Testing' },
        training_data_description: { S: 'Test data' },
        compliance_mode: { S: 'FERPA' },
        responsible_team: { S: 'Test Team' },
        contact_email: { S: 'test@example.com' },
      },
    });
  });

  test('creates CloudTrail for audit logging', () => {
    new ModelCardConstruct(stack, 'TestModelCard', {
      appName: 'TestApp',
      modelName: 'test-model',
      modelVersion: '1.0.0',
      intendedUse: 'Testing',
      trainingDataDescription: 'Test data',
      evaluationMetrics: [{ name: 'accuracy', value: 0.95 }],
      limitations: ['Test only'],
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::CloudTrail::Trail', {
      TrailName: 'TestApp-model-card-audit-trail',
      IncludeGlobalServiceEvents: false,
      IsMultiRegionTrail: false,
      EnableLogFileValidation: true,
    });
  });

  test('handles evaluation metrics correctly', () => {
    const metrics = [
      { name: 'accuracy', value: 0.94, unit: 'percentage' },
      { name: 'f1_score', value: 0.92 },
      { name: 'precision', value: 0.93, unit: 'score' },
    ];

    new ModelCardConstruct(stack, 'TestModelCard', {
      appName: 'TestApp',
      modelName: 'test-model',
      modelVersion: '1.0.0',
      intendedUse: 'Testing',
      trainingDataDescription: 'Test data',
      evaluationMetrics: metrics,
      limitations: ['Test only'],
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::SageMaker::ModelCard', {
      Content: {
        TrainingDetails: {
          TrainingMetrics: [
            { name: 'accuracy', value: 0.94, notes: 'percentage' },
            { name: 'f1_score', value: 0.92, notes: '' },
            { name: 'precision', value: 0.93, notes: 'score' },
          ],
        },
      },
    });
  });

  test('uses default values correctly', () => {
    new ModelCardConstruct(stack, 'TestModelCard', {
      appName: 'TestApp',
      modelName: 'test-model',
      modelVersion: '1.0.0',
      intendedUse: 'Testing',
      trainingDataDescription: 'Test data',
      evaluationMetrics: [{ name: 'accuracy', value: 0.95 }],
      limitations: ['Test only'],
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::DynamoDB::Item', {
      Item: {
        responsible_team: { S: 'Shoot It Analytics LLC' },
        contact_email: { S: 'mrhorner819@gmail.com' },
      },
    });
  });

  test('applies compliance mode tags when specified', () => {
    new ModelCardConstruct(stack, 'TestModelCard', {
      appName: 'TestApp',
      modelName: 'test-model',
      modelVersion: '1.0.0',
      intendedUse: 'Testing',
      trainingDataDescription: 'Test data',
      evaluationMetrics: [{ name: 'accuracy', value: 0.95 }],
      limitations: ['Test only'],
      complianceMode: 'HIPAA',
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::SageMaker::ModelCard', {
      Tags: Match.arrayWith([
        { Key: 'ComplianceMode', Value: 'HIPAA' },
        { Key: 'Project', Value: 'TestApp' },
        { Key: 'ManagedBy', Value: 'cdk-ai-constructs' },
        { Key: 'Owner', Value: 'johnathan-horner' },
        { Key: 'Component', Value: 'ModelCard' },
      ]),
    });
  });

  test('creates required CfnOutputs', () => {
    new ModelCardConstruct(stack, 'TestModelCard', {
      appName: 'TestApp',
      modelName: 'test-model',
      modelVersion: '1.0.0',
      intendedUse: 'Testing',
      trainingDataDescription: 'Test data',
      evaluationMetrics: [{ name: 'accuracy', value: 0.95 }],
      limitations: ['Test only'],
    });

    const template = Template.fromStack(stack);

    template.hasOutput('*ModelCardName*', {});
    template.hasOutput('*ModelCardS3Url*', {});
    template.hasOutput('*ModelCardDynamoKey*', {});
    template.hasOutput('*ModelRegistryTableName*', {});
    template.hasOutput('*ModelId*', {});
    template.hasOutput('*AuditTrailArn*', {});
  });

  test('handles out of scope use cases', () => {
    new ModelCardConstruct(stack, 'TestModelCard', {
      appName: 'TestApp',
      modelName: 'test-model',
      modelVersion: '1.0.0',
      intendedUse: 'Testing',
      trainingDataDescription: 'Test data',
      evaluationMetrics: [{ name: 'accuracy', value: 0.95 }],
      limitations: ['Test only'],
      outOfScopeUse: [
        'Medical diagnosis',
        'Legal decisions',
        'Financial trading',
      ],
    });

    const template = Template.fromStack(stack);
    expect(template).toBeDefined();
    // Out of scope use is stored in S3 JSON artifact and would need
    // integration test to verify content
  });

  test('handles bias considerations', () => {
    new ModelCardConstruct(stack, 'TestModelCard', {
      appName: 'TestApp',
      modelName: 'test-model',
      modelVersion: '1.0.0',
      intendedUse: 'Testing',
      trainingDataDescription: 'Test data',
      evaluationMetrics: [{ name: 'accuracy', value: 0.95 }],
      limitations: ['Test only'],
      biasConsiderations: 'Geographic bias in training data',
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::SageMaker::ModelCard', {
      Content: {
        AdditionalInformation: {
          EthicalConsiderations: 'Geographic bias in training data',
        },
      },
    });
  });

  test('applies correct tags to all resources', () => {
    new ModelCardConstruct(stack, 'TestModelCard', {
      appName: 'TestApp',
      modelName: 'test-model',
      modelVersion: '1.0.0',
      intendedUse: 'Testing',
      trainingDataDescription: 'Test data',
      evaluationMetrics: [{ name: 'accuracy', value: 0.95 }],
      limitations: ['Test only'],
      responsibleTeam: 'Test Team',
    });

    const template = Template.fromStack(stack);

    // Check tags on various resources
    template.hasResourceProperties('AWS::S3::Bucket', {
      Tags: Match.arrayWith([
        { Key: 'Project', Value: 'TestApp' },
        { Key: 'ManagedBy', Value: 'cdk-ai-constructs' },
        { Key: 'Owner', Value: 'johnathan-horner' },
        { Key: 'Component', Value: 'ModelCard' },
        { Key: 'ModelName', Value: 'test-model' },
        { Key: 'ResponsibleTeam', Value: 'Test Team' },
      ]),
    });

    template.hasResourceProperties('AWS::DynamoDB::Table', {
      Tags: Match.arrayWith([
        { Key: 'Project', Value: 'TestApp' },
        { Key: 'Component', Value: 'ModelCard' },
      ]),
    });
  });

  test('generates unique model ID correctly', () => {
    const construct = new ModelCardConstruct(stack, 'TestModelCard', {
      appName: 'TestApp',
      modelName: 'sentiment-classifier',
      modelVersion: '2.1.0',
      intendedUse: 'Testing',
      trainingDataDescription: 'Test data',
      evaluationMetrics: [{ name: 'accuracy', value: 0.95 }],
      limitations: ['Test only'],
    });

    expect(construct.modelId).toBe('sentiment-classifier-2.1.0');
    expect(construct.modelCardS3Key).toBe('model-cards/sentiment-classifier-2.1.0/model-card.json');
  });

  test('handles additional metadata', () => {
    new ModelCardConstruct(stack, 'TestModelCard', {
      appName: 'TestApp',
      modelName: 'test-model',
      modelVersion: '1.0.0',
      intendedUse: 'Testing',
      trainingDataDescription: 'Test data',
      evaluationMetrics: [{ name: 'accuracy', value: 0.95 }],
      limitations: ['Test only'],
      additionalMetadata: {
        framework: 'PyTorch',
        training_time: '24 hours',
        data_size: '1TB',
      },
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::SageMaker::ModelCard', {
      Content: {
        AdditionalInformation: {
          CustomDetails: {
            framework: 'PyTorch',
            training_time: '24 hours',
            data_size: '1TB',
          },
        },
      },
    });
  });
});