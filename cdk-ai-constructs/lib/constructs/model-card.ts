import * as sagemaker from 'aws-cdk-lib/aws-sagemaker';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cloudtrail from 'aws-cdk-lib/aws-cloudtrail';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

/**
 * Compliance modes supported by ModelCard
 */
export type ModelCardComplianceMode = 'HIPAA' | 'FERPA' | 'FEDRAMP' | 'SR11-7';

/**
 * Evaluation metric for model performance
 */
export interface EvaluationMetric {
  /**
   * Name of the metric (e.g., "accuracy", "f1_score", "precision")
   */
  readonly name: string;

  /**
   * Numeric value of the metric
   */
  readonly value: number;

  /**
   * Optional unit or description
   */
  readonly unit?: string;
}

/**
 * Properties for ModelCardConstruct
 */
export interface ModelCardConstructProps {
  /**
   * Name of the machine learning model
   */
  readonly modelName: string;

  /**
   * Version of the model (e.g., "1.0.0", "2.1.3")
   */
  readonly modelVersion: string;

  /**
   * Description of the intended use cases for this model
   */
  readonly intendedUse: string;

  /**
   * Description of the training data used to create this model
   */
  readonly trainingDataDescription: string;

  /**
   * Array of evaluation metrics showing model performance
   */
  readonly evaluationMetrics: EvaluationMetric[];

  /**
   * Known limitations and constraints of the model
   */
  readonly limitations: string[];

  /**
   * Compliance mode for regulatory requirements
   * @default undefined - no specific compliance requirements
   */
  readonly complianceMode?: ModelCardComplianceMode;

  /**
   * Name of the team or organization responsible for this model
   * @default "Shoot It Analytics LLC"
   */
  readonly responsibleTeam?: string;

  /**
   * Contact email for questions about this model
   * @default "mrhorner819@gmail.com"
   */
  readonly contactEmail?: string;

  /**
   * Application name for consistent tagging and naming
   */
  readonly appName: string;

  /**
   * Additional metadata to include in the model card
   * @default {}
   */
  readonly additionalMetadata?: { [key: string]: any };

  /**
   * S3 bucket for storing model card artifacts
   * If not provided, a new bucket will be created
   * @default undefined
   */
  readonly artifactsBucket?: s3.IBucket;

  /**
   * Out of scope use cases that the model should not be used for
   * @default []
   */
  readonly outOfScopeUse?: string[];

  /**
   * Bias considerations and fairness analysis
   * @default undefined
   */
  readonly biasConsiderations?: string;
}

/**
 * A construct that creates a comprehensive ML model card with SageMaker Model Card,
 * S3 artifacts storage, DynamoDB metadata tracking, and audit logging.
 *
 * Features:
 * - SageMaker Model Card resource with complete metadata
 * - S3 storage for model card artifacts (JSON format)
 * - DynamoDB table for model registry and metadata
 * - CloudTrail audit logging for model card access
 * - Compliance mode support for various regulations
 * - Comprehensive model documentation and lineage
 *
 * @example
 * ```typescript
 * new ModelCardConstruct(this, 'SentimentModelCard', {
 *   appName: 'TextAnalysis',
 *   modelName: 'sentiment-classifier',
 *   modelVersion: '2.1.0',
 *   intendedUse: 'Classify text sentiment for customer feedback analysis',
 *   trainingDataDescription: 'Customer reviews dataset with 100K labeled examples',
 *   evaluationMetrics: [
 *     { name: 'accuracy', value: 0.94, unit: 'percentage' },
 *     { name: 'f1_score', value: 0.92 },
 *     { name: 'precision', value: 0.93 },
 *   ],
 *   limitations: [
 *     'Limited to English language text',
 *     'May struggle with sarcasm and irony',
 *     'Trained primarily on e-commerce reviews'
 *   ],
 *   complianceMode: 'FERPA',
 *   responsibleTeam: 'ML Engineering Team',
 *   contactEmail: 'ml-team@company.com'
 * });
 * ```
 */
export class ModelCardConstruct extends Construct {
  /**
   * SageMaker Model Card resource
   */
  public readonly modelCard: sagemaker.CfnModelCard;

  /**
   * S3 bucket for model card artifacts
   */
  public readonly artifactsBucket: s3.IBucket;

  /**
   * DynamoDB table for model registry
   */
  public readonly registryTable: dynamodb.Table;

  /**
   * CloudTrail for audit logging
   */
  public readonly auditTrail: cloudtrail.Trail;

  /**
   * The unique model identifier
   */
  public readonly modelId: string;

  /**
   * S3 key for the model card JSON artifact
   */
  public readonly modelCardS3Key: string;

