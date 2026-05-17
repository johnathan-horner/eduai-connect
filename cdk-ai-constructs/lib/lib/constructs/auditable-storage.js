"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditableStorage = void 0;
const s3 = require("aws-cdk-lib/aws-s3");
const kms = require("aws-cdk-lib/aws-kms");
const cloudtrail = require("aws-cdk-lib/aws-cloudtrail");
const iam = require("aws-cdk-lib/aws-iam");
const cdk = require("aws-cdk-lib");
const constructs_1 = require("constructs");
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
class AuditableStorage extends constructs_1.Construct {
    /**
     * The S3 bucket for secure storage
     */
    bucket;
    /**
     * KMS key used for bucket encryption
     */
    encryptionKey;
    /**
     * CloudTrail trail for audit logging
     */
    auditTrail;
    constructor(scope, id, props) {
        super(scope, id);
        const { bucketName, enableVersioning = true, retentionDays = 90, allowedPrincipals = [], complianceMode, appName, } = props;
        // Apply compliance-specific settings
        const effectiveRetentionDays = this.getComplianceRetentionDays(complianceMode, retentionDays);
        // Create KMS key for bucket encryption
        this.encryptionKey = new kms.Key(this, 'EncryptionKey', {
            description: `KMS key for ${bucketName} bucket encryption`,
            enableKeyRotation: true,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        });
        // Grant encryption key access to allowed principals
        allowedPrincipals.forEach((principal) => {
            this.encryptionKey.grantEncryptDecrypt(principal);
        });
        // Create S3 bucket with security best practices
        this.bucket = new s3.Bucket(this, 'Bucket', {
            bucketName: `${bucketName}-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}`,
            versioned: enableVersioning,
            encryption: s3.BucketEncryption.KMS,
            encryptionKey: this.encryptionKey,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            enforceSSL: true,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            lifecycleRules: [
                {
                    id: 'OptimizeStorageCosts',
                    enabled: true,
                    transitions: [
                        {
                            storageClass: s3.StorageClass.INFREQUENT_ACCESS,
                            transitionAfter: cdk.Duration.days(30),
                        },
                        {
                            storageClass: s3.StorageClass.GLACIER,
                            transitionAfter: cdk.Duration.days(90),
                        },
                    ],
                    expiration: cdk.Duration.days(effectiveRetentionDays),
                },
            ],
        });
        // Add bucket policy to deny non-SSL requests and non-KMS uploads
        this.bucket.addToResourcePolicy(new iam.PolicyStatement({
            sid: 'DenyInsecureConnections',
            effect: iam.Effect.DENY,
            principals: [new iam.AnyPrincipal()],
            actions: ['s3:*'],
            resources: [this.bucket.bucketArn, this.bucket.arnForObjects('*')],
            conditions: {
                Bool: {
                    'aws:SecureTransport': 'false',
                },
            },
        }));
        this.bucket.addToResourcePolicy(new iam.PolicyStatement({
            sid: 'DenyUnencryptedUploads',
            effect: iam.Effect.DENY,
            principals: [new iam.AnyPrincipal()],
            actions: ['s3:PutObject'],
            resources: [this.bucket.arnForObjects('*')],
            conditions: {
                StringNotEquals: {
                    's3:x-amz-server-side-encryption': 'aws:kms',
                },
            },
        }));
        // Create CloudTrail for audit logging
        this.auditTrail = new cloudtrail.Trail(this, 'AuditTrail', {
            trailName: `${bucketName}-audit-trail`,
            includeGlobalServiceEvents: true,
            isMultiRegionTrail: true,
            enableFileValidation: true,
        });
        // Add data events for this specific bucket
        this.auditTrail.addS3EventSelector([
            {
                bucket: this.bucket,
                objectPrefix: '',
            },
        ]);
        // Apply consistent tagging
        cdk.Tags.of(this).add('Project', appName);
        cdk.Tags.of(this).add('ManagedBy', 'cdk-ai-constructs');
        cdk.Tags.of(this).add('Owner', 'johnathan-horner');
        if (complianceMode) {
            cdk.Tags.of(this).add('Compliance', complianceMode);
        }
        // Output important values
        new cdk.CfnOutput(this, 'BucketName', {
            value: this.bucket.bucketName,
            description: 'Name of the auditable S3 bucket',
            exportName: `${cdk.Stack.of(this).stackName}-${id}-BucketName`,
        });
        new cdk.CfnOutput(this, 'BucketArn', {
            value: this.bucket.bucketArn,
            description: 'ARN of the auditable S3 bucket',
            exportName: `${cdk.Stack.of(this).stackName}-${id}-BucketArn`,
        });
        new cdk.CfnOutput(this, 'EncryptionKeyArn', {
            value: this.encryptionKey.keyArn,
            description: 'ARN of the KMS encryption key',
            exportName: `${cdk.Stack.of(this).stackName}-${id}-EncryptionKeyArn`,
        });
        new cdk.CfnOutput(this, 'AuditTrailArn', {
            value: this.auditTrail.trailArn,
            description: 'ARN of the CloudTrail audit trail',
            exportName: `${cdk.Stack.of(this).stackName}-${id}-AuditTrailArn`,
        });
    }
    /**
     * Get retention days based on compliance mode
     * @param complianceMode The compliance mode
     * @param defaultRetention The default retention period
     * @returns Effective retention period in days
     */
    getComplianceRetentionDays(complianceMode, defaultRetention) {
        if (!complianceMode) {
            return defaultRetention || 90;
        }
        switch (complianceMode) {
            case 'HIPAA':
                return 2555; // 7 years
            case 'FERPA':
                return 1825; // 5 years
            case 'FEDRAMP':
                return 2555; // 7 years
            case 'SR11-7':
                return 2555; // 7 years (Federal banking regulation)
            default:
                return defaultRetention || 90;
        }
    }
    /**
     * Grant read access to an IAM principal
     * @param grantee The IAM principal to grant access to
     */
    grantRead(grantee) {
        this.encryptionKey.grantDecrypt(grantee);
        return this.bucket.grantRead(grantee);
    }
    /**
     * Grant write access to an IAM principal
     * @param grantee The IAM principal to grant access to
     */
    grantWrite(grantee) {
        this.encryptionKey.grantEncrypt(grantee);
        return this.bucket.grantWrite(grantee);
    }
    /**
     * Grant read and write access to an IAM principal
     * @param grantee The IAM principal to grant access to
     */
    grantReadWrite(grantee) {
        this.encryptionKey.grantEncryptDecrypt(grantee);
        return this.bucket.grantReadWrite(grantee);
    }
}
exports.AuditableStorage = AuditableStorage;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXVkaXRhYmxlLXN0b3JhZ2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9jb25zdHJ1Y3RzL2F1ZGl0YWJsZS1zdG9yYWdlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLHlDQUF5QztBQUN6QywyQ0FBMkM7QUFDM0MseURBQXlEO0FBQ3pELDJDQUEyQztBQUMzQyxtQ0FBbUM7QUFDbkMsMkNBQXVDO0FBOEN2Qzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQXNCRztBQUNILE1BQWEsZ0JBQWlCLFNBQVEsc0JBQVM7SUFDN0M7O09BRUc7SUFDYSxNQUFNLENBQVk7SUFFbEM7O09BRUc7SUFDYSxhQUFhLENBQVU7SUFFdkM7O09BRUc7SUFDYSxVQUFVLENBQW1CO0lBRTdDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBNEI7UUFDcEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixNQUFNLEVBQ0osVUFBVSxFQUNWLGdCQUFnQixHQUFHLElBQUksRUFDdkIsYUFBYSxHQUFHLEVBQUUsRUFDbEIsaUJBQWlCLEdBQUcsRUFBRSxFQUN0QixjQUFjLEVBQ2QsT0FBTyxHQUNSLEdBQUcsS0FBSyxDQUFDO1FBRVYscUNBQXFDO1FBQ3JDLE1BQU0sc0JBQXNCLEdBQUcsSUFBSSxDQUFDLDBCQUEwQixDQUFDLGNBQWMsRUFBRSxhQUFhLENBQUMsQ0FBQztRQUU5Rix1Q0FBdUM7UUFDdkMsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUN0RCxXQUFXLEVBQUUsZUFBZSxVQUFVLG9CQUFvQjtZQUMxRCxpQkFBaUIsRUFBRSxJQUFJO1lBQ3ZCLGFBQWEsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE1BQU07U0FDeEMsQ0FBQyxDQUFDO1FBRUgsb0RBQW9EO1FBQ3BELGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxDQUFDLFNBQVMsRUFBRSxF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WCxPQUFPLElBQUksQ0FBQyxDQUFDLHVDQUF1QztZQUN0RDtnQkFDRSxPQUFPLGdCQUFnQixJQUFJLEVBQUUsQ0FBQztRQUNsQyxDQUFDO0lBQ0gsQ0FBQztJQUVEOzs7T0FHRztJQUNJLFNBQVMsQ0FBQyxPQUF1QjtRQUN0QyxJQUFJLENBQUMsYUFBYSxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUN6QyxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ3hDLENBQUM7SUFFRDs7O09BR0c7SUFDSSxVQUFVLENBQUMsT0FBdUI7UUFDdkMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDekMsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUN6QyxDQUFDO0lBRUQ7OztPQUdHO0lBQ0ksY0FBYyxDQUFDLE9BQXVCO1FBQzNDLElBQUksQ0FBQyxhQUFhLENBQUMsbUJBQW1CLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDaEQsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUM3QyxDQUFDO0NBQ0Y7QUEzTUQsNENBMk1DIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCAqIGFzIGttcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mta21zJztcbmltcG9ydCAqIGFzIGNsb3VkdHJhaWwgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3VkdHJhaWwnO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG4vKipcbiAqIENvbXBsaWFuY2UgbW9kZXMgc3VwcG9ydGVkIGJ5IEF1ZGl0YWJsZVN0b3JhZ2VcbiAqL1xuZXhwb3J0IHR5cGUgQ29tcGxpYW5jZU1vZGUgPSAnSElQQUEnIHwgJ0ZFUlBBJyB8ICdGRURSQU1QJyB8ICdTUjExLTcnO1xuXG4vKipcbiAqIFByb3BlcnRpZXMgZm9yIEF1ZGl0YWJsZVN0b3JhZ2UgY29uc3RydWN0XG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQXVkaXRhYmxlU3RvcmFnZVByb3BzIHtcbiAgLyoqXG4gICAqIE5hbWUgZm9yIHRoZSBTMyBidWNrZXQgKHdpbGwgYmUgcHJlZml4ZWQgd2l0aCBzdGFjayBuYW1lIGFuZCBzdWZmaXhlZCB3aXRoIGFjY291bnQvcmVnaW9uKVxuICAgKi9cbiAgcmVhZG9ubHkgYnVja2V0TmFtZTogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBFbmFibGUgUzMgdmVyc2lvbmluZyBmb3IgZGF0YSBwcm90ZWN0aW9uXG4gICAqIEBkZWZhdWx0IHRydWVcbiAgICovXG4gIHJlYWRvbmx5IGVuYWJsZVZlcnNpb25pbmc/OiBib29sZWFuO1xuXG4gIC8qKlxuICAgKiBEYXRhIHJldGVudGlvbiBwZXJpb2QgaW4gZGF5c1xuICAgKiBAZGVmYXVsdCA5MFxuICAgKi9cbiAgcmVhZG9ubHkgcmV0ZW50aW9uRGF5cz86IG51bWJlcjtcblxuICAvKipcbiAgICogSUFNIHByaW5jaXBhbHMgdGhhdCBzaG91bGQgaGF2ZSBhY2Nlc3MgdG8gdGhpcyBidWNrZXRcbiAgICogQGRlZmF1bHQgW11cbiAgICovXG4gIHJlYWRvbmx5IGFsbG93ZWRQcmluY2lwYWxzPzogaWFtLklQcmluY2lwYWxbXTtcblxuICAvKipcbiAgICogQ29tcGxpYW5jZSBtb2RlIHRoYXQgYWZmZWN0cyByZXRlbnRpb24gYW5kIHNlY3VyaXR5IHNldHRpbmdzXG4gICAqIEBkZWZhdWx0IHVuZGVmaW5lZCAtIG5vIHNwZWNpZmljIGNvbXBsaWFuY2UgcmVxdWlyZW1lbnRzXG4gICAqL1xuICByZWFkb25seSBjb21wbGlhbmNlTW9kZT86IENvbXBsaWFuY2VNb2RlO1xuXG4gIC8qKlxuICAgKiBBcHBsaWNhdGlvbiBuYW1lIGZvciBjb25zaXN0ZW50IHRhZ2dpbmdcbiAgICovXG4gIHJlYWRvbmx5IGFwcE5hbWU6IHN0cmluZztcbn1cblxuLyoqXG4gKiBBIHNlY3VyZSwgYXVkaXRhYmxlIFMzIHN0b3JhZ2UgY29uc3RydWN0IHdpdGggZW5jcnlwdGlvbiwgdmVyc2lvbmluZyxcbiAqIGxpZmVjeWNsZSBtYW5hZ2VtZW50LCBhbmQgQ2xvdWRUcmFpbCBsb2dnaW5nLiBTdXBwb3J0cyB2YXJpb3VzIGNvbXBsaWFuY2UgbW9kZXMuXG4gKlxuICogRmVhdHVyZXM6XG4gKiAtIEtNUyBDTUsgZW5jcnlwdGlvbiBhdCByZXN0XG4gKiAtIFMzIHZlcnNpb25pbmcgZm9yIGRhdGEgcHJvdGVjdGlvblxuICogLSBJbnRlbGxpZ2VudCBsaWZlY3ljbGUgbWFuYWdlbWVudCAoSUEgYXQgMzAgZGF5cywgR2xhY2llciBhdCA5MCBkYXlzKVxuICogLSBDbG91ZFRyYWlsIGF1ZGl0IGxvZ2dpbmcgc2NvcGVkIHRvIHRoaXMgYnVja2V0XG4gKiAtIENvbXBsaWFuY2Utc3BlY2lmaWMgcmV0ZW50aW9uIHBvbGljaWVzXG4gKiAtIEJ1Y2tldCBwb2xpY2llcyBlbmZvcmNpbmcgU1NMIGFuZCBlbmNyeXB0aW9uIHJlcXVpcmVtZW50c1xuICpcbiAqIEBleGFtcGxlXG4gKiBgYGB0eXBlc2NyaXB0XG4gKiBuZXcgQXVkaXRhYmxlU3RvcmFnZSh0aGlzLCAnRG9jdW1lbnRTdG9yYWdlJywge1xuICogICBhcHBOYW1lOiAnTXlBcHAnLFxuICogICBidWNrZXROYW1lOiAnZG9jdW1lbnRzJyxcbiAqICAgY29tcGxpYW5jZU1vZGU6ICdISVBBQScsXG4gKiAgIHJldGVudGlvbkRheXM6IDI1NTUsIC8vIDcgeWVhcnMgZm9yIEhJUEFBXG4gKiAgIGFsbG93ZWRQcmluY2lwYWxzOiBbbGFtYmRhRnVuY3Rpb24ucm9sZSFdXG4gKiB9KTtcbiAqIGBgYFxuICovXG5leHBvcnQgY2xhc3MgQXVkaXRhYmxlU3RvcmFnZSBleHRlbmRzIENvbnN0cnVjdCB7XG4gIC8qKlxuICAgKiBUaGUgUzMgYnVja2V0IGZvciBzZWN1cmUgc3RvcmFnZVxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGJ1Y2tldDogczMuQnVja2V0O1xuXG4gIC8qKlxuICAgKiBLTVMga2V5IHVzZWQgZm9yIGJ1Y2tldCBlbmNyeXB0aW9uXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgZW5jcnlwdGlvbktleToga21zLktleTtcblxuICAvKipcbiAgICogQ2xvdWRUcmFpbCB0cmFpbCBmb3IgYXVkaXQgbG9nZ2luZ1xuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGF1ZGl0VHJhaWw6IGNsb3VkdHJhaWwuVHJhaWw7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEF1ZGl0YWJsZVN0b3JhZ2VQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICBjb25zdCB7XG4gICAgICBidWNrZXROYW1lLFxuICAgICAgZW5hYmxlVmVyc2lvbmluZyA9IHRydWUsXG4gICAgICByZXRlbnRpb25EYXlzID0gOTAsXG4gICAgICBhbGxvd2VkUHJpbmNpcGFscyA9IFtdLFxuICAgICAgY29tcGxpYW5jZU1vZGUsXG4gICAgICBhcHBOYW1lLFxuICAgIH0gPSBwcm9wcztcblxuICAgIC8vIEFwcGx5IGNvbXBsaWFuY2Utc3BlY2lmaWMgc2V0dGluZ3NcbiAgICBjb25zdCBlZmZlY3RpdmVSZXRlbnRpb25EYXlzID0gdGhpcy5nZXRDb21wbGlhbmNlUmV0ZW50aW9uRGF5cyhjb21wbGlhbmNlTW9kZSwgcmV0ZW50aW9uRGF5cyk7XG5cbiAgICAvLyBDcmVhdGUgS01TIGtleSBmb3IgYnVja2V0IGVuY3J5cHRpb25cbiAgICB0aGlzLmVuY3J5cHRpb25LZXkgPSBuZXcga21zLktleSh0aGlzLCAnRW5jcnlwdGlvbktleScsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBgS01TIGtleSBmb3IgJHtidWNrZXROYW1lfSBidWNrZXQgZW5jcnlwdGlvbmAsXG4gICAgICBlbmFibGVLZXlSb3RhdGlvbjogdHJ1ZSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTixcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IGVuY3J5cHRpb24ga2V5IGFjY2VzcyB0byBhbGxvd2VkIHByaW5jaXBhbHNcbiAgICBhbGxvd2VkUHJpbmNpcGFscy5mb3JFYWNoKChwcmluY2lwYWwpID0+IHtcbiAgICAgIHRoaXMuZW5jcnlwdGlvbktleS5ncmFudEVuY3J5cHREZWNyeXB0KHByaW5jaXBhbCk7XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgUzMgYnVja2V0IHdpdGggc2VjdXJpdHkgYmVzdCBwcmFjdGljZXNcbiAgICB0aGlzLmJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ0J1Y2tldCcsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IGAke2J1Y2tldE5hbWV9LSR7Y2RrLlN0YWNrLm9mKHRoaXMpLmFjY291bnR9LSR7Y2RrLlN0YWNrLm9mKHRoaXMpLnJlZ2lvbn1gLFxuICAgICAgdmVyc2lvbmVkOiBlbmFibGVWZXJzaW9uaW5nLFxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5LTVMsXG4gICAgICBlbmNyeXB0aW9uS2V5OiB0aGlzLmVuY3J5cHRpb25LZXksXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgZW5mb3JjZVNTTDogdHJ1ZSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTixcbiAgICAgIGxpZmVjeWNsZVJ1bGVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogJ09wdGltaXplU3RvcmFnZUNvc3RzJyxcbiAgICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICAgIHRyYW5zaXRpb25zOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHN0b3JhZ2VDbGFzczogczMuU3RvcmFnZUNsYXNzLklORlJFUVVFTlRfQUNDRVNTLFxuICAgICAgICAgICAgICB0cmFuc2l0aW9uQWZ0ZXI6IGNkay5EdXJhdGlvbi5kYXlzKDMwKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHN0b3JhZ2VDbGFzczogczMuU3RvcmFnZUNsYXNzLkdMQUNJRVIsXG4gICAgICAgICAgICAgIHRyYW5zaXRpb25BZnRlcjogY2RrLkR1cmF0aW9uLmRheXMoOTApLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdLFxuICAgICAgICAgIGV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKGVmZmVjdGl2ZVJldGVudGlvbkRheXMpLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIEFkZCBidWNrZXQgcG9saWN5IHRvIGRlbnkgbm9uLVNTTCByZXF1ZXN0cyBhbmQgbm9uLUtNUyB1cGxvYWRzXG4gICAgdGhpcy5idWNrZXQuYWRkVG9SZXNvdXJjZVBvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgc2lkOiAnRGVueUluc2VjdXJlQ29ubmVjdGlvbnMnLFxuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuREVOWSxcbiAgICAgICAgcHJpbmNpcGFsczogW25ldyBpYW0uQW55UHJpbmNpcGFsKCldLFxuICAgICAgICBhY3Rpb25zOiBbJ3MzOionXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbdGhpcy5idWNrZXQuYnVja2V0QXJuLCB0aGlzLmJ1Y2tldC5hcm5Gb3JPYmplY3RzKCcqJyldLFxuICAgICAgICBjb25kaXRpb25zOiB7XG4gICAgICAgICAgQm9vbDoge1xuICAgICAgICAgICAgJ2F3czpTZWN1cmVUcmFuc3BvcnQnOiAnZmFsc2UnLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICB0aGlzLmJ1Y2tldC5hZGRUb1Jlc291cmNlUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBzaWQ6ICdEZW55VW5lbmNyeXB0ZWRVcGxvYWRzJyxcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkRFTlksXG4gICAgICAgIHByaW5jaXBhbHM6IFtuZXcgaWFtLkFueVByaW5jaXBhbCgpXSxcbiAgICAgICAgYWN0aW9uczogWydzMzpQdXRPYmplY3QnXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbdGhpcy5idWNrZXQuYXJuRm9yT2JqZWN0cygnKicpXSxcbiAgICAgICAgY29uZGl0aW9uczoge1xuICAgICAgICAgIFN0cmluZ05vdEVxdWFsczoge1xuICAgICAgICAgICAgJ3MzOngtYW16LXNlcnZlci1zaWRlLWVuY3J5cHRpb24nOiAnYXdzOmttcycsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIENyZWF0ZSBDbG91ZFRyYWlsIGZvciBhdWRpdCBsb2dnaW5nXG4gICAgdGhpcy5hdWRpdFRyYWlsID0gbmV3IGNsb3VkdHJhaWwuVHJhaWwodGhpcywgJ0F1ZGl0VHJhaWwnLCB7XG4gICAgICB0cmFpbE5hbWU6IGAke2J1Y2tldE5hbWV9LWF1ZGl0LXRyYWlsYCxcbiAgICAgIGluY2x1ZGVHbG9iYWxTZXJ2aWNlRXZlbnRzOiB0cnVlLFxuICAgICAgaXNNdWx0aVJlZ2lvblRyYWlsOiB0cnVlLFxuICAgICAgZW5hYmxlRmlsZVZhbGlkYXRpb246IHRydWUsXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgZGF0YSBldmVudHMgZm9yIHRoaXMgc3BlY2lmaWMgYnVja2V0XG4gICAgdGhpcy5hdWRpdFRyYWlsLmFkZFMzRXZlbnRTZWxlY3RvcihbXG4gICAgICB7XG4gICAgICAgIGJ1Y2tldDogdGhpcy5idWNrZXQsXG4gICAgICAgIG9iamVjdFByZWZpeDogJycsXG4gICAgICB9LFxuICAgIF0pO1xuXG4gICAgLy8gQXBwbHkgY29uc2lzdGVudCB0YWdnaW5nXG4gICAgY2RrLlRhZ3Mub2YodGhpcykuYWRkKCdQcm9qZWN0JywgYXBwTmFtZSk7XG4gICAgY2RrLlRhZ3Mub2YodGhpcykuYWRkKCdNYW5hZ2VkQnknLCAnY2RrLWFpLWNvbnN0cnVjdHMnKTtcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ093bmVyJywgJ2pvaG5hdGhhbi1ob3JuZXInKTtcbiAgICBpZiAoY29tcGxpYW5jZU1vZGUpIHtcbiAgICAgIGNkay5UYWdzLm9mKHRoaXMpLmFkZCgnQ29tcGxpYW5jZScsIGNvbXBsaWFuY2VNb2RlKTtcbiAgICB9XG5cbiAgICAvLyBPdXRwdXQgaW1wb3J0YW50IHZhbHVlc1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdCdWNrZXROYW1lJywge1xuICAgICAgdmFsdWU6IHRoaXMuYnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ05hbWUgb2YgdGhlIGF1ZGl0YWJsZSBTMyBidWNrZXQnLFxuICAgICAgZXhwb3J0TmFtZTogYCR7Y2RrLlN0YWNrLm9mKHRoaXMpLnN0YWNrTmFtZX0tJHtpZH0tQnVja2V0TmFtZWAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQnVja2V0QXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMuYnVja2V0LmJ1Y2tldEFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVJOIG9mIHRoZSBhdWRpdGFibGUgUzMgYnVja2V0JyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke2Nkay5TdGFjay5vZih0aGlzKS5zdGFja05hbWV9LSR7aWR9LUJ1Y2tldEFybmAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRW5jcnlwdGlvbktleUFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmVuY3J5cHRpb25LZXkua2V5QXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdBUk4gb2YgdGhlIEtNUyBlbmNyeXB0aW9uIGtleScsXG4gICAgICBleHBvcnROYW1lOiBgJHtjZGsuU3RhY2sub2YodGhpcykuc3RhY2tOYW1lfS0ke2lkfS1FbmNyeXB0aW9uS2V5QXJuYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBdWRpdFRyYWlsQXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMuYXVkaXRUcmFpbC50cmFpbEFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVJOIG9mIHRoZSBDbG91ZFRyYWlsIGF1ZGl0IHRyYWlsJyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke2Nkay5TdGFjay5vZih0aGlzKS5zdGFja05hbWV9LSR7aWR9LUF1ZGl0VHJhaWxBcm5gLFxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCByZXRlbnRpb24gZGF5cyBiYXNlZCBvbiBjb21wbGlhbmNlIG1vZGVcbiAgICogQHBhcmFtIGNvbXBsaWFuY2VNb2RlIFRoZSBjb21wbGlhbmNlIG1vZGVcbiAgICogQHBhcmFtIGRlZmF1bHRSZXRlbnRpb24gVGhlIGRlZmF1bHQgcmV0ZW50aW9uIHBlcmlvZFxuICAgKiBAcmV0dXJucyBFZmZlY3RpdmUgcmV0ZW50aW9uIHBlcmlvZCBpbiBkYXlzXG4gICAqL1xuICBwcml2YXRlIGdldENvbXBsaWFuY2VSZXRlbnRpb25EYXlzKGNvbXBsaWFuY2VNb2RlPzogQ29tcGxpYW5jZU1vZGUsIGRlZmF1bHRSZXRlbnRpb24/OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGlmICghY29tcGxpYW5jZU1vZGUpIHtcbiAgICAgIHJldHVybiBkZWZhdWx0UmV0ZW50aW9uIHx8IDkwO1xuICAgIH1cblxuICAgIHN3aXRjaCAoY29tcGxpYW5jZU1vZGUpIHtcbiAgICAgIGNhc2UgJ0hJUEFBJzpcbiAgICAgICAgcmV0dXJuIDI1NTU7IC8vIDcgeWVhcnNcbiAgICAgIGNhc2UgJ0ZFUlBBJzpcbiAgICAgICAgcmV0dXJuIDE4MjU7IC8vIDUgeWVhcnNcbiAgICAgIGNhc2UgJ0ZFRFJBTVAnOlxuICAgICAgICByZXR1cm4gMjU1NTsgLy8gNyB5ZWFyc1xuICAgICAgY2FzZSAnU1IxMS03JzpcbiAgICAgICAgcmV0dXJuIDI1NTU7IC8vIDcgeWVhcnMgKEZlZGVyYWwgYmFua2luZyByZWd1bGF0aW9uKVxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgcmV0dXJuIGRlZmF1bHRSZXRlbnRpb24gfHwgOTA7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEdyYW50IHJlYWQgYWNjZXNzIHRvIGFuIElBTSBwcmluY2lwYWxcbiAgICogQHBhcmFtIGdyYW50ZWUgVGhlIElBTSBwcmluY2lwYWwgdG8gZ3JhbnQgYWNjZXNzIHRvXG4gICAqL1xuICBwdWJsaWMgZ3JhbnRSZWFkKGdyYW50ZWU6IGlhbS5JR3JhbnRhYmxlKTogaWFtLkdyYW50IHtcbiAgICB0aGlzLmVuY3J5cHRpb25LZXkuZ3JhbnREZWNyeXB0KGdyYW50ZWUpO1xuICAgIHJldHVybiB0aGlzLmJ1Y2tldC5ncmFudFJlYWQoZ3JhbnRlZSk7XG4gIH1cblxuICAvKipcbiAgICogR3JhbnQgd3JpdGUgYWNjZXNzIHRvIGFuIElBTSBwcmluY2lwYWxcbiAgICogQHBhcmFtIGdyYW50ZWUgVGhlIElBTSBwcmluY2lwYWwgdG8gZ3JhbnQgYWNjZXNzIHRvXG4gICAqL1xuICBwdWJsaWMgZ3JhbnRXcml0ZShncmFudGVlOiBpYW0uSUdyYW50YWJsZSk6IGlhbS5HcmFudCB7XG4gICAgdGhpcy5lbmNyeXB0aW9uS2V5LmdyYW50RW5jcnlwdChncmFudGVlKTtcbiAgICByZXR1cm4gdGhpcy5idWNrZXQuZ3JhbnRXcml0ZShncmFudGVlKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHcmFudCByZWFkIGFuZCB3cml0ZSBhY2Nlc3MgdG8gYW4gSUFNIHByaW5jaXBhbFxuICAgKiBAcGFyYW0gZ3JhbnRlZSBUaGUgSUFNIHByaW5jaXBhbCB0byBncmFudCBhY2Nlc3MgdG9cbiAgICovXG4gIHB1YmxpYyBncmFudFJlYWRXcml0ZShncmFudGVlOiBpYW0uSUdyYW50YWJsZSk6IGlhbS5HcmFudCB7XG4gICAgdGhpcy5lbmNyeXB0aW9uS2V5LmdyYW50RW5jcnlwdERlY3J5cHQoZ3JhbnRlZSk7XG4gICAgcmV0dXJuIHRoaXMuYnVja2V0LmdyYW50UmVhZFdyaXRlKGdyYW50ZWUpO1xuICB9XG59Il19