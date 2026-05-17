"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelCardConstruct = void 0;
const sagemaker = require("aws-cdk-lib/aws-sagemaker");
const s3 = require("aws-cdk-lib/aws-s3");
const dynamodb = require("aws-cdk-lib/aws-dynamodb");
const cloudtrail = require("aws-cdk-lib/aws-cloudtrail");
const iam = require("aws-cdk-lib/aws-iam");
const lambda = require("aws-cdk-lib/aws-lambda");
const cdk = require("aws-cdk-lib");
const constructs_1 = require("constructs");
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
class ModelCardConstruct extends constructs_1.Construct {
    /**
     * SageMaker Model Card resource
     */
    modelCard;
    /**
     * S3 bucket for model card artifacts
     */
    artifactsBucket;
    /**
     * DynamoDB table for model registry
     */
    registryTable;
    /**
     * CloudTrail for audit logging
     */
    auditTrail;
    /**
     * The unique model identifier
     */
    modelId;
    /**
     * S3 key for the model card JSON artifact
     */
    modelCardS3Key;
    constructor(scope, id, props) {
        super(scope, id);
        const { modelName, modelVersion, intendedUse, trainingDataDescription, evaluationMetrics, limitations, complianceMode, responsibleTeam = 'Shoot It Analytics LLC', contactEmail = 'mrhorner819@gmail.com', appName, additionalMetadata = {}, artifactsBucket, outOfScopeUse = [], biasConsiderations, } = props;
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
            ].concat(complianceMode ? [{ key: 'ComplianceMode', value: complianceMode }] : []),
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
    grantRead(grantee) {
        return this.artifactsBucket.grantRead(grantee, this.modelCardS3Key);
    }
    /**
     * Grant read access to the model registry table
     * @param grantee The IAM principal to grant access to
     */
    grantRegistryRead(grantee) {
        return this.registryTable.grantReadData(grantee);
    }
    /**
     * Grant write access to update model card status
     * @param grantee The IAM principal to grant access to
     */
    grantUpdateStatus(grantee) {
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
            grantee.addToPolicy(policy);
        }
    }
    /**
     * Update model card status
     * @param status New status for the model card
     */
    updateStatus(status) {
        const cfnModelCard = this.modelCard;
        cfnModelCard.modelCardStatus = status;
    }
    /**
     * Get the model card content as a JSON object
     * @returns Model card content object
     */
    getModelCardContent() {
        return {
            model_name: this.node.tryGetContext('modelName'),
            model_version: this.node.tryGetContext('modelVersion'),
            model_id: this.modelId,
            s3_path: `s3://${this.artifactsBucket.bucketName}/${this.modelCardS3Key}`,
            sagemaker_model_card_name: this.modelCard.modelCardName,
        };
    }
}
exports.ModelCardConstruct = ModelCardConstruct;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kZWwtY2FyZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2NvbnN0cnVjdHMvbW9kZWwtY2FyZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSx1REFBdUQ7QUFDdkQseUNBQXlDO0FBQ3pDLHFEQUFxRDtBQUNyRCx5REFBeUQ7QUFDekQsMkNBQTJDO0FBQzNDLGlEQUFpRDtBQUNqRCxtQ0FBbUM7QUFDbkMsMkNBQXVDO0FBOEd2Qzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FtQ0c7QUFDSCxNQUFhLGtCQUFtQixTQUFRLHNCQUFTO0lBQy9DOztPQUVHO0lBQ2EsU0FBUyxDQUF5QjtJQUVsRDs7T0FFRztJQUNhLGVBQWUsQ0FBYTtJQUU1Qzs7T0FFRztJQUNhLGFBQWEsQ0FBaUI7SUFFOUM7O09BRUc7SUFDYSxVQUFVLENBQW1CO0lBRTdDOztPQUVHO0lBQ2EsT0FBTyxDQUFTO0lBRWhDOztPQUVHO0lBQ2EsY0FBYyxDQUFTO0lBRXZDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBOEI7UUFDdEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixNQUFNLEVBQ0osU0FBUyxFQUNULFlBQVksRUFDWixXQUFXLEVBQ1gsdUJBQXVCLEVBQ3ZCLGlCQUFpQixFQUNqQixXQUFXLEVBQ1gsY0FBYyxFQUNkLGVBQWUsR0FBRyx3QkFBd0IsRUFDMUMsWUFBWSxHQUFHLHVCQUF1QixFQUN0QyxPQUFPLEVBQ1Asa0JBQWtCLEdBQUcsRUFBRSxFQUN2QixlQUFlLEVBQ2YsYUFBYSxHQUFHLEVBQUUsRUFDbEIsa0JBQWtCLEdBQ25CLEdBQUcsS0FBSyxDQUFDO1FBRVYsbUNBQW1DO1FBQ25DLElBQUksQ0FBQyxPQUFPLEdBQUcsR0FBRyxTQUFTLElBQUksWUFBWSxFQUFFLENBQUM7UUFDOUMsSUFBSSxDQUFDLGNBQWMsR0FBRyxlQUFlLElBQUksQ0FBQyxPQUFPLGtCQUFrQixDQUFD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QVcsQ0FBQztZQUNoRCxhQUFhLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsY0FBYyxDQUFDO1lBQ3RELFFBQVEsRUFBRSxJQUFJLENBQUMsT0FBTztZQUN0QixPQUFPLEVBQUUsUUFBUSxJQUFJLENBQUMsZUFBZSxDQUFDLFVBQVUsSUFBSSxJQUFJLENBQUMsY0FBYyxFQUFFO1lBQ3pFLHlCQUF5QixFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsYUFBYTtTQUN4RCxDQUFDO0lBQ0osQ0FBQztDQUNGO0FBeFZELGdEQXdWQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIHNhZ2VtYWtlciBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc2FnZW1ha2VyJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgKiBhcyBkeW5hbW9kYiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGInO1xuaW1wb3J0ICogYXMgY2xvdWR0cmFpbCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWR0cmFpbCc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5cbi8qKlxuICogQ29tcGxpYW5jZSBtb2RlcyBzdXBwb3J0ZWQgYnkgTW9kZWxDYXJkXG4gKi9cbmV4cG9ydCB0eXBlIE1vZGVsQ2FyZENvbXBsaWFuY2VNb2RlID0gJ0hJUEFBJyB8ICdGRVJQQScgfCAnRkVEUkFNUCcgfCAnU1IxMS03JztcblxuLyoqXG4gKiBFdmFsdWF0aW9uIG1ldHJpYyBmb3IgbW9kZWwgcGVyZm9ybWFuY2VcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBFdmFsdWF0aW9uTWV0cmljIHtcbiAgLyoqXG4gICAqIE5hbWUgb2YgdGhlIG1ldHJpYyAoZS5nLiwgXCJhY2N1cmFjeVwiLCBcImYxX3Njb3JlXCIsIFwicHJlY2lzaW9uXCIpXG4gICAqL1xuICByZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIE51bWVyaWMgdmFsdWUgb2YgdGhlIG1ldHJpY1xuICAgKi9cbiAgcmVhZG9ubHkgdmFsdWU6IG51bWJlcjtcblxuICAvKipcbiAgICogT3B0aW9uYWwgdW5pdCBvciBkZXNjcmlwdGlvblxuICAgKi9cbiAgcmVhZG9ubHkgdW5pdD86IHN0cmluZztcbn1cblxuLyoqXG4gKiBQcm9wZXJ0aWVzIGZvciBNb2RlbENhcmRDb25zdHJ1Y3RcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBNb2RlbENhcmRDb25zdHJ1Y3RQcm9wcyB7XG4gIC8qKlxuICAgKiBOYW1lIG9mIHRoZSBtYWNoaW5lIGxlYXJuaW5nIG1vZGVsXG4gICAqL1xuICByZWFkb25seSBtb2RlbE5hbWU6IHN0cmluZztcblxuICAvKipcbiAgICogVmVyc2lvbiBvZiB0aGUgbW9kZWwgKGUuZy4sIFwiMS4wLjBcIiwgXCIyLjEuM1wiKVxuICAgKi9cbiAgcmVhZG9ubHkgbW9kZWxWZXJzaW9uOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIERlc2NyaXB0aW9uIG9mIHRoZSBpbnRlbmRlZCB1c2UgY2FzZXMgZm9yIHRoaXMgbW9kZWxcbiAgICovXG4gIHJlYWRvbmx5IGludGVuZGVkVXNlOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIERlc2NyaXB0aW9uIG9mIHRoZSB0cmFpbmluZyBkYXRhIHVzZWQgdG8gY3JlYXRlIHRoaXMgbW9kZWxcbiAgICovXG4gIHJlYWRvbmx5IHRyYWluaW5nRGF0YURlc2NyaXB0aW9uOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEFycmF5IG9mIGV2YWx1YXRpb24gbWV0cmljcyBzaG93aW5nIG1vZGVsIHBlcmZvcm1hbmNlXG4gICAqL1xuICByZWFkb25seSBldmFsdWF0aW9uTWV0cmljczogRXZhbHVhdGlvbk1ldHJpY1tdO1xuXG4gIC8qKlxuICAgKiBLbm93biBsaW1pdGF0aW9ucyBhbmQgY29uc3RyYWludHMgb2YgdGhlIG1vZGVsXG4gICAqL1xuICByZWFkb25seSBsaW1pdGF0aW9uczogc3RyaW5nW107XG5cbiAgLyoqXG4gICAqIENvbXBsaWFuY2UgbW9kZSBmb3IgcmVndWxhdG9yeSByZXF1aXJlbWVudHNcbiAgICogQGRlZmF1bHQgdW5kZWZpbmVkIC0gbm8gc3BlY2lmaWMgY29tcGxpYW5jZSByZXF1aXJlbWVudHNcbiAgICovXG4gIHJlYWRvbmx5IGNvbXBsaWFuY2VNb2RlPzogTW9kZWxDYXJkQ29tcGxpYW5jZU1vZGU7XG5cbiAgLyoqXG4gICAqIE5hbWUgb2YgdGhlIHRlYW0gb3Igb3JnYW5pemF0aW9uIHJlc3BvbnNpYmxlIGZvciB0aGlzIG1vZGVsXG4gICAqIEBkZWZhdWx0IFwiU2hvb3QgSXQgQW5hbHl0aWNzIExMQ1wiXG4gICAqL1xuICByZWFkb25seSByZXNwb25zaWJsZVRlYW0/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIENvbnRhY3QgZW1haWwgZm9yIHF1ZXN0aW9ucyBhYm91dCB0aGlzIG1vZGVsXG4gICAqIEBkZWZhdWx0IFwibXJob3JuZXI4MTlAZ21haWwuY29tXCJcbiAgICovXG4gIHJlYWRvbmx5IGNvbnRhY3RFbWFpbD86IHN0cmluZztcblxuICAvKipcbiAgICogQXBwbGljYXRpb24gbmFtZSBmb3IgY29uc2lzdGVudCB0YWdnaW5nIGFuZCBuYW1pbmdcbiAgICovXG4gIHJlYWRvbmx5IGFwcE5hbWU6IHN0cmluZztcblxuICAvKipcbiAgICogQWRkaXRpb25hbCBtZXRhZGF0YSB0byBpbmNsdWRlIGluIHRoZSBtb2RlbCBjYXJkXG4gICAqIEBkZWZhdWx0IHt9XG4gICAqL1xuICByZWFkb25seSBhZGRpdGlvbmFsTWV0YWRhdGE/OiB7IFtrZXk6IHN0cmluZ106IGFueSB9O1xuXG4gIC8qKlxuICAgKiBTMyBidWNrZXQgZm9yIHN0b3JpbmcgbW9kZWwgY2FyZCBhcnRpZmFjdHNcbiAgICogSWYgbm90IHByb3ZpZGVkLCBhIG5ldyBidWNrZXQgd2lsbCBiZSBjcmVhdGVkXG4gICAqIEBkZWZhdWx0IHVuZGVmaW5lZFxuICAgKi9cbiAgcmVhZG9ubHkgYXJ0aWZhY3RzQnVja2V0PzogczMuSUJ1Y2tldDtcblxuICAvKipcbiAgICogT3V0IG9mIHNjb3BlIHVzZSBjYXNlcyB0aGF0IHRoZSBtb2RlbCBzaG91bGQgbm90IGJlIHVzZWQgZm9yXG4gICAqIEBkZWZhdWx0IFtdXG4gICAqL1xuICByZWFkb25seSBvdXRPZlNjb3BlVXNlPzogc3RyaW5nW107XG5cbiAgLyoqXG4gICAqIEJpYXMgY29uc2lkZXJhdGlvbnMgYW5kIGZhaXJuZXNzIGFuYWx5c2lzXG4gICAqIEBkZWZhdWx0IHVuZGVmaW5lZFxuICAgKi9cbiAgcmVhZG9ubHkgYmlhc0NvbnNpZGVyYXRpb25zPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIEEgY29uc3RydWN0IHRoYXQgY3JlYXRlcyBhIGNvbXByZWhlbnNpdmUgTUwgbW9kZWwgY2FyZCB3aXRoIFNhZ2VNYWtlciBNb2RlbCBDYXJkLFxuICogUzMgYXJ0aWZhY3RzIHN0b3JhZ2UsIER5bmFtb0RCIG1ldGFkYXRhIHRyYWNraW5nLCBhbmQgYXVkaXQgbG9nZ2luZy5cbiAqXG4gKiBGZWF0dXJlczpcbiAqIC0gU2FnZU1ha2VyIE1vZGVsIENhcmQgcmVzb3VyY2Ugd2l0aCBjb21wbGV0ZSBtZXRhZGF0YVxuICogLSBTMyBzdG9yYWdlIGZvciBtb2RlbCBjYXJkIGFydGlmYWN0cyAoSlNPTiBmb3JtYXQpXG4gKiAtIER5bmFtb0RCIHRhYmxlIGZvciBtb2RlbCByZWdpc3RyeSBhbmQgbWV0YWRhdGFcbiAqIC0gQ2xvdWRUcmFpbCBhdWRpdCBsb2dnaW5nIGZvciBtb2RlbCBjYXJkIGFjY2Vzc1xuICogLSBDb21wbGlhbmNlIG1vZGUgc3VwcG9ydCBmb3IgdmFyaW91cyByZWd1bGF0aW9uc1xuICogLSBDb21wcmVoZW5zaXZlIG1vZGVsIGRvY3VtZW50YXRpb24gYW5kIGxpbmVhZ2VcbiAqXG4gKiBAZXhhbXBsZVxuICogYGBgdHlwZXNjcmlwdFxuICogbmV3IE1vZGVsQ2FyZENvbnN0cnVjdCh0aGlzLCAnU2VudGltZW50TW9kZWxDYXJkJywge1xuICogICBhcHBOYW1lOiAnVGV4dEFuYWx5c2lzJyxcbiAqICAgbW9kZWxOYW1lOiAnc2VudGltZW50LWNsYXNzaWZpZXInLFxuICogICBtb2RlbFZlcnNpb246ICcyLjEuMCcsXG4gKiAgIGludGVuZGVkVXNlOiAnQ2xhc3NpZnkgdGV4dCBzZW50aW1lbnQgZm9yIGN1c3RvbWVyIGZlZWRiYWNrIGFuYWx5c2lzJyxcbiAqICAgdHJhaW5pbmdEYXRhRGVzY3JpcHRpb246ICdDdXN0b21lciByZXZpZXdzIGRhdGFzZXQgd2l0aCAxMDBLIGxhYmVsZWQgZXhhbXBsZXMnLFxuICogICBldmFsdWF0aW9uTWV0cmljczogW1xuICogICAgIHsgbmFtZTogJ2FjY3VyYWN5JywgdmFsdWU6IDAuOTQsIHVuaXQ6ICdwZXJjZW50YWdlJyB9LFxuICogICAgIHsgbmFtZTogJ2YxX3Njb3JlJywgdmFsdWU6IDAuOTIgfSxcbiAqICAgICB7IG5hbWU6ICdwcmVjaXNpb24nLCB2YWx1ZTogMC45MyB9LFxuICogICBdLFxuICogICBsaW1pdGF0aW9uczogW1xuICogICAgICdMaW1pdGVkIHRvIEVuZ2xpc2ggbGFuZ3VhZ2UgdGV4dCcsXG4gKiAgICAgJ01heSBzdHJ1Z2dsZSB3aXRoIHNhcmNhc20gYW5kIGlyb255JyxcbiAqICAgICAnVHJhaW5lZCBwcmltYXJpbHkgb24gZS1jb21tZXJjZSByZXZpZXdzJ1xuICogICBdLFxuICogICBjb21wbGlhbmNlTW9kZTogJ0ZFUlBBJyxcbiAqICAgcmVzcG9uc2libGVUZWFtOiAnTUwgRW5naW5lZXJpbmcgVGVhbScsXG4gKiAgIGNvbnRhY3RFbWFpbDogJ21sLXRlYW1AY29tcGFueS5jb20nXG4gKiB9KTtcbiAqIGBgYFxuICovXG5leHBvcnQgY2xhc3MgTW9kZWxDYXJkQ29uc3RydWN0IGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgLyoqXG4gICAqIFNhZ2VNYWtlciBNb2RlbCBDYXJkIHJlc291cmNlXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgbW9kZWxDYXJkOiBzYWdlbWFrZXIuQ2ZuTW9kZWxDYXJkO1xuXG4gIC8qKlxuICAgKiBTMyBidWNrZXQgZm9yIG1vZGVsIGNhcmQgYXJ0aWZhY3RzXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgYXJ0aWZhY3RzQnVja2V0OiBzMy5JQnVja2V0O1xuXG4gIC8qKlxuICAgKiBEeW5hbW9EQiB0YWJsZSBmb3IgbW9kZWwgcmVnaXN0cnlcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSByZWdpc3RyeVRhYmxlOiBkeW5hbW9kYi5UYWJsZTtcblxuICAvKipcbiAgICogQ2xvdWRUcmFpbCBmb3IgYXVkaXQgbG9nZ2luZ1xuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGF1ZGl0VHJhaWw6IGNsb3VkdHJhaWwuVHJhaWw7XG5cbiAgLyoqXG4gICAqIFRoZSB1bmlxdWUgbW9kZWwgaWRlbnRpZmllclxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IG1vZGVsSWQ6IHN0cmluZztcblxuICAvKipcbiAgICogUzMga2V5IGZvciB0aGUgbW9kZWwgY2FyZCBKU09OIGFydGlmYWN0XG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgbW9kZWxDYXJkUzNLZXk6IHN0cmluZztcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogTW9kZWxDYXJkQ29uc3RydWN0UHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgY29uc3Qge1xuICAgICAgbW9kZWxOYW1lLFxuICAgICAgbW9kZWxWZXJzaW9uLFxuICAgICAgaW50ZW5kZWRVc2UsXG4gICAgICB0cmFpbmluZ0RhdGFEZXNjcmlwdGlvbixcbiAgICAgIGV2YWx1YXRpb25NZXRyaWNzLFxuICAgICAgbGltaXRhdGlvbnMsXG4gICAgICBjb21wbGlhbmNlTW9kZSxcbiAgICAgIHJlc3BvbnNpYmxlVGVhbSA9ICdTaG9vdCBJdCBBbmFseXRpY3MgTExDJyxcbiAgICAgIGNvbnRhY3RFbWFpbCA9ICdtcmhvcm5lcjgxOUBnbWFpbC5jb20nLFxuICAgICAgYXBwTmFtZSxcbiAgICAgIGFkZGl0aW9uYWxNZXRhZGF0YSA9IHt9LFxuICAgICAgYXJ0aWZhY3RzQnVja2V0LFxuICAgICAgb3V0T2ZTY29wZVVzZSA9IFtdLFxuICAgICAgYmlhc0NvbnNpZGVyYXRpb25zLFxuICAgIH0gPSBwcm9wcztcblxuICAgIC8vIEdlbmVyYXRlIHVuaXF1ZSBtb2RlbCBpZGVudGlmaWVyXG4gICAgdGhpcy5tb2RlbElkID0gYCR7bW9kZWxOYW1lfS0ke21vZGVsVmVyc2lvbn1gO1xuICAgIHRoaXMubW9kZWxDYXJkUzNLZXkgPSBgbW9kZWwtY2FyZHMvJHt0aGlzLm1vZGVsSWR9L21vZGVsLWNhcmQuanNvbmA7XG5cbiAgICAvLyBDcmVhdGUgb3IgdXNlIGV4aXN0aW5nIFMzIGJ1Y2tldCBmb3IgYXJ0aWZhY3RzXG4gICAgdGhpcy5hcnRpZmFjdHNCdWNrZXQgPSBhcnRpZmFjdHNCdWNrZXQgfHwgbmV3IHMzLkJ1Y2tldCh0aGlzLCAnQXJ0aWZhY3RzQnVja2V0Jywge1xuICAgICAgYnVja2V0TmFtZTogYCR7YXBwTmFtZS50b0xvd2VyQ2FzZSgpfS1tb2RlbC1jYXJkcy0ke2Nkay5TdGFjay5vZih0aGlzKS5hY2NvdW50fS0ke2Nkay5TdGFjay5vZih0aGlzKS5yZWdpb259YCxcbiAgICAgIHZlcnNpb25lZDogdHJ1ZSxcbiAgICAgIGVuY3J5cHRpb246IHMzLkJ1Y2tldEVuY3J5cHRpb24uUzNfTUFOQUdFRCxcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICBlbmZvcmNlU1NMOiB0cnVlLFxuICAgICAgbGlmZWN5Y2xlUnVsZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGlkOiAnRGVsZXRlT2xkVmVyc2lvbnMnLFxuICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgbm9uY3VycmVudFZlcnNpb25FeHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cyg5MCksXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIER5bmFtb0RCIHRhYmxlIGZvciBtb2RlbCByZWdpc3RyeVxuICAgIHRoaXMucmVnaXN0cnlUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCAnTW9kZWxSZWdpc3RyeScsIHtcbiAgICAgIHRhYmxlTmFtZTogYCR7YXBwTmFtZX0tbW9kZWwtcmVnaXN0cnlgLFxuICAgICAgcGFydGl0aW9uS2V5OiB7XG4gICAgICAgIG5hbWU6ICdtb2RlbF9pZCcsXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxuICAgICAgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICBlbmNyeXB0aW9uOiBkeW5hbW9kYi5UYWJsZUVuY3J5cHRpb24uQVdTX01BTkFHRUQsXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjoge1xuICAgICAgICBwb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgR1NJIGZvciBxdWVyeWluZyBieSBjb21wbGlhbmNlIG1vZGVcbiAgICB0aGlzLnJlZ2lzdHJ5VGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xuICAgICAgaW5kZXhOYW1lOiAnY29tcGxpYW5jZS1tb2RlLWluZGV4JyxcbiAgICAgIHBhcnRpdGlvbktleToge1xuICAgICAgICBuYW1lOiAnY29tcGxpYW5jZV9tb2RlJyxcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXG4gICAgICB9LFxuICAgICAgc29ydEtleToge1xuICAgICAgICBuYW1lOiAnY3JlYXRlZF9hdCcsXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxuICAgICAgfSxcbiAgICAgIHByb2plY3Rpb25UeXBlOiBkeW5hbW9kYi5Qcm9qZWN0aW9uVHlwZS5BTEwsXG4gICAgfSk7XG5cbiAgICAvLyBQcmVwYXJlIG1vZGVsIGNhcmQgY29udGVudFxuICAgIGNvbnN0IG1vZGVsQ2FyZENvbnRlbnQgPSB7XG4gICAgICBtb2RlbF9uYW1lOiBtb2RlbE5hbWUsXG4gICAgICBtb2RlbF92ZXJzaW9uOiBtb2RlbFZlcnNpb24sXG4gICAgICBtb2RlbF9pZDogdGhpcy5tb2RlbElkLFxuICAgICAgaW50ZW5kZWRfdXNlOiBpbnRlbmRlZFVzZSxcbiAgICAgIG91dF9vZl9zY29wZV91c2U6IG91dE9mU2NvcGVVc2UsXG4gICAgICB0cmFpbmluZ19kYXRhX2Rlc2NyaXB0aW9uOiB0cmFpbmluZ0RhdGFEZXNjcmlwdGlvbixcbiAgICAgIGV2YWx1YXRpb25fbWV0cmljczogZXZhbHVhdGlvbk1ldHJpY3MsXG4gICAgICBsaW1pdGF0aW9uczogbGltaXRhdGlvbnMsXG4gICAgICBiaWFzX2NvbnNpZGVyYXRpb25zOiBiaWFzQ29uc2lkZXJhdGlvbnMsXG4gICAgICBjb21wbGlhbmNlX21vZGU6IGNvbXBsaWFuY2VNb2RlLFxuICAgICAgcmVzcG9uc2libGVfdGVhbTogcmVzcG9uc2libGVUZWFtLFxuICAgICAgY29udGFjdF9lbWFpbDogY29udGFjdEVtYWlsLFxuICAgICAgY3JlYXRlZF9hdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgczNfcGF0aDogYHMzOi8vJHt0aGlzLmFydGlmYWN0c0J1Y2tldC5idWNrZXROYW1lfS8ke3RoaXMubW9kZWxDYXJkUzNLZXl9YCxcbiAgICAgIGFkZGl0aW9uYWxfbWV0YWRhdGE6IGFkZGl0aW9uYWxNZXRhZGF0YSxcbiAgICB9O1xuXG4gICAgLy8gQ3JlYXRlIFNhZ2VNYWtlciBNb2RlbCBDYXJkXG4gICAgdGhpcy5tb2RlbENhcmQgPSBuZXcgc2FnZW1ha2VyLkNmbk1vZGVsQ2FyZCh0aGlzLCAnTW9kZWxDYXJkJywge1xuICAgICAgbW9kZWxDYXJkTmFtZTogdGhpcy5tb2RlbElkLFxuICAgICAgbW9kZWxDYXJkU3RhdHVzOiAnUGVuZGluZ1JldmlldycsXG4gICAgICBjb250ZW50OiB7XG4gICAgICAgIG1vZGVsT3ZlcnZpZXc6IHtcbiAgICAgICAgICBtb2RlbERlc2NyaXB0aW9uOiBgJHttb2RlbE5hbWV9IHZlcnNpb24gJHttb2RlbFZlcnNpb259YCxcbiAgICAgICAgICBtb2RlbE5hbWU6IG1vZGVsTmFtZSxcbiAgICAgICAgICBtb2RlbFZlcnNpb246IDEsXG4gICAgICAgIH0sXG4gICAgICAgIGludGVuZGVkVXNlczoge1xuICAgICAgICAgIHB1cnBvc2VPZk1vZGVsOiBpbnRlbmRlZFVzZSxcbiAgICAgICAgICBpbnRlbmRlZFVzZXM6IGludGVuZGVkVXNlLFxuICAgICAgICAgIGZhY3RvcnNBZmZlY3RpbmdNb2RlbEVmZmljaWVuY3k6IGxpbWl0YXRpb25zLmpvaW4oJzsgJyksXG4gICAgICAgICAgcmlza1JhdGluZzogY29tcGxpYW5jZU1vZGUgPyAnSGlnaCcgOiAnTWVkaXVtJyxcbiAgICAgICAgfSxcbiAgICAgICAgdHJhaW5pbmdEZXRhaWxzOiB7XG4gICAgICAgICAgb2JqZWN0aXZlRnVuY3Rpb246IHtcbiAgICAgICAgICAgIGZ1bmN0aW9uOiB7XG4gICAgICAgICAgICAgIGNvbmRpdGlvbjogJ01heGltaXplJyxcbiAgICAgICAgICAgICAgZmFjZXQ6ICdhY2N1cmFjeScsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgbm90ZXM6ICdPcHRpbWl6aW5nIGZvciBjbGFzc2lmaWNhdGlvbiBhY2N1cmFjeScsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgYWRkaXRpb25hbEluZm9ybWF0aW9uOiB7XG4gICAgICAgICAgZXRoaWNhbENvbnNpZGVyYXRpb25zOiBiaWFzQ29uc2lkZXJhdGlvbnMgfHwgJ1N0YW5kYXJkIGV0aGljYWwgQUkgcHJhY3RpY2VzIGFwcGxpZWQnLFxuICAgICAgICAgIGNhdmVhdHNBbmRSZWNvbW1lbmRhdGlvbnM6IGxpbWl0YXRpb25zLmpvaW4oJzsgJyksXG4gICAgICAgICAgY3VzdG9tRGV0YWlsczogYWRkaXRpb25hbE1ldGFkYXRhLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIHRhZ3M6IFtcbiAgICAgICAgeyBrZXk6ICdQcm9qZWN0JywgdmFsdWU6IGFwcE5hbWUgfSxcbiAgICAgICAgeyBrZXk6ICdNYW5hZ2VkQnknLCB2YWx1ZTogJ2Nkay1haS1jb25zdHJ1Y3RzJyB9LFxuICAgICAgICB7IGtleTogJ093bmVyJywgdmFsdWU6ICdqb2huYXRoYW4taG9ybmVyJyB9LFxuICAgICAgICB7IGtleTogJ0NvbXBvbmVudCcsIHZhbHVlOiAnTW9kZWxDYXJkJyB9LFxuICAgICAgICB7IGtleTogJ01vZGVsTmFtZScsIHZhbHVlOiBtb2RlbE5hbWUgfSxcbiAgICAgICAgeyBrZXk6ICdNb2RlbFZlcnNpb24nLCB2YWx1ZTogbW9kZWxWZXJzaW9uIH0sXG4gICAgICAgIHsga2V5OiAnUmVzcG9uc2libGVUZWFtJywgdmFsdWU6IHJlc3BvbnNpYmxlVGVhbSB9LFxuICAgICAgXS5jb25jYXQoXG4gICAgICAgIGNvbXBsaWFuY2VNb2RlID8gW3sga2V5OiAnQ29tcGxpYW5jZU1vZGUnLCB2YWx1ZTogY29tcGxpYW5jZU1vZGUgfV0gOiBbXVxuICAgICAgKSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBhIExhbWJkYSBmdW5jdGlvbiB0byBwb3B1bGF0ZSBEeW5hbW9EQiB3aXRoIG1vZGVsIG1ldGFkYXRhXG4gICAgY29uc3QgZHluYW1vSW5pdEZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnRHluYW1vSW5pdEZ1bmN0aW9uJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfMTEsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tSW5saW5lKGBcbmltcG9ydCBqc29uXG5pbXBvcnQgYm90bzNcblxuZGVmIGhhbmRsZXIoZXZlbnQsIGNvbnRleHQpOlxuICAgIGR5bmFtb2RiID0gYm90bzMuY2xpZW50KCdkeW5hbW9kYicpXG5cbiAgICBpdGVtID0ge1xuICAgICAgICAnbW9kZWxfaWQnOiB7J1MnOiAnJHt0aGlzLm1vZGVsSWR9J30sXG4gICAgICAgICdtb2RlbF9uYW1lJzogeydTJzogJyR7bW9kZWxOYW1lfSd9LFxuICAgICAgICAnbW9kZWxfdmVyc2lvbic6IHsnUyc6ICcke21vZGVsVmVyc2lvbn0nfSxcbiAgICAgICAgJ2ludGVuZGVkX3VzZSc6IHsnUyc6ICcke2ludGVuZGVkVXNlfSd9LFxuICAgICAgICAndHJhaW5pbmdfZGF0YV9kZXNjcmlwdGlvbic6IHsnUyc6ICcke3RyYWluaW5nRGF0YURlc2NyaXB0aW9ufSd9LFxuICAgICAgICAnZXZhbHVhdGlvbl9tZXRyaWNzJzogeydTJzogJyR7SlNPTi5zdHJpbmdpZnkoZXZhbHVhdGlvbk1ldHJpY3MpfSd9LFxuICAgICAgICAnbGltaXRhdGlvbnMnOiB7J1NTJzogJHtKU09OLnN0cmluZ2lmeShsaW1pdGF0aW9ucyl9fSxcbiAgICAgICAgJ3Jlc3BvbnNpYmxlX3RlYW0nOiB7J1MnOiAnJHtyZXNwb25zaWJsZVRlYW19J30sXG4gICAgICAgICdjb250YWN0X2VtYWlsJzogeydTJzogJyR7Y29udGFjdEVtYWlsfSd9LFxuICAgICAgICAnY3JlYXRlZF9hdCc6IHsnUyc6ICcke25ldyBEYXRlKCkudG9JU09TdHJpbmcoKX0nfSxcbiAgICAgICAgJ3MzX3BhdGgnOiB7J1MnOiAnczM6Ly8ke3RoaXMuYXJ0aWZhY3RzQnVja2V0LmJ1Y2tldE5hbWV9LyR7dGhpcy5tb2RlbENhcmRTM0tleX0nfSxcbiAgICAgICAgJ3NhZ2VtYWtlcl9tb2RlbF9jYXJkX25hbWUnOiB7J1MnOiAnJHt0aGlzLm1vZGVsSWR9J30sXG4gICAgICAgICdhZGRpdGlvbmFsX21ldGFkYXRhJzogeydTJzogJyR7SlNPTi5zdHJpbmdpZnkoYWRkaXRpb25hbE1ldGFkYXRhKX0nfVxuICAgIH1cblxuICAgIGlmICcke2NvbXBsaWFuY2VNb2RlIHx8ICcnfSc6XG4gICAgICAgIGl0ZW1bJ2NvbXBsaWFuY2VfbW9kZSddID0geydTJzogJyR7Y29tcGxpYW5jZU1vZGV9J31cblxuICAgIHRyeTpcbiAgICAgICAgZHluYW1vZGIucHV0X2l0ZW0oXG4gICAgICAgICAgICBUYWJsZU5hbWU9JyR7YXBwTmFtZX0tbW9kZWwtcmVnaXN0cnknLFxuICAgICAgICAgICAgSXRlbT1pdGVtXG4gICAgICAgIClcbiAgICAgICAgcmV0dXJuIHsnc3RhdHVzQ29kZSc6IDIwMH1cbiAgICBleGNlcHQgRXhjZXB0aW9uIGFzIGU6XG4gICAgICAgIHByaW50KGZcIkVycm9yOiB7ZX1cIilcbiAgICAgICAgcmV0dXJuIHsnc3RhdHVzQ29kZSc6IDUwMH1cbiAgICAgIGApLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMSksXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBEeW5hbW9EQiB3cml0ZSBwZXJtaXNzaW9uc1xuICAgIHRoaXMucmVnaXN0cnlUYWJsZS5ncmFudFdyaXRlRGF0YShkeW5hbW9Jbml0RnVuY3Rpb24pO1xuXG4gICAgLy8gVXNlIGN1c3RvbSByZXNvdXJjZSB0byBpbml0aWFsaXplIER5bmFtb0RCXG4gICAgY29uc3QgY3VzdG9tUmVzb3VyY2UgPSBuZXcgY2RrLkN1c3RvbVJlc291cmNlKHRoaXMsICdEeW5hbW9Jbml0Jywge1xuICAgICAgc2VydmljZVRva2VuOiBkeW5hbW9Jbml0RnVuY3Rpb24uZnVuY3Rpb25Bcm4sXG4gICAgfSk7XG5cbiAgICBjdXN0b21SZXNvdXJjZS5ub2RlLmFkZERlcGVuZGVuY3kodGhpcy5yZWdpc3RyeVRhYmxlKTtcblxuICAgIC8vIENyZWF0ZSBDbG91ZFRyYWlsIGZvciBhdWRpdCBsb2dnaW5nXG4gICAgdGhpcy5hdWRpdFRyYWlsID0gbmV3IGNsb3VkdHJhaWwuVHJhaWwodGhpcywgJ01vZGVsQ2FyZEF1ZGl0VHJhaWwnLCB7XG4gICAgICB0cmFpbE5hbWU6IGAke2FwcE5hbWV9LW1vZGVsLWNhcmQtYXVkaXQtdHJhaWxgLFxuICAgICAgaW5jbHVkZUdsb2JhbFNlcnZpY2VFdmVudHM6IGZhbHNlLFxuICAgICAgaXNNdWx0aVJlZ2lvblRyYWlsOiBmYWxzZSxcbiAgICAgIGVuYWJsZUZpbGVWYWxpZGF0aW9uOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIGRhdGEgZXZlbnRzIGZvciBTMyBvYmplY3QgYWNjZXNzXG4gICAgdGhpcy5hdWRpdFRyYWlsLmFkZFMzRXZlbnRTZWxlY3RvcihbXG4gICAgICB7XG4gICAgICAgIGJ1Y2tldDogdGhpcy5hcnRpZmFjdHNCdWNrZXQsXG4gICAgICAgIG9iamVjdFByZWZpeDogJ21vZGVsLWNhcmRzLycsXG4gICAgICB9LFxuICAgIF0pO1xuXG4gICAgLy8gQXBwbHkgY29uc2lzdGVudCB0YWdnaW5nXG4gICAgY2RrLlRhZ3Mub2YodGhpcykuYWRkKCdQcm9qZWN0JywgYXBwTmFtZSk7XG4gICAgY2RrLlRhZ3Mub2YodGhpcykuYWRkKCdNYW5hZ2VkQnknLCAnY2RrLWFpLWNvbnN0cnVjdHMnKTtcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ093bmVyJywgJ2pvaG5hdGhhbi1ob3JuZXInKTtcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ0NvbXBvbmVudCcsICdNb2RlbENhcmQnKTtcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ01vZGVsTmFtZScsIG1vZGVsTmFtZSk7XG4gICAgY2RrLlRhZ3Mub2YodGhpcykuYWRkKCdNb2RlbFZlcnNpb24nLCBtb2RlbFZlcnNpb24pO1xuICAgIGNkay5UYWdzLm9mKHRoaXMpLmFkZCgnUmVzcG9uc2libGVUZWFtJywgcmVzcG9uc2libGVUZWFtKTtcblxuICAgIGlmIChjb21wbGlhbmNlTW9kZSkge1xuICAgICAgY2RrLlRhZ3Mub2YodGhpcykuYWRkKCdDb21wbGlhbmNlTW9kZScsIGNvbXBsaWFuY2VNb2RlKTtcbiAgICB9XG5cbiAgICAvLyBPdXRwdXQgaW1wb3J0YW50IHZhbHVlc1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdNb2RlbENhcmROYW1lJywge1xuICAgICAgdmFsdWU6IHRoaXMubW9kZWxDYXJkLm1vZGVsQ2FyZE5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ05hbWUgb2YgdGhlIFNhZ2VNYWtlciBNb2RlbCBDYXJkJyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke2Nkay5TdGFjay5vZih0aGlzKS5zdGFja05hbWV9LSR7aWR9LU1vZGVsQ2FyZE5hbWVgLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ01vZGVsQ2FyZFMzVXJsJywge1xuICAgICAgdmFsdWU6IGBzMzovLyR7dGhpcy5hcnRpZmFjdHNCdWNrZXQuYnVja2V0TmFtZX0vJHt0aGlzLm1vZGVsQ2FyZFMzS2V5fWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ1MzIFVSTCBvZiB0aGUgbW9kZWwgY2FyZCBKU09OIGFydGlmYWN0JyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke2Nkay5TdGFjay5vZih0aGlzKS5zdGFja05hbWV9LSR7aWR9LU1vZGVsQ2FyZFMzVXJsYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdNb2RlbENhcmREeW5hbW9LZXknLCB7XG4gICAgICB2YWx1ZTogdGhpcy5tb2RlbElkLFxuICAgICAgZGVzY3JpcHRpb246ICdEeW5hbW9EQiBwYXJ0aXRpb24ga2V5IGZvciB0aGUgbW9kZWwgcmVnaXN0cnkgZW50cnknLFxuICAgICAgZXhwb3J0TmFtZTogYCR7Y2RrLlN0YWNrLm9mKHRoaXMpLnN0YWNrTmFtZX0tJHtpZH0tTW9kZWxDYXJkRHluYW1vS2V5YCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdNb2RlbFJlZ2lzdHJ5VGFibGVOYW1lJywge1xuICAgICAgdmFsdWU6IHRoaXMucmVnaXN0cnlUYWJsZS50YWJsZU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ05hbWUgb2YgdGhlIER5bmFtb0RCIG1vZGVsIHJlZ2lzdHJ5IHRhYmxlJyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke2Nkay5TdGFjay5vZih0aGlzKS5zdGFja05hbWV9LSR7aWR9LU1vZGVsUmVnaXN0cnlUYWJsZU5hbWVgLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ01vZGVsSWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5tb2RlbElkLFxuICAgICAgZGVzY3JpcHRpb246ICdVbmlxdWUgaWRlbnRpZmllciBmb3IgdGhpcyBtb2RlbCcsXG4gICAgICBleHBvcnROYW1lOiBgJHtjZGsuU3RhY2sub2YodGhpcykuc3RhY2tOYW1lfS0ke2lkfS1Nb2RlbElkYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBdWRpdFRyYWlsQXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMuYXVkaXRUcmFpbC50cmFpbEFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVJOIG9mIHRoZSBDbG91ZFRyYWlsIGF1ZGl0IHRyYWlsJyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke2Nkay5TdGFjay5vZih0aGlzKS5zdGFja05hbWV9LSR7aWR9LUF1ZGl0VHJhaWxBcm5gLFxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIEdyYW50IHJlYWQgYWNjZXNzIHRvIHRoZSBtb2RlbCBjYXJkIGFydGlmYWN0c1xuICAgKiBAcGFyYW0gZ3JhbnRlZSBUaGUgSUFNIHByaW5jaXBhbCB0byBncmFudCBhY2Nlc3MgdG9cbiAgICovXG4gIHB1YmxpYyBncmFudFJlYWQoZ3JhbnRlZTogaWFtLklHcmFudGFibGUpOiBpYW0uR3JhbnQge1xuICAgIHJldHVybiB0aGlzLmFydGlmYWN0c0J1Y2tldC5ncmFudFJlYWQoZ3JhbnRlZSwgdGhpcy5tb2RlbENhcmRTM0tleSk7XG4gIH1cblxuICAvKipcbiAgICogR3JhbnQgcmVhZCBhY2Nlc3MgdG8gdGhlIG1vZGVsIHJlZ2lzdHJ5IHRhYmxlXG4gICAqIEBwYXJhbSBncmFudGVlIFRoZSBJQU0gcHJpbmNpcGFsIHRvIGdyYW50IGFjY2VzcyB0b1xuICAgKi9cbiAgcHVibGljIGdyYW50UmVnaXN0cnlSZWFkKGdyYW50ZWU6IGlhbS5JR3JhbnRhYmxlKTogaWFtLkdyYW50IHtcbiAgICByZXR1cm4gdGhpcy5yZWdpc3RyeVRhYmxlLmdyYW50UmVhZERhdGEoZ3JhbnRlZSk7XG4gIH1cblxuICAvKipcbiAgICogR3JhbnQgd3JpdGUgYWNjZXNzIHRvIHVwZGF0ZSBtb2RlbCBjYXJkIHN0YXR1c1xuICAgKiBAcGFyYW0gZ3JhbnRlZSBUaGUgSUFNIHByaW5jaXBhbCB0byBncmFudCBhY2Nlc3MgdG9cbiAgICovXG4gIHB1YmxpYyBncmFudFVwZGF0ZVN0YXR1cyhncmFudGVlOiBpYW0uSUdyYW50YWJsZSk6IHZvaWQge1xuICAgIGNvbnN0IHBvbGljeSA9IG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIHNpZDogJ1VwZGF0ZU1vZGVsQ2FyZFN0YXR1cycsXG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdzYWdlbWFrZXI6VXBkYXRlTW9kZWxDYXJkJyxcbiAgICAgICAgJ3NhZ2VtYWtlcjpEZXNjcmliZU1vZGVsQ2FyZCcsXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGBhcm46YXdzOnNhZ2VtYWtlcjoke2Nkay5TdGFjay5vZih0aGlzKS5yZWdpb259OiR7Y2RrLlN0YWNrLm9mKHRoaXMpLmFjY291bnR9Om1vZGVsLWNhcmQvJHt0aGlzLm1vZGVsQ2FyZC5tb2RlbENhcmROYW1lfWAsXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgaWYgKCdhZGRUb1BvbGljeScgaW4gZ3JhbnRlZSkge1xuICAgICAgKGdyYW50ZWUgYXMgYW55KS5hZGRUb1BvbGljeShwb2xpY3kpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBVcGRhdGUgbW9kZWwgY2FyZCBzdGF0dXNcbiAgICogQHBhcmFtIHN0YXR1cyBOZXcgc3RhdHVzIGZvciB0aGUgbW9kZWwgY2FyZFxuICAgKi9cbiAgcHVibGljIHVwZGF0ZVN0YXR1cyhzdGF0dXM6ICdEcmFmdCcgfCAnUGVuZGluZ1JldmlldycgfCAnQXBwcm92ZWQnIHwgJ0FyY2hpdmVkJyk6IHZvaWQge1xuICAgIGNvbnN0IGNmbk1vZGVsQ2FyZCA9IHRoaXMubW9kZWxDYXJkO1xuICAgIGNmbk1vZGVsQ2FyZC5tb2RlbENhcmRTdGF0dXMgPSBzdGF0dXM7XG4gIH1cblxuICAvKipcbiAgICogR2V0IHRoZSBtb2RlbCBjYXJkIGNvbnRlbnQgYXMgYSBKU09OIG9iamVjdFxuICAgKiBAcmV0dXJucyBNb2RlbCBjYXJkIGNvbnRlbnQgb2JqZWN0XG4gICAqL1xuICBwdWJsaWMgZ2V0TW9kZWxDYXJkQ29udGVudCgpOiBhbnkge1xuICAgIHJldHVybiB7XG4gICAgICBtb2RlbF9uYW1lOiB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnbW9kZWxOYW1lJyksXG4gICAgICBtb2RlbF92ZXJzaW9uOiB0aGlzLm5vZGUudHJ5R2V0Q29udGV4dCgnbW9kZWxWZXJzaW9uJyksXG4gICAgICBtb2RlbF9pZDogdGhpcy5tb2RlbElkLFxuICAgICAgczNfcGF0aDogYHMzOi8vJHt0aGlzLmFydGlmYWN0c0J1Y2tldC5idWNrZXROYW1lfS8ke3RoaXMubW9kZWxDYXJkUzNLZXl9YCxcbiAgICAgIHNhZ2VtYWtlcl9tb2RlbF9jYXJkX25hbWU6IHRoaXMubW9kZWxDYXJkLm1vZGVsQ2FyZE5hbWUsXG4gICAgfTtcbiAgfVxufSJdfQ==