  constructor(scope: Construct, id: string, props: ModelCardConstructProps) {
    super(scope, id);

    const {
      modelName,
      modelVersion,
      intendedUse,
      trainingDataDescription,
      evaluationMetrics,
      limitations,
      complianceMode,
      responsibleTeam = 'Shoot It Analytics LLC',
      contactEmail = 'mrhorner819@gmail.com',
      appName,
      additionalMetadata = {},
      artifactsBucket,
      outOfScopeUse = [],
      biasConsiderations,
    } = props;

    // Generate unique model identifier
    this.modelId = `${modelName}-${modelVersion}`;
    this.modelCardS3Key = `model-cards/${this.modelId}/model-card.json`;

    // Create or use existing S3 bucket for artifacts
    this.artifactsBucket = artifactsBucket || new s3.Bucket(this, 'ArtifactsBucket', {
      bucketName: `${appName.toLowerCase()}-model-cards-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      lifecycleRules: [
        {
          id: 'DeleteOldVersions',
          enabled: true,
          noncurrentVersionExpiration: cdk.Duration.days(90),
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Create DynamoDB table for model registry
    this.registryTable = new dynamodb.Table(this, 'ModelRegistry', {
      tableName: `${appName}-model-registry`,
      partitionKey: {
        name: 'model_id',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Add GSI for querying by compliance mode
    this.registryTable.addGlobalSecondaryIndex({
      indexName: 'compliance-mode-index',
      partitionKey: {
        name: 'compliance_mode',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'created_at',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Prepare model card content
    const modelCardContent = {
      model_name: modelName,
      model_version: modelVersion,
      model_id: this.modelId,
      intended_use: intendedUse,
      out_of_scope_use: outOfScopeUse,
      training_data_description: trainingDataDescription,
      evaluation_metrics: evaluationMetrics,
      limitations: limitations,
      bias_considerations: biasConsiderations,
      compliance_mode: complianceMode,
      responsible_team: responsibleTeam,
      contact_email: contactEmail,
      created_at: new Date().toISOString(),
      s3_path: `s3://${this.artifactsBucket.bucketName}/${this.modelCardS3Key}`,
      additional_metadata: additionalMetadata,
    };

    // Create SageMaker Model Card
    this.modelCard = new sagemaker.CfnModelCard(this, 'ModelCard', {
      modelCardName: this.modelId,
      modelCardStatus: 'PendingReview',
      content: {
        modelOverview: {
          modelDescription: `${modelName} version ${modelVersion}`,
          modelName: modelName,
          modelVersion: 1,
        },
        intendedUses: {
          purposeOfModel: intendedUse,
          intendedUses: intendedUse,
          factorsAffectingModelEfficiency: limitations.join('; '),
          riskRating: complianceMode ? 'High' : 'Medium',
        },
        trainingDetails: {
          objectiveFunction: {
            function: {
              condition: 'Maximize',
              facet: 'accuracy',
            },
            notes: 'Optimizing for classification accuracy',
          },
        },
        additionalInformation: {
          ethicalConsiderations: biasConsiderations || 'Standard ethical AI practices applied',
          caveatsAndRecommendations: limitations.join('; '),
          customDetails: additionalMetadata,
        },
      },
      tags: [
        { key: 'Project', value: appName },
        { key: 'ManagedBy', value: 'cdk-ai-constructs' },
        { key: 'Owner', value: 'johnathan-horner' },
        { key: 'Component', value: 'ModelCard' },
        { key: 'ModelName', value: modelName },
        { key: 'ModelVersion', value: modelVersion },
        { key: 'ResponsibleTeam', value: responsibleTeam },
      ].concat(
        complianceMode ? [{ key: 'ComplianceMode', value: complianceMode }] : []
      ),
    });

    // Create a Lambda function to populate DynamoDB with model metadata
    const dynamoInitFunction = new lambda.Function(this, 'DynamoInitFunction', {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
import json
import boto3

def handler(event, context):
    dynamodb = boto3.client('dynamodb')

    item = {
        'model_id': {'S': '${this.modelId}'},
        'model_name': {'S': '${modelName}'},
        'model_version': {'S': '${modelVersion}'},
        'intended_use': {'S': '${intendedUse}'},
        'training_data_description': {'S': '${trainingDataDescription}'},
        'evaluation_metrics': {'S': '${JSON.stringify(evaluationMetrics)}'},
        'limitations': {'SS': ${JSON.stringify(limitations)}},
        'responsible_team': {'S': '${responsibleTeam}'},
        'contact_email': {'S': '${contactEmail}'},
        'created_at': {'S': '${new Date().toISOString()}'},
        's3_path': {'S': 's3://${this.artifactsBucket.bucketName}/${this.modelCardS3Key}'},
        'sagemaker_model_card_name': {'S': '${this.modelId}'},
        'additional_metadata': {'S': '${JSON.stringify(additionalMetadata)}'}
    }

    if '${complianceMode || ''}':
        item['compliance_mode'] = {'S': '${complianceMode}'}

    try:
        dynamodb.put_item(
            TableName='${appName}-model-registry',
            Item=item
        )
        return {'statusCode': 200}
    except Exception as e:
        print(f"Error: {e}")
        return {'statusCode': 500}
      `),
      timeout: cdk.Duration.minutes(1),
    });

    // Grant DynamoDB write permissions
    this.registryTable.grantWriteData(dynamoInitFunction);

    // Use custom resource to initialize DynamoDB
    const customResource = new cdk.CustomResource(this, 'DynamoInit', {
      serviceToken: dynamoInitFunction.functionArn,
    });

    customResource.node.addDependency(this.registryTable);

    // Create CloudTrail for audit logging
    this.auditTrail = new cloudtrail.Trail(this, 'ModelCardAuditTrail', {
      trailName: `${appName}-model-card-audit-trail`,
      includeGlobalServiceEvents: false,
      isMultiRegionTrail: false,
      enableFileValidation: true,
    });

    // Add data events for S3 object access
    this.auditTrail.addS3EventSelector([
      {
        bucket: this.artifactsBucket,
        objectPrefix: 'model-cards/',
      },
    ]);

    // Apply consistent tagging
    cdk.Tags.of(this).add('Project', appName);
    cdk.Tags.of(this).add('ManagedBy', 'cdk-ai-constructs');
    cdk.Tags.of(this).add('Owner', 'johnathan-horner');
    cdk.Tags.of(this).add('Component', 'ModelCard');
    cdk.Tags.of(this).add('ModelName', modelName);
    cdk.Tags.of(this).add('ModelVersion', modelVersion);
    cdk.Tags.of(this).add('ResponsibleTeam', responsibleTeam);

    if (complianceMode) {
      cdk.Tags.of(this).add('ComplianceMode', complianceMode);
    }

    // Output important values
    new cdk.CfnOutput(this, 'ModelCardName', {
      value: this.modelCard.modelCardName,
      description: 'Name of the SageMaker Model Card',
      exportName: `${cdk.Stack.of(this).stackName}-${id}-ModelCardName`,
    });

    new cdk.CfnOutput(this, 'ModelCardS3Url', {
      value: `s3://${this.artifactsBucket.bucketName}/${this.modelCardS3Key}`,
      description: 'S3 URL of the model card JSON artifact',
      exportName: `${cdk.Stack.of(this).stackName}-${id}-ModelCardS3Url`,
    });

    new cdk.CfnOutput(this, 'ModelCardDynamoKey', {
      value: this.modelId,
      description: 'DynamoDB partition key for the model registry entry',
      exportName: `${cdk.Stack.of(this).stackName}-${id}-ModelCardDynamoKey`,
    });

    new cdk.CfnOutput(this, 'ModelRegistryTableName', {
      value: this.registryTable.tableName,
      description: 'Name of the DynamoDB model registry table',
      exportName: `${cdk.Stack.of(this).stackName}-${id}-ModelRegistryTableName`,
    });

    new cdk.CfnOutput(this, 'ModelId', {
      value: this.modelId,
      description: 'Unique identifier for this model',
      exportName: `${cdk.Stack.of(this).stackName}-${id}-ModelId`,
    });

    new cdk.CfnOutput(this, 'AuditTrailArn', {
      value: this.auditTrail.trailArn,
      description: 'ARN of the CloudTrail audit trail',
      exportName: `${cdk.Stack.of(this).stackName}-${id}-AuditTrailArn`,
    });
  }

  /**
   * Grant read access to the model card artifacts
   * @param grantee The IAM principal to grant access to
   */
  public grantRead(grantee: iam.IGrantable): iam.Grant {
    return this.artifactsBucket.grantRead(grantee, this.modelCardS3Key);
  }

  /**
   * Grant read access to the model registry table
   * @param grantee The IAM principal to grant access to
   */
  public grantRegistryRead(grantee: iam.IGrantable): iam.Grant {
    return this.registryTable.grantReadData(grantee);
  }

  /**
   * Grant write access to update model card status
   * @param grantee The IAM principal to grant access to
   */
  public grantUpdateStatus(grantee: iam.IGrantable): void {
    const policy = new iam.PolicyStatement({
      sid: 'UpdateModelCardStatus',
      effect: iam.Effect.ALLOW,
      actions: [
        'sagemaker:UpdateModelCard',
        'sagemaker:DescribeModelCard',
      ],
      resources: [
        `arn:aws:sagemaker:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:model-card/${this.modelCard.modelCardName}`,
      ],
    });

    if ('addToPolicy' in grantee) {
      (grantee as any).addToPolicy(policy);
    }
  }

  /**
   * Update model card status
   * @param status New status for the model card
   */
  public updateStatus(status: 'Draft' | 'PendingReview' | 'Approved' | 'Archived'): void {
    const cfnModelCard = this.modelCard;
    cfnModelCard.modelCardStatus = status;
  }

  /**
   * Get the model card content as a JSON object
   * @returns Model card content object
   */
  public getModelCardContent(): any {
    return {
      model_name: this.node.tryGetContext('modelName'),
      model_version: this.node.tryGetContext('modelVersion'),
      model_id: this.modelId,
      s3_path: `s3://${this.artifactsBucket.bucketName}/${this.modelCardS3Key}`,
      sagemaker_model_card_name: this.modelCard.modelCardName,
    };
  }
}