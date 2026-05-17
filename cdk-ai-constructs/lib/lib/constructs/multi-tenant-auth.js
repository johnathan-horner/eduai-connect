"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MultiTenantAuth = void 0;
const cognito = require("aws-cdk-lib/aws-cognito");
const lambda = require("aws-cdk-lib/aws-lambda");
const dynamodb = require("aws-cdk-lib/aws-dynamodb");
const apigateway = require("aws-cdk-lib/aws-apigateway");
const cdk = require("aws-cdk-lib");
const constructs_1 = require("constructs");
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
class MultiTenantAuth extends constructs_1.Construct {
    /**
     * Cognito User Pool for authentication
     */
    userPool;
    /**
     * Cognito User Pool Client for applications
     */
    userPoolClient;
    /**
     * DynamoDB table for tenant metadata
     */
    tenantsTable;
    /**
     * Lambda function for post-confirmation processing
     */
    postConfirmationTrigger;
    /**
     * API Gateway Cognito authorizer
     */
    authorizer;
    /**
     * Cognito User Pool Domain (if domainPrefix provided)
     */
    userPoolDomain;
    constructor(scope, id, props) {
        super(scope, id);
        const { appName, callbackUrls, logoutUrls = callbackUrls, customAttributes = [], mfaRequired = false, passwordPolicy, domainPrefix, } = props;
        // Create DynamoDB table for tenants
        this.tenantsTable = new dynamodb.Table(this, 'TenantsTable', {
            tableName: `${appName}-tenants`,
            partitionKey: {
                name: 'tenant_id',
                type: dynamodb.AttributeType.STRING,
            },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            encryption: dynamodb.TableEncryption.AWS_MANAGED,
            pointInTimeRecoverySpecification: {
                pointInTimeRecoveryEnabled: true,
            },
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
        });
        // Add GSI for Stripe customer lookups
        this.tenantsTable.addGlobalSecondaryIndex({
            indexName: 'stripe-customer-index',
            partitionKey: {
                name: 'stripe_customer_id',
                type: dynamodb.AttributeType.STRING,
            },
            projectionType: dynamodb.ProjectionType.ALL,
        });
        // Create post-confirmation Lambda trigger
        this.postConfirmationTrigger = new lambda.Function(this, 'PostConfirmationTrigger', {
            functionName: `${appName}-post-confirmation`,
            runtime: lambda.Runtime.PYTHON_3_11,
            handler: 'index.handler',
            code: lambda.Code.fromInline(`
import json
import boto3
import uuid
import logging
from datetime import datetime

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('${this.tenantsTable.tableName}')

def handler(event, context):
    logger.info(f"Post confirmation trigger event: {json.dumps(event)}")

    try:
        user_attributes = event['request']['userAttributes']

        # Extract user information
        user_id = event['userName']
        email = user_attributes.get('email', '')
        tenant_id = user_attributes.get('custom:tenant_id', str(uuid.uuid4()))
        tier = user_attributes.get('custom:tier', 'free')
        plan = user_attributes.get('custom:plan', 'starter')
        phone_number = user_attributes.get('phone_number', '')

        # Create tenant record
        tenant_record = {
            'tenant_id': tenant_id,
            'user_id': user_id,
            'email': email,
            'tier': tier,
            'plan': plan,
            'created_at': datetime.utcnow().isoformat(),
            'phone_number': phone_number,
            'stripe_customer_id': None,
            'knowledge_base_s3_path': f"tenants/{tenant_id}/knowledge-base/",
            'status': 'active'
        }

        # Add custom attributes
        for attr_name, attr_value in user_attributes.items():
            if attr_name.startswith('custom:') and attr_name not in [
                'custom:tenant_id', 'custom:tier', 'custom:plan'
            ]:
                clean_name = attr_name.replace('custom:', '')
                tenant_record[clean_name] = attr_value

        # Save to DynamoDB
        table.put_item(Item=tenant_record)

        logger.info(f"Created tenant record for {tenant_id}")
        return event

    except Exception as e:
        logger.error(f"Error processing post-confirmation: {str(e)}")
        raise e
`),
            environment: {
                TENANTS_TABLE_NAME: this.tenantsTable.tableName,
            },
            timeout: cdk.Duration.minutes(1),
        });
        // Grant DynamoDB permissions to the trigger
        this.tenantsTable.grantWriteData(this.postConfirmationTrigger);
        // Build user pool attributes
        const userPoolAttributes = {};
        // Always add standard tenant attributes
        userPoolAttributes.tenant_id = new cognito.StringAttribute({ mutable: true });
        userPoolAttributes.tier = new cognito.StringAttribute({ mutable: true });
        userPoolAttributes.plan = new cognito.StringAttribute({ mutable: true });
        // Add custom attributes
        customAttributes.forEach(attr => {
            userPoolAttributes[attr] = new cognito.StringAttribute({ mutable: true });
        });
        // Create Cognito User Pool
        this.userPool = new cognito.UserPool(this, 'UserPool', {
            userPoolName: `${appName}-users`,
            selfSignUpEnabled: true,
            signInAliases: {
                email: true,
                username: false,
            },
            signInCaseSensitive: false,
            standardAttributes: {
                email: {
                    required: true,
                    mutable: true,
                },
                phoneNumber: {
                    required: false,
                    mutable: true,
                },
                givenName: {
                    required: false,
                    mutable: true,
                },
                familyName: {
                    required: false,
                    mutable: true,
                },
            },
            customAttributes: userPoolAttributes,
            passwordPolicy: passwordPolicy || {
                minLength: 8,
                requireLowercase: true,
                requireUppercase: true,
                requireDigits: true,
                requireSymbols: true,
            },
            mfa: mfaRequired ? cognito.Mfa.REQUIRED : cognito.Mfa.OFF,
            mfaSecondFactor: {
                sms: true,
                otp: true,
            },
            accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
            lambdaTriggers: {
                postConfirmation: this.postConfirmationTrigger,
            },
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        });
        // Create User Pool Client
        this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
            userPool: this.userPool,
            userPoolClientName: `${appName}-client`,
            generateSecret: false,
            authFlows: {
                userPassword: true,
                userSrp: true,
            },
            oAuth: {
                flows: {
                    authorizationCodeGrant: true,
                },
                scopes: [
                    cognito.OAuthScope.OPENID,
                    cognito.OAuthScope.EMAIL,
                    cognito.OAuthScope.PROFILE,
                ],
                callbackUrls: callbackUrls,
                logoutUrls: logoutUrls,
            },
            preventUserExistenceErrors: true,
            refreshTokenValidity: cdk.Duration.days(30),
            accessTokenValidity: cdk.Duration.minutes(60),
            idTokenValidity: cdk.Duration.minutes(60),
        });
        // Create domain if prefix provided
        if (domainPrefix) {
            this.userPoolDomain = new cognito.UserPoolDomain(this, 'UserPoolDomain', {
                userPool: this.userPool,
                cognitoDomain: {
                    domainPrefix: domainPrefix,
                },
            });
        }
        // Create API Gateway authorizer
        this.authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'Authorizer', {
            cognitoUserPools: [this.userPool],
            authorizerName: `${appName}-authorizer`,
            identitySource: 'method.request.header.Authorization',
        });
        // Apply consistent tagging
        cdk.Tags.of(this).add('Project', appName);
        cdk.Tags.of(this).add('ManagedBy', 'cdk-ai-constructs');
        cdk.Tags.of(this).add('Owner', 'johnathan-horner');
        cdk.Tags.of(this).add('Component', 'MultiTenantAuth');
        // Output important values
        new cdk.CfnOutput(this, 'UserPoolId', {
            value: this.userPool.userPoolId,
            description: 'Cognito User Pool ID',
            exportName: `${cdk.Stack.of(this).stackName}-${id}-UserPoolId`,
        });
        new cdk.CfnOutput(this, 'UserPoolClientId', {
            value: this.userPoolClient.userPoolClientId,
            description: 'Cognito User Pool Client ID',
            exportName: `${cdk.Stack.of(this).stackName}-${id}-UserPoolClientId`,
        });
        new cdk.CfnOutput(this, 'TenantsTableName', {
            value: this.tenantsTable.tableName,
            description: 'DynamoDB Tenants Table Name',
            exportName: `${cdk.Stack.of(this).stackName}-${id}-TenantsTableName`,
        });
        new cdk.CfnOutput(this, 'TenantsTableArn', {
            value: this.tenantsTable.tableArn,
            description: 'DynamoDB Tenants Table ARN',
            exportName: `${cdk.Stack.of(this).stackName}-${id}-TenantsTableArn`,
        });
        if (this.userPoolDomain) {
            new cdk.CfnOutput(this, 'UserPoolDomainUrl', {
                value: `https://${this.userPoolDomain.domainName}.auth.${cdk.Stack.of(this).region}.amazoncognito.com`,
                description: 'Cognito User Pool Domain URL',
                exportName: `${cdk.Stack.of(this).stackName}-${id}-UserPoolDomainUrl`,
            });
        }
    }
    /**
     * Grant read access to the tenants table
     * @param grantee The IAM principal to grant access to
     */
    grantTenantsTableRead(grantee) {
        return this.tenantsTable.grantReadData(grantee);
    }
    /**
     * Grant write access to the tenants table
     * @param grantee The IAM principal to grant access to
     */
    grantTenantsTableWrite(grantee) {
        return this.tenantsTable.grantWriteData(grantee);
    }
    /**
     * Grant read and write access to the tenants table
     * @param grantee The IAM principal to grant access to
     */
    grantTenantsTableReadWrite(grantee) {
        return this.tenantsTable.grantReadWriteData(grantee);
    }
    /**
     * Create a pre-token generation trigger to add custom claims
     * @param lambda The Lambda function to use as trigger
     */
    addPreTokenGenerationTrigger(lambda) {
        this.userPool.addTrigger(cognito.UserPoolOperation.PRE_TOKEN_GENERATION, lambda);
    }
    /**
     * Get the hosted UI sign-in URL
     * @param redirectUri The redirect URI after sign-in
     * @returns The sign-in URL
     */
    getSignInUrl(redirectUri) {
        if (!this.userPoolDomain) {
            throw new Error('User Pool Domain must be configured to generate sign-in URL');
        }
        const domain = `${this.userPoolDomain.domainName}.auth.${cdk.Stack.of(this).region}.amazoncognito.com`;
        return `https://${domain}/login?client_id=${this.userPoolClient.userPoolClientId}&response_type=code&scope=openid+email+profile&redirect_uri=${encodeURIComponent(redirectUri)}`;
    }
}
exports.MultiTenantAuth = MultiTenantAuth;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibXVsdGktdGVuYW50LWF1dGguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9jb25zdHJ1Y3RzL211bHRpLXRlbmFudC1hdXRoLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1EQUFtRDtBQUNuRCxpREFBaUQ7QUFDakQscURBQXFEO0FBRXJELHlEQUF5RDtBQUN6RCxtQ0FBbUM7QUFDbkMsMkNBQXVDO0FBa0R2Qzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBOEJHO0FBQ0gsTUFBYSxlQUFnQixTQUFRLHNCQUFTO0lBQzVDOztPQUVHO0lBQ2EsUUFBUSxDQUFtQjtJQUUzQzs7T0FFRztJQUNhLGNBQWMsQ0FBeUI7SUFFdkQ7O09BRUc7SUFDYSxZQUFZLENBQWlCO0lBRTdDOztPQUVHO0lBQ2EsdUJBQXVCLENBQWtCO0lBRXpEOztPQUVHO0lBQ2EsVUFBVSxDQUF3QztJQUVsRTs7T0FFRztJQUNhLGNBQWMsQ0FBMEI7SUFFeEQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUEyQjtRQUNuRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLE1BQU0sRUFDSixPQUFPLEVBQ1AsWUFBWSxFQUNaLFVBQVUsR0FBRyxZQUFZLEVBQ3pCLGdCQUFnQixHQUFHLEVBQUUsRUFDckIsV0FBVyxHQUFHLEtBQUssRUFDbkIsY0FBYyxFQUNkLFlBQVksR0FDYixHQUFHLEtBQUssQ0FBQztRQUVWLG9DQUFvQztRQUNwQyxJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsY0FBYyxFQUFFO1lBQzNELFNBQVMsRUFBRSxHQUFHLE9BQU8sVUFBVTtZQUMvQixZQUFZLEVBQUU7Z0JBQ1osSUFBSSxFQUFFLFdBQVc7Z0JBQ2pCLElBQUksRUFBRSxRQUFRLENBQUMsYUFBYSxDQUFDLE1BQU07YUFDcEM7WUFDRCxXQUFXLEVBQUUsUUFBUSxDQUFDLFdBQVcsQ0FB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Q0FBQyxDQUFDO0lBQ3ZELENBQUM7SUFFRDs7O09BR0c7SUFDSSw0QkFBNEIsQ0FBQyxNQUF1QjtRQUN6RCxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsaUJBQWlCLENBQUMsb0JBQW9CLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDbkYsQ0FBQztJQUVEOzs7O09BSUc7SUFDSSxZQUFZLENBQUMsV0FBbUI7UUFDckMsSUFBSSxDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUN6QixNQUFNLElBQUksS0FBSyxDQUFDLDZEQUE2RCxDQUFDLENBQUM7UUFDakYsQ0FBQztRQUVELE1BQU0sTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxVQUFVLFNBQVMsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxvQkFBb0IsQ0FBQztRQUN2RyxPQUFPLFdBQVcsTUFBTSxvQkFBb0IsSUFBSSxDQUFDLGNBQWMsQ0FBQyxnQkFBZ0IsK0RBQStELGtCQUFrQixDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUM7SUFDbkwsQ0FBQztDQUNGO0FBNVVELDBDQTRVQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNvZ25pdG8gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZ25pdG8nO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXknO1xuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG4vKipcbiAqIFByb3BlcnRpZXMgZm9yIE11bHRpVGVuYW50QXV0aCBjb25zdHJ1Y3RcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBNdWx0aVRlbmFudEF1dGhQcm9wcyB7XG4gIC8qKlxuICAgKiBBcHBsaWNhdGlvbiBuYW1lIHVzZWQgZm9yIG5hbWluZyByZXNvdXJjZXNcbiAgICovXG4gIHJlYWRvbmx5IGFwcE5hbWU6IHN0cmluZztcblxuICAvKipcbiAgICogQ2FsbGJhY2sgVVJMcyBmb3Igc3VjY2Vzc2Z1bCBhdXRoZW50aWNhdGlvblxuICAgKiBAZXhhbXBsZSBbJ2h0dHBzOi8vbXlhcHAuY29tL2NhbGxiYWNrJywgJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMC9jYWxsYmFjayddXG4gICAqL1xuICByZWFkb25seSBjYWxsYmFja1VybHM6IHN0cmluZ1tdO1xuXG4gIC8qKlxuICAgKiBMb2dvdXQgVVJMcyBmb3Igc3VjY2Vzc2Z1bCBzaWduIG91dFxuICAgKiBAZGVmYXVsdCBTYW1lIGFzIGNhbGxiYWNrVXJsc1xuICAgKi9cbiAgcmVhZG9ubHkgbG9nb3V0VXJscz86IHN0cmluZ1tdO1xuXG4gIC8qKlxuICAgKiBDdXN0b20gdXNlciBhdHRyaWJ1dGVzIHRvIGFkZCB0byB0aGUgdXNlciBwb29sXG4gICAqIHRlbmFudF9pZCwgdGllciwgYW5kIHBsYW4gYXJlIGFsd2F5cyBpbmNsdWRlZFxuICAgKiBAZGVmYXVsdCBbXVxuICAgKi9cbiAgcmVhZG9ubHkgY3VzdG9tQXR0cmlidXRlcz86IHN0cmluZ1tdO1xuXG4gIC8qKlxuICAgKiBXaGV0aGVyIHRvIHJlcXVpcmUgbXVsdGktZmFjdG9yIGF1dGhlbnRpY2F0aW9uXG4gICAqIEBkZWZhdWx0IGZhbHNlXG4gICAqL1xuICByZWFkb25seSBtZmFSZXF1aXJlZD86IGJvb2xlYW47XG5cbiAgLyoqXG4gICAqIFBhc3N3b3JkIHBvbGljeSBzZXR0aW5nc1xuICAgKiBAZGVmYXVsdCBTZWN1cmUgZGVmYXVsdHMgKG1pbiA4IGNoYXJzLCByZXF1aXJlcyB1cHBlcmNhc2UsIGxvd2VyY2FzZSwgbnVtYmVyLCBzeW1ib2wpXG4gICAqL1xuICByZWFkb25seSBwYXNzd29yZFBvbGljeT86IGNvZ25pdG8uUGFzc3dvcmRQb2xpY3k7XG5cbiAgLyoqXG4gICAqIERvbWFpbiBwcmVmaXggZm9yIHRoZSBDb2duaXRvIGhvc3RlZCBVSVxuICAgKiBJZiBub3QgcHJvdmlkZWQsIG5vIGhvc3RlZCBVSSBkb21haW4gd2lsbCBiZSBjcmVhdGVkXG4gICAqIEBkZWZhdWx0IHVuZGVmaW5lZFxuICAgKi9cbiAgcmVhZG9ubHkgZG9tYWluUHJlZml4Pzogc3RyaW5nO1xufVxuXG4vKipcbiAqIEEgY29tcHJlaGVuc2l2ZSBtdWx0aS10ZW5hbnQgYXV0aGVudGljYXRpb24gY29uc3RydWN0IHVzaW5nIEFtYXpvbiBDb2duaXRvXG4gKiB3aXRoIER5bmFtb0RCIGZvciB0ZW5hbnQgbWFuYWdlbWVudCBhbmQgTGFtYmRhIHRyaWdnZXJzIGZvciB1c2VyIGxpZmVjeWNsZS5cbiAqXG4gKiBGZWF0dXJlczpcbiAqIC0gQ29nbml0byBVc2VyIFBvb2wgd2l0aCBjdXN0b20gdGVuYW50IGF0dHJpYnV0ZXNcbiAqIC0gRHluYW1vREIgdGFibGUgZm9yIHRlbmFudCBtZXRhZGF0YSBhbmQgYmlsbGluZyBpbnRlZ3JhdGlvblxuICogLSBMYW1iZGEgdHJpZ2dlciBmb3IgYXV0b21hdGljIHRlbmFudCByZWNvcmQgY3JlYXRpb25cbiAqIC0gQVBJIEdhdGV3YXkgQ29nbml0byBhdXRob3JpemVyIGZvciBwcm90ZWN0aW5nIEFQSXNcbiAqIC0gU3VwcG9ydCBmb3IgU3RyaXBlIGludGVncmF0aW9uIHZpYSB0ZW5hbnQgbWV0YWRhdGFcbiAqIC0gQ29uZmlndXJhYmxlIE1GQSBhbmQgcGFzc3dvcmQgcG9saWNpZXNcbiAqIC0gT3B0aW9uYWwgaG9zdGVkIFVJIHdpdGggY3VzdG9tIGRvbWFpblxuICpcbiAqIEBleGFtcGxlXG4gKiBgYGB0eXBlc2NyaXB0XG4gKiBjb25zdCBhdXRoID0gbmV3IE11bHRpVGVuYW50QXV0aCh0aGlzLCAnQXV0aCcsIHtcbiAqICAgYXBwTmFtZTogJ015QXBwJyxcbiAqICAgY2FsbGJhY2tVcmxzOiBbJ2h0dHBzOi8vbXlhcHAuY29tL2Rhc2hib2FyZCddLFxuICogICBjdXN0b21BdHRyaWJ1dGVzOiBbJ2NvbXBhbnlfc2l6ZScsICdpbmR1c3RyeSddLFxuICogICBtZmFSZXF1aXJlZDogdHJ1ZSxcbiAqICAgZG9tYWluUHJlZml4OiAnbXlhcHAtYXV0aCdcbiAqIH0pO1xuICpcbiAqIC8vIFVzZSB0aGUgYXV0aG9yaXplciBpbiBBUEkgR2F0ZXdheVxuICogY29uc3QgYXBpID0gbmV3IGFwaWdhdGV3YXkuUmVzdEFwaSh0aGlzLCAnQVBJJyk7XG4gKiBjb25zdCBwcm90ZWN0ZWRSZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKCdwcm90ZWN0ZWQnKTtcbiAqIHByb3RlY3RlZFJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgaW50ZWdyYXRpb24sIHtcbiAqICAgYXV0aG9yaXplcjogYXV0aC5hdXRob3JpemVyXG4gKiB9KTtcbiAqIGBgYFxuICovXG5leHBvcnQgY2xhc3MgTXVsdGlUZW5hbnRBdXRoIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgLyoqXG4gICAqIENvZ25pdG8gVXNlciBQb29sIGZvciBhdXRoZW50aWNhdGlvblxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IHVzZXJQb29sOiBjb2duaXRvLlVzZXJQb29sO1xuXG4gIC8qKlxuICAgKiBDb2duaXRvIFVzZXIgUG9vbCBDbGllbnQgZm9yIGFwcGxpY2F0aW9uc1xuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IHVzZXJQb29sQ2xpZW50OiBjb2duaXRvLlVzZXJQb29sQ2xpZW50O1xuXG4gIC8qKlxuICAgKiBEeW5hbW9EQiB0YWJsZSBmb3IgdGVuYW50IG1ldGFkYXRhXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgdGVuYW50c1RhYmxlOiBkeW5hbW9kYi5UYWJsZTtcblxuICAvKipcbiAgICogTGFtYmRhIGZ1bmN0aW9uIGZvciBwb3N0LWNvbmZpcm1hdGlvbiBwcm9jZXNzaW5nXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgcG9zdENvbmZpcm1hdGlvblRyaWdnZXI6IGxhbWJkYS5GdW5jdGlvbjtcblxuICAvKipcbiAgICogQVBJIEdhdGV3YXkgQ29nbml0byBhdXRob3JpemVyXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgYXV0aG9yaXplcjogYXBpZ2F0ZXdheS5Db2duaXRvVXNlclBvb2xzQXV0aG9yaXplcjtcblxuICAvKipcbiAgICogQ29nbml0byBVc2VyIFBvb2wgRG9tYWluIChpZiBkb21haW5QcmVmaXggcHJvdmlkZWQpXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgdXNlclBvb2xEb21haW4/OiBjb2duaXRvLlVzZXJQb29sRG9tYWluO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBNdWx0aVRlbmFudEF1dGhQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICBjb25zdCB7XG4gICAgICBhcHBOYW1lLFxuICAgICAgY2FsbGJhY2tVcmxzLFxuICAgICAgbG9nb3V0VXJscyA9IGNhbGxiYWNrVXJscyxcbiAgICAgIGN1c3RvbUF0dHJpYnV0ZXMgPSBbXSxcbiAgICAgIG1mYVJlcXVpcmVkID0gZmFsc2UsXG4gICAgICBwYXNzd29yZFBvbGljeSxcbiAgICAgIGRvbWFpblByZWZpeCxcbiAgICB9ID0gcHJvcHM7XG5cbiAgICAvLyBDcmVhdGUgRHluYW1vREIgdGFibGUgZm9yIHRlbmFudHNcbiAgICB0aGlzLnRlbmFudHNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCAnVGVuYW50c1RhYmxlJywge1xuICAgICAgdGFibGVOYW1lOiBgJHthcHBOYW1lfS10ZW5hbnRzYCxcbiAgICAgIHBhcnRpdGlvbktleToge1xuICAgICAgICBuYW1lOiAndGVuYW50X2lkJyxcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXG4gICAgICB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIGVuY3J5cHRpb246IGR5bmFtb2RiLlRhYmxlRW5jcnlwdGlvbi5BV1NfTUFOQUdFRCxcbiAgICAgIHBvaW50SW5UaW1lUmVjb3ZlcnlTcGVjaWZpY2F0aW9uOiB7XG4gICAgICAgIHBvaW50SW5UaW1lUmVjb3ZlcnlFbmFibGVkOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTixcbiAgICAgIHN0cmVhbTogZHluYW1vZGIuU3RyZWFtVmlld1R5cGUuTkVXX0FORF9PTERfSU1BR0VTLFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIEdTSSBmb3IgU3RyaXBlIGN1c3RvbWVyIGxvb2t1cHNcbiAgICB0aGlzLnRlbmFudHNUYWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XG4gICAgICBpbmRleE5hbWU6ICdzdHJpcGUtY3VzdG9tZXItaW5kZXgnLFxuICAgICAgcGFydGl0aW9uS2V5OiB7XG4gICAgICAgIG5hbWU6ICdzdHJpcGVfY3VzdG9tZXJfaWQnLFxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcbiAgICAgIH0sXG4gICAgICBwcm9qZWN0aW9uVHlwZTogZHluYW1vZGIuUHJvamVjdGlvblR5cGUuQUxMLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHBvc3QtY29uZmlybWF0aW9uIExhbWJkYSB0cmlnZ2VyXG4gICAgdGhpcy5wb3N0Q29uZmlybWF0aW9uVHJpZ2dlciA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1Bvc3RDb25maXJtYXRpb25UcmlnZ2VyJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgJHthcHBOYW1lfS1wb3N0LWNvbmZpcm1hdGlvbmAsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMSxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21JbmxpbmUoYFxuaW1wb3J0IGpzb25cbmltcG9ydCBib3RvM1xuaW1wb3J0IHV1aWRcbmltcG9ydCBsb2dnaW5nXG5mcm9tIGRhdGV0aW1lIGltcG9ydCBkYXRldGltZVxuXG5sb2dnZXIgPSBsb2dnaW5nLmdldExvZ2dlcigpXG5sb2dnZXIuc2V0TGV2ZWwobG9nZ2luZy5JTkZPKVxuXG5keW5hbW9kYiA9IGJvdG8zLnJlc291cmNlKCdkeW5hbW9kYicpXG50YWJsZSA9IGR5bmFtb2RiLlRhYmxlKCcke3RoaXMudGVuYW50c1RhYmxlLnRhYmxlTmFtZX0nKVxuXG5kZWYgaGFuZGxlcihldmVudCwgY29udGV4dCk6XG4gICAgbG9nZ2VyLmluZm8oZlwiUG9zdCBjb25maXJtYXRpb24gdHJpZ2dlciBldmVudDoge2pzb24uZHVtcHMoZXZlbnQpfVwiKVxuXG4gICAgdHJ5OlxuICAgICAgICB1c2VyX2F0dHJpYnV0ZXMgPSBldmVudFsncmVxdWVzdCddWyd1c2VyQXR0cmlidXRlcyddXG5cbiAgICAgICAgIyBFeHRyYWN0IHVzZXIgaW5mb3JtYXRpb25cbiAgICAgICAgdXNlcl9pZCA9IGV2ZW50Wyd1c2VyTmFtZSddXG4gICAgICAgIGVtYWlsID0gdXNlcl9hdHRyaWJ1dGVzLmdldCgnZW1haWwnLCAnJylcbiAgICAgICAgdGVuYW50X2lkID0gdXNlcl9hdHRyaWJ1dGVzLmdldCgnY3VzdG9tOnRlbmFudF9pZCcsIHN0cih1dWlkLnV1aWQ0KCkpKVxuICAgICAgICB0aWVyID0gdXNlcl9hdHRyaWJ1dGVzLmdldCgnY3VzdG9tOnRpZXInLCAnZnJlZScpXG4gICAgICAgIHBsYW4gPSB1c2VyX2F0dHJpYnV0ZXMuZ2V0KCdjdXN0b206cGxhbicsICdzdGFydGVyJylcbiAgICAgICAgcGhvbmVfbnVtYmVyID0gdXNlcl9hdHRyaWJ1dGVzLmdldCgncGhvbmVfbnVtYmVyJywgJycpXG5cbiAgICAgICAgIyBDcmVhdGUgdGVuYW50IHJlY29yZFxuICAgICAgICB0ZW5hbnRfcmVjb3JkID0ge1xuICAgICAgICAgICAgJ3RlbmFudF9pZCc6IHRlbmFudF9pZCxcbiAgICAgICAgICAgICd1c2VyX2lkJzogdXNlcl9pZCxcbiAgICAgICAgICAgICdlbWFpbCc6IGVtYWlsLFxuICAgICAgICAgICAgJ3RpZXInOiB0aWVyLFxuICAgICAgICAgICAgJ3BsYW4nOiBwbGFuLFxuICAgICAgICAgICAgJ2NyZWF0ZWRfYXQnOiBkYXRldGltZS51dGNub3coKS5pc29mb3JtYXQoKSxcbiAgICAgICAgICAgICdwaG9uZV9udW1iZXInOiBwaG9uZV9udW1iZXIsXG4gICAgICAgICAgICAnc3RyaXBlX2N1c3RvbWVyX2lkJzogTm9uZSxcbiAgICAgICAgICAgICdrbm93bGVkZ2VfYmFzZV9zM19wYXRoJzogZlwidGVuYW50cy97dGVuYW50X2lkfS9rbm93bGVkZ2UtYmFzZS9cIixcbiAgICAgICAgICAgICdzdGF0dXMnOiAnYWN0aXZlJ1xuICAgICAgICB9XG5cbiAgICAgICAgIyBBZGQgY3VzdG9tIGF0dHJpYnV0ZXNcbiAgICAgICAgZm9yIGF0dHJfbmFtZSwgYXR0cl92YWx1ZSBpbiB1c2VyX2F0dHJpYnV0ZXMuaXRlbXMoKTpcbiAgICAgICAgICAgIGlmIGF0dHJfbmFtZS5zdGFydHN3aXRoKCdjdXN0b206JykgYW5kIGF0dHJfbmFtZSBub3QgaW4gW1xuICAgICAgICAgICAgICAgICdjdXN0b206dGVuYW50X2lkJywgJ2N1c3RvbTp0aWVyJywgJ2N1c3RvbTpwbGFuJ1xuICAgICAgICAgICAgXTpcbiAgICAgICAgICAgICAgICBjbGVhbl9uYW1lID0gYXR0cl9uYW1lLnJlcGxhY2UoJ2N1c3RvbTonLCAnJylcbiAgICAgICAgICAgICAgICB0ZW5hbnRfcmVjb3JkW2NsZWFuX25hbWVdID0gYXR0cl92YWx1ZVxuXG4gICAgICAgICMgU2F2ZSB0byBEeW5hbW9EQlxuICAgICAgICB0YWJsZS5wdXRfaXRlbShJdGVtPXRlbmFudF9yZWNvcmQpXG5cbiAgICAgICAgbG9nZ2VyLmluZm8oZlwiQ3JlYXRlZCB0ZW5hbnQgcmVjb3JkIGZvciB7dGVuYW50X2lkfVwiKVxuICAgICAgICByZXR1cm4gZXZlbnRcblxuICAgIGV4Y2VwdCBFeGNlcHRpb24gYXMgZTpcbiAgICAgICAgbG9nZ2VyLmVycm9yKGZcIkVycm9yIHByb2Nlc3NpbmcgcG9zdC1jb25maXJtYXRpb246IHtzdHIoZSl9XCIpXG4gICAgICAgIHJhaXNlIGVcbmApLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgVEVOQU5UU19UQUJMRV9OQU1FOiB0aGlzLnRlbmFudHNUYWJsZS50YWJsZU5hbWUsXG4gICAgICB9LFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMSksXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBEeW5hbW9EQiBwZXJtaXNzaW9ucyB0byB0aGUgdHJpZ2dlclxuICAgIHRoaXMudGVuYW50c1RhYmxlLmdyYW50V3JpdGVEYXRhKHRoaXMucG9zdENvbmZpcm1hdGlvblRyaWdnZXIpO1xuXG4gICAgLy8gQnVpbGQgdXNlciBwb29sIGF0dHJpYnV0ZXNcbiAgICBjb25zdCB1c2VyUG9vbEF0dHJpYnV0ZXM6IHsgW2tleTogc3RyaW5nXTogY29nbml0by5JQ3VzdG9tQXR0cmlidXRlIH0gPSB7fTtcblxuICAgIC8vIEFsd2F5cyBhZGQgc3RhbmRhcmQgdGVuYW50IGF0dHJpYnV0ZXNcbiAgICB1c2VyUG9vbEF0dHJpYnV0ZXMudGVuYW50X2lkID0gbmV3IGNvZ25pdG8uU3RyaW5nQXR0cmlidXRlKHsgbXV0YWJsZTogdHJ1ZSB9KTtcbiAgICB1c2VyUG9vbEF0dHJpYnV0ZXMudGllciA9IG5ldyBjb2duaXRvLlN0cmluZ0F0dHJpYnV0ZSh7IG11dGFibGU6IHRydWUgfSk7XG4gICAgdXNlclBvb2xBdHRyaWJ1dGVzLnBsYW4gPSBuZXcgY29nbml0by5TdHJpbmdBdHRyaWJ1dGUoeyBtdXRhYmxlOiB0cnVlIH0pO1xuXG4gICAgLy8gQWRkIGN1c3RvbSBhdHRyaWJ1dGVzXG4gICAgY3VzdG9tQXR0cmlidXRlcy5mb3JFYWNoKGF0dHIgPT4ge1xuICAgICAgdXNlclBvb2xBdHRyaWJ1dGVzW2F0dHJdID0gbmV3IGNvZ25pdG8uU3RyaW5nQXR0cmlidXRlKHsgbXV0YWJsZTogdHJ1ZSB9KTtcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBDb2duaXRvIFVzZXIgUG9vbFxuICAgIHRoaXMudXNlclBvb2wgPSBuZXcgY29nbml0by5Vc2VyUG9vbCh0aGlzLCAnVXNlclBvb2wnLCB7XG4gICAgICB1c2VyUG9vbE5hbWU6IGAke2FwcE5hbWV9LXVzZXJzYCxcbiAgICAgIHNlbGZTaWduVXBFbmFibGVkOiB0cnVlLFxuICAgICAgc2lnbkluQWxpYXNlczoge1xuICAgICAgICBlbWFpbDogdHJ1ZSxcbiAgICAgICAgdXNlcm5hbWU6IGZhbHNlLFxuICAgICAgfSxcbiAgICAgIHNpZ25JbkNhc2VTZW5zaXRpdmU6IGZhbHNlLFxuICAgICAgc3RhbmRhcmRBdHRyaWJ1dGVzOiB7XG4gICAgICAgIGVtYWlsOiB7XG4gICAgICAgICAgcmVxdWlyZWQ6IHRydWUsXG4gICAgICAgICAgbXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgcGhvbmVOdW1iZXI6IHtcbiAgICAgICAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgICAgICAgbXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgZ2l2ZW5OYW1lOiB7XG4gICAgICAgICAgcmVxdWlyZWQ6IGZhbHNlLFxuICAgICAgICAgIG11dGFibGU6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIGZhbWlseU5hbWU6IHtcbiAgICAgICAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgICAgICAgbXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBjdXN0b21BdHRyaWJ1dGVzOiB1c2VyUG9vbEF0dHJpYnV0ZXMsXG4gICAgICBwYXNzd29yZFBvbGljeTogcGFzc3dvcmRQb2xpY3kgfHwge1xuICAgICAgICBtaW5MZW5ndGg6IDgsXG4gICAgICAgIHJlcXVpcmVMb3dlcmNhc2U6IHRydWUsXG4gICAgICAgIHJlcXVpcmVVcHBlcmNhc2U6IHRydWUsXG4gICAgICAgIHJlcXVpcmVEaWdpdHM6IHRydWUsXG4gICAgICAgIHJlcXVpcmVTeW1ib2xzOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIG1mYTogbWZhUmVxdWlyZWQgPyBjb2duaXRvLk1mYS5SRVFVSVJFRCA6IGNvZ25pdG8uTWZhLk9GRixcbiAgICAgIG1mYVNlY29uZEZhY3Rvcjoge1xuICAgICAgICBzbXM6IHRydWUsXG4gICAgICAgIG90cDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBhY2NvdW50UmVjb3Zlcnk6IGNvZ25pdG8uQWNjb3VudFJlY292ZXJ5LkVNQUlMX09OTFksXG4gICAgICBsYW1iZGFUcmlnZ2Vyczoge1xuICAgICAgICBwb3N0Q29uZmlybWF0aW9uOiB0aGlzLnBvc3RDb25maXJtYXRpb25UcmlnZ2VyLFxuICAgICAgfSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTixcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBVc2VyIFBvb2wgQ2xpZW50XG4gICAgdGhpcy51c2VyUG9vbENsaWVudCA9IG5ldyBjb2duaXRvLlVzZXJQb29sQ2xpZW50KHRoaXMsICdVc2VyUG9vbENsaWVudCcsIHtcbiAgICAgIHVzZXJQb29sOiB0aGlzLnVzZXJQb29sLFxuICAgICAgdXNlclBvb2xDbGllbnROYW1lOiBgJHthcHBOYW1lfS1jbGllbnRgLFxuICAgICAgZ2VuZXJhdGVTZWNyZXQ6IGZhbHNlLFxuICAgICAgYXV0aEZsb3dzOiB7XG4gICAgICAgIHVzZXJQYXNzd29yZDogdHJ1ZSxcbiAgICAgICAgdXNlclNycDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBvQXV0aDoge1xuICAgICAgICBmbG93czoge1xuICAgICAgICAgIGF1dGhvcml6YXRpb25Db2RlR3JhbnQ6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIHNjb3BlczogW1xuICAgICAgICAgIGNvZ25pdG8uT0F1dGhTY29wZS5PUEVOSUQsXG4gICAgICAgICAgY29nbml0by5PQXV0aFNjb3BlLkVNQUlMLFxuICAgICAgICAgIGNvZ25pdG8uT0F1dGhTY29wZS5QUk9GSUxFLFxuICAgICAgICBdLFxuICAgICAgICBjYWxsYmFja1VybHM6IGNhbGxiYWNrVXJscyxcbiAgICAgICAgbG9nb3V0VXJsczogbG9nb3V0VXJscyxcbiAgICAgIH0sXG4gICAgICBwcmV2ZW50VXNlckV4aXN0ZW5jZUVycm9yczogdHJ1ZSxcbiAgICAgIHJlZnJlc2hUb2tlblZhbGlkaXR5OiBjZGsuRHVyYXRpb24uZGF5cygzMCksXG4gICAgICBhY2Nlc3NUb2tlblZhbGlkaXR5OiBjZGsuRHVyYXRpb24ubWludXRlcyg2MCksXG4gICAgICBpZFRva2VuVmFsaWRpdHk6IGNkay5EdXJhdGlvbi5taW51dGVzKDYwKSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBkb21haW4gaWYgcHJlZml4IHByb3ZpZGVkXG4gICAgaWYgKGRvbWFpblByZWZpeCkge1xuICAgICAgdGhpcy51c2VyUG9vbERvbWFpbiA9IG5ldyBjb2duaXRvLlVzZXJQb29sRG9tYWluKHRoaXMsICdVc2VyUG9vbERvbWFpbicsIHtcbiAgICAgICAgdXNlclBvb2w6IHRoaXMudXNlclBvb2wsXG4gICAgICAgIGNvZ25pdG9Eb21haW46IHtcbiAgICAgICAgICBkb21haW5QcmVmaXg6IGRvbWFpblByZWZpeCxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIENyZWF0ZSBBUEkgR2F0ZXdheSBhdXRob3JpemVyXG4gICAgdGhpcy5hdXRob3JpemVyID0gbmV3IGFwaWdhdGV3YXkuQ29nbml0b1VzZXJQb29sc0F1dGhvcml6ZXIodGhpcywgJ0F1dGhvcml6ZXInLCB7XG4gICAgICBjb2duaXRvVXNlclBvb2xzOiBbdGhpcy51c2VyUG9vbF0sXG4gICAgICBhdXRob3JpemVyTmFtZTogYCR7YXBwTmFtZX0tYXV0aG9yaXplcmAsXG4gICAgICBpZGVudGl0eVNvdXJjZTogJ21ldGhvZC5yZXF1ZXN0LmhlYWRlci5BdXRob3JpemF0aW9uJyxcbiAgICB9KTtcblxuICAgIC8vIEFwcGx5IGNvbnNpc3RlbnQgdGFnZ2luZ1xuICAgIGNkay5UYWdzLm9mKHRoaXMpLmFkZCgnUHJvamVjdCcsIGFwcE5hbWUpO1xuICAgIGNkay5UYWdzLm9mKHRoaXMpLmFkZCgnTWFuYWdlZEJ5JywgJ2Nkay1haS1jb25zdHJ1Y3RzJyk7XG4gICAgY2RrLlRhZ3Mub2YodGhpcykuYWRkKCdPd25lcicsICdqb2huYXRoYW4taG9ybmVyJyk7XG4gICAgY2RrLlRhZ3Mub2YodGhpcykuYWRkKCdDb21wb25lbnQnLCAnTXVsdGlUZW5hbnRBdXRoJyk7XG5cbiAgICAvLyBPdXRwdXQgaW1wb3J0YW50IHZhbHVlc1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVc2VyUG9vbElkJywge1xuICAgICAgdmFsdWU6IHRoaXMudXNlclBvb2wudXNlclBvb2xJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgSUQnLFxuICAgICAgZXhwb3J0TmFtZTogYCR7Y2RrLlN0YWNrLm9mKHRoaXMpLnN0YWNrTmFtZX0tJHtpZH0tVXNlclBvb2xJZGAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXNlclBvb2xDbGllbnRJZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnVzZXJQb29sQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gVXNlciBQb29sIENsaWVudCBJRCcsXG4gICAgICBleHBvcnROYW1lOiBgJHtjZGsuU3RhY2sub2YodGhpcykuc3RhY2tOYW1lfS0ke2lkfS1Vc2VyUG9vbENsaWVudElkYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdUZW5hbnRzVGFibGVOYW1lJywge1xuICAgICAgdmFsdWU6IHRoaXMudGVuYW50c1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRHluYW1vREIgVGVuYW50cyBUYWJsZSBOYW1lJyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke2Nkay5TdGFjay5vZih0aGlzKS5zdGFja05hbWV9LSR7aWR9LVRlbmFudHNUYWJsZU5hbWVgLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1RlbmFudHNUYWJsZUFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnRlbmFudHNUYWJsZS50YWJsZUFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnRHluYW1vREIgVGVuYW50cyBUYWJsZSBBUk4nLFxuICAgICAgZXhwb3J0TmFtZTogYCR7Y2RrLlN0YWNrLm9mKHRoaXMpLnN0YWNrTmFtZX0tJHtpZH0tVGVuYW50c1RhYmxlQXJuYCxcbiAgICB9KTtcblxuICAgIGlmICh0aGlzLnVzZXJQb29sRG9tYWluKSB7XG4gICAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXNlclBvb2xEb21haW5VcmwnLCB7XG4gICAgICAgIHZhbHVlOiBgaHR0cHM6Ly8ke3RoaXMudXNlclBvb2xEb21haW4uZG9tYWluTmFtZX0uYXV0aC4ke2Nkay5TdGFjay5vZih0aGlzKS5yZWdpb259LmFtYXpvbmNvZ25pdG8uY29tYCxcbiAgICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIFVzZXIgUG9vbCBEb21haW4gVVJMJyxcbiAgICAgICAgZXhwb3J0TmFtZTogYCR7Y2RrLlN0YWNrLm9mKHRoaXMpLnN0YWNrTmFtZX0tJHtpZH0tVXNlclBvb2xEb21haW5VcmxgLFxuICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEdyYW50IHJlYWQgYWNjZXNzIHRvIHRoZSB0ZW5hbnRzIHRhYmxlXG4gICAqIEBwYXJhbSBncmFudGVlIFRoZSBJQU0gcHJpbmNpcGFsIHRvIGdyYW50IGFjY2VzcyB0b1xuICAgKi9cbiAgcHVibGljIGdyYW50VGVuYW50c1RhYmxlUmVhZChncmFudGVlOiBpYW0uSUdyYW50YWJsZSk6IGlhbS5HcmFudCB7XG4gICAgcmV0dXJuIHRoaXMudGVuYW50c1RhYmxlLmdyYW50UmVhZERhdGEoZ3JhbnRlZSk7XG4gIH1cblxuICAvKipcbiAgICogR3JhbnQgd3JpdGUgYWNjZXNzIHRvIHRoZSB0ZW5hbnRzIHRhYmxlXG4gICAqIEBwYXJhbSBncmFudGVlIFRoZSBJQU0gcHJpbmNpcGFsIHRvIGdyYW50IGFjY2VzcyB0b1xuICAgKi9cbiAgcHVibGljIGdyYW50VGVuYW50c1RhYmxlV3JpdGUoZ3JhbnRlZTogaWFtLklHcmFudGFibGUpOiBpYW0uR3JhbnQge1xuICAgIHJldHVybiB0aGlzLnRlbmFudHNUYWJsZS5ncmFudFdyaXRlRGF0YShncmFudGVlKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHcmFudCByZWFkIGFuZCB3cml0ZSBhY2Nlc3MgdG8gdGhlIHRlbmFudHMgdGFibGVcbiAgICogQHBhcmFtIGdyYW50ZWUgVGhlIElBTSBwcmluY2lwYWwgdG8gZ3JhbnQgYWNjZXNzIHRvXG4gICAqL1xuICBwdWJsaWMgZ3JhbnRUZW5hbnRzVGFibGVSZWFkV3JpdGUoZ3JhbnRlZTogaWFtLklHcmFudGFibGUpOiBpYW0uR3JhbnQge1xuICAgIHJldHVybiB0aGlzLnRlbmFudHNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoZ3JhbnRlZSk7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIGEgcHJlLXRva2VuIGdlbmVyYXRpb24gdHJpZ2dlciB0byBhZGQgY3VzdG9tIGNsYWltc1xuICAgKiBAcGFyYW0gbGFtYmRhIFRoZSBMYW1iZGEgZnVuY3Rpb24gdG8gdXNlIGFzIHRyaWdnZXJcbiAgICovXG4gIHB1YmxpYyBhZGRQcmVUb2tlbkdlbmVyYXRpb25UcmlnZ2VyKGxhbWJkYTogbGFtYmRhLkZ1bmN0aW9uKTogdm9pZCB7XG4gICAgdGhpcy51c2VyUG9vbC5hZGRUcmlnZ2VyKGNvZ25pdG8uVXNlclBvb2xPcGVyYXRpb24uUFJFX1RPS0VOX0dFTkVSQVRJT04sIGxhbWJkYSk7XG4gIH1cblxuICAvKipcbiAgICogR2V0IHRoZSBob3N0ZWQgVUkgc2lnbi1pbiBVUkxcbiAgICogQHBhcmFtIHJlZGlyZWN0VXJpIFRoZSByZWRpcmVjdCBVUkkgYWZ0ZXIgc2lnbi1pblxuICAgKiBAcmV0dXJucyBUaGUgc2lnbi1pbiBVUkxcbiAgICovXG4gIHB1YmxpYyBnZXRTaWduSW5VcmwocmVkaXJlY3RVcmk6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgaWYgKCF0aGlzLnVzZXJQb29sRG9tYWluKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1VzZXIgUG9vbCBEb21haW4gbXVzdCBiZSBjb25maWd1cmVkIHRvIGdlbmVyYXRlIHNpZ24taW4gVVJMJyk7XG4gICAgfVxuXG4gICAgY29uc3QgZG9tYWluID0gYCR7dGhpcy51c2VyUG9vbERvbWFpbi5kb21haW5OYW1lfS5hdXRoLiR7Y2RrLlN0YWNrLm9mKHRoaXMpLnJlZ2lvbn0uYW1hem9uY29nbml0by5jb21gO1xuICAgIHJldHVybiBgaHR0cHM6Ly8ke2RvbWFpbn0vbG9naW4/Y2xpZW50X2lkPSR7dGhpcy51c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkfSZyZXNwb25zZV90eXBlPWNvZGUmc2NvcGU9b3BlbmlkK2VtYWlsK3Byb2ZpbGUmcmVkaXJlY3RfdXJpPSR7ZW5jb2RlVVJJQ29tcG9uZW50KHJlZGlyZWN0VXJpKX1gO1xuICB9XG59Il19