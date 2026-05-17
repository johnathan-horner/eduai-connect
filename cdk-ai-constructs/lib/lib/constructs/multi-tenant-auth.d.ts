import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';
/**
 * Properties for MultiTenantAuth construct
 */
export interface MultiTenantAuthProps {
    /**
     * Application name used for naming resources
     */
    readonly appName: string;
    /**
     * Callback URLs for successful authentication
     * @example ['https://myapp.com/callback', 'http://localhost:3000/callback']
     */
    readonly callbackUrls: string[];
    /**
     * Logout URLs for successful sign out
     * @default Same as callbackUrls
     */
    readonly logoutUrls?: string[];
    /**
     * Custom user attributes to add to the user pool
     * tenant_id, tier, and plan are always included
     * @default []
     */
    readonly customAttributes?: string[];
    /**
     * Whether to require multi-factor authentication
     * @default false
     */
    readonly mfaRequired?: boolean;
    /**
     * Password policy settings
     * @default Secure defaults (min 8 chars, requires uppercase, lowercase, number, symbol)
     */
    readonly passwordPolicy?: cognito.PasswordPolicy;
    /**
     * Domain prefix for the Cognito hosted UI
     * If not provided, no hosted UI domain will be created
     * @default undefined
     */
    readonly domainPrefix?: string;
}
/**
 * A comprehensive multi-tenant authentication construct using Amazon Cognito
 * with DynamoDB for tenant management and Lambda triggers for user lifecycle.
 *
 * Features:
 * - Cognito User Pool with custom tenant attributes
 * - DynamoDB table for tenant metadata and billing integration
 * - Lambda trigger for automatic tenant record creation
 * - API Gateway Cognito authorizer for protecting APIs
 * - Support for Stripe integration via tenant metadata
 * - Configurable MFA and password policies
 * - Optional hosted UI with custom domain
 *
 * @example
 * ```typescript
 * const auth = new MultiTenantAuth(this, 'Auth', {
 *   appName: 'MyApp',
 *   callbackUrls: ['https://myapp.com/dashboard'],
 *   customAttributes: ['company_size', 'industry'],
 *   mfaRequired: true,
 *   domainPrefix: 'myapp-auth'
 * });
 *
 * // Use the authorizer in API Gateway
 * const api = new apigateway.RestApi(this, 'API');
 * const protectedResource = api.root.addResource('protected');
 * protectedResource.addMethod('GET', integration, {
 *   authorizer: auth.authorizer
 * });
 * ```
 */
export declare class MultiTenantAuth extends Construct {
    /**
     * Cognito User Pool for authentication
     */
    readonly userPool: cognito.UserPool;
    /**
     * Cognito User Pool Client for applications
     */
    readonly userPoolClient: cognito.UserPoolClient;
    /**
     * DynamoDB table for tenant metadata
     */
    readonly tenantsTable: dynamodb.Table;
    /**
     * Lambda function for post-confirmation processing
     */
    readonly postConfirmationTrigger: lambda.Function;
    /**
     * API Gateway Cognito authorizer
     */
    readonly authorizer: apigateway.CognitoUserPoolsAuthorizer;
    /**
     * Cognito User Pool Domain (if domainPrefix provided)
     */
    readonly userPoolDomain?: cognito.UserPoolDomain;
    constructor(scope: Construct, id: string, props: MultiTenantAuthProps);
    /**
     * Grant read access to the tenants table
     * @param grantee The IAM principal to grant access to
     */
    grantTenantsTableRead(grantee: iam.IGrantable): iam.Grant;
    /**
     * Grant write access to the tenants table
     * @param grantee The IAM principal to grant access to
     */
    grantTenantsTableWrite(grantee: iam.IGrantable): iam.Grant;
    /**
     * Grant read and write access to the tenants table
     * @param grantee The IAM principal to grant access to
     */
    grantTenantsTableReadWrite(grantee: iam.IGrantable): iam.Grant;
    /**
     * Create a pre-token generation trigger to add custom claims
     * @param lambda The Lambda function to use as trigger
     */
    addPreTokenGenerationTrigger(lambda: lambda.Function): void;
    /**
     * Get the hosted UI sign-in URL
     * @param redirectUri The redirect URI after sign-in
     * @returns The sign-in URL
     */
    getSignInUrl(redirectUri: string): string;
}
