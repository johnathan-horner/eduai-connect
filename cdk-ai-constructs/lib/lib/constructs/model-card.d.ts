import * as sagemaker from 'aws-cdk-lib/aws-sagemaker';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cloudtrail from 'aws-cdk-lib/aws-cloudtrail';
import * as iam from 'aws-cdk-lib/aws-iam';
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
    readonly additionalMetadata?: {
        [key: string]: any;
    };
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
export declare class ModelCardConstruct extends Construct {
    /**
     * SageMaker Model Card resource
     */
    readonly modelCard: sagemaker.CfnModelCard;
    /**
     * S3 bucket for model card artifacts
     */
    readonly artifactsBucket: s3.IBucket;
    /**
     * DynamoDB table for model registry
     */
    readonly registryTable: dynamodb.Table;
    /**
     * CloudTrail for audit logging
     */
    readonly auditTrail: cloudtrail.Trail;
    /**
     * The unique model identifier
     */
    readonly modelId: string;
    /**
     * S3 key for the model card JSON artifact
     */
    readonly modelCardS3Key: string;
    constructor(scope: Construct, id: string, props: ModelCardConstructProps);
    /**
     * Grant read access to the model card artifacts
     * @param grantee The IAM principal to grant access to
     */
    grantRead(grantee: iam.IGrantable): iam.Grant;
    /**
     * Grant read access to the model registry table
     * @param grantee The IAM principal to grant access to
     */
    grantRegistryRead(grantee: iam.IGrantable): iam.Grant;
    /**
     * Grant write access to update model card status
     * @param grantee The IAM principal to grant access to
     */
    grantUpdateStatus(grantee: iam.IGrantable): void;
    /**
     * Update model card status
     * @param status New status for the model card
     */
    updateStatus(status: 'Draft' | 'PendingReview' | 'Approved' | 'Archived'): void;
    /**
     * Get the model card content as a JSON object
     * @returns Model card content object
     */
    getModelCardContent(): any;
}
