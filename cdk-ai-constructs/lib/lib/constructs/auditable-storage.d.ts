import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as cloudtrail from 'aws-cdk-lib/aws-cloudtrail';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
/**
 * Compliance modes supported by AuditableStorage
 */
export type ComplianceMode = 'HIPAA' | 'FERPA' | 'FEDRAMP' | 'SR11-7';
/**
 * Properties for AuditableStorage construct
 */
export interface AuditableStorageProps {
    /**
     * Name for the S3 bucket (will be prefixed with stack name and suffixed with account/region)
     */
    readonly bucketName: string;
    /**
     * Enable S3 versioning for data protection
     * @default true
     */
    readonly enableVersioning?: boolean;
    /**
     * Data retention period in days
     * @default 90
     */
    readonly retentionDays?: number;
    /**
     * IAM principals that should have access to this bucket
     * @default []
     */
    readonly allowedPrincipals?: iam.IPrincipal[];
    /**
     * Compliance mode that affects retention and security settings
     * @default undefined - no specific compliance requirements
     */
    readonly complianceMode?: ComplianceMode;
    /**
     * Application name for consistent tagging
     */
    readonly appName: string;
}
/**
 * A secure, auditable S3 storage construct with encryption, versioning,
 * lifecycle management, and CloudTrail logging. Supports various compliance modes.
 *
 * Features:
 * - KMS CMK encryption at rest
 * - S3 versioning for data protection
 * - Intelligent lifecycle management (IA at 30 days, Glacier at 90 days)
 * - CloudTrail audit logging scoped to this bucket
 * - Compliance-specific retention policies
 * - Bucket policies enforcing SSL and encryption requirements
 *
 * @example
 * ```typescript
 * new AuditableStorage(this, 'DocumentStorage', {
 *   appName: 'MyApp',
 *   bucketName: 'documents',
 *   complianceMode: 'HIPAA',
 *   retentionDays: 2555, // 7 years for HIPAA
 *   allowedPrincipals: [lambdaFunction.role!]
 * });
 * ```
 */
export declare class AuditableStorage extends Construct {
    /**
     * The S3 bucket for secure storage
     */
    readonly bucket: s3.Bucket;
    /**
     * KMS key used for bucket encryption
     */
    readonly encryptionKey: kms.Key;
    /**
     * CloudTrail trail for audit logging
     */
    readonly auditTrail: cloudtrail.Trail;
    constructor(scope: Construct, id: string, props: AuditableStorageProps);
    /**
     * Get retention days based on compliance mode
     * @param complianceMode The compliance mode
     * @param defaultRetention The default retention period
     * @returns Effective retention period in days
     */
    private getComplianceRetentionDays;
    /**
     * Grant read access to an IAM principal
     * @param grantee The IAM principal to grant access to
     */
    grantRead(grantee: iam.IGrantable): iam.Grant;
    /**
     * Grant write access to an IAM principal
     * @param grantee The IAM principal to grant access to
     */
    grantWrite(grantee: iam.IGrantable): iam.Grant;
    /**
     * Grant read and write access to an IAM principal
     * @param grantee The IAM principal to grant access to
     */
    grantReadWrite(grantee: iam.IGrantable): iam.Grant;
}
