import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
/**
 * Stripe pricing tier configuration
 */
export interface StripeTier {
    /**
     * Display name for the tier
     */
    readonly name: string;
    /**
     * Stripe price ID
     */
    readonly priceId: string;
    /**
     * Amount in cents (for display purposes)
     */
    readonly amount: number;
    /**
     * Currency code
     * @default "usd"
     */
    readonly currency?: string;
    /**
     * Billing interval
     * @default "month"
     */
    readonly interval?: string;
}
/**
 * Properties for StripeBilling construct
 */
export interface StripeBillingProps {
    /**
     * Application name for consistent naming and tagging
     */
    readonly appName: string;
    /**
     * Array of pricing tiers with Stripe price IDs
     */
    readonly tiers: StripeTier[];
    /**
     * SSM parameter name containing the Stripe webhook secret
     * The parameter should be of type SecureString
     * @example "/myapp/stripe/webhook-secret"
     */
    readonly webhookSecret: string;
    /**
     * Success URL after successful payment
     */
    readonly successUrl: string;
    /**
     * Cancel URL when payment is cancelled
     */
    readonly cancelUrl: string;
    /**
     * Lambda function to invoke when payment is successful
     * This function will receive the Stripe webhook event
     */
    readonly onPaymentSuccess: lambda.Function;
    /**
     * DynamoDB table containing tenant information
     * Must have partition key 'tenant_id' and GSI 'stripe-customer-index' on 'stripe_customer_id'
     */
    readonly tenantsTable: dynamodb.Table;
    /**
     * Domain name for API Gateway custom domain
     * If provided, creates HTTPS endpoints
     * @default undefined - uses default API Gateway domain
     */
    readonly domainName?: string;
    /**
     * Stripe publishable key (stored as environment variable)
     * @default undefined
     */
    readonly stripePublishableKey?: string;
}
/**
 * A comprehensive Stripe billing integration construct with checkout sessions,
 * webhook handling, and tenant subscription management.
 *
 * Features:
 * - Lambda function for creating Stripe checkout sessions
 * - Webhook handler for processing Stripe events
 * - API Gateway endpoints for billing operations
 * - SSM Parameter Store integration for secure webhook secrets
 * - DynamoDB integration for tenant subscription management
 * - Customer portal session creation
 * - Automatic tier updates on successful payments
 *
 * API Endpoints:
 * - POST /billing/checkout - Create checkout session
 * - POST /billing/webhook - Process Stripe webhooks
 * - GET /billing/portal - Create customer portal session
 *
 * @example
 * ```typescript
 * const paymentHandler = new lambda.Function(this, 'PaymentHandler', {
 *   runtime: lambda.Runtime.PYTHON_3_11,
 *   handler: 'index.handler',
 *   code: lambda.Code.fromAsset('lambda'),
 * });
 *
 * new StripeBilling(this, 'Billing', {
 *   appName: 'MyApp',
 *   tiers: [
 *     { name: 'Starter', priceId: 'price_1234', amount: 999 },
 *     { name: 'Growth', priceId: 'price_5678', amount: 2999 },
 *     { name: 'Pro', priceId: 'price_9012', amount: 9999 }
 *   ],
 *   webhookSecret: '/myapp/stripe/webhook-secret',
 *   successUrl: 'https://myapp.com/success',
 *   cancelUrl: 'https://myapp.com/cancel',
 *   onPaymentSuccess: paymentHandler,
 *   tenantsTable: auth.tenantsTable
 * });
 * ```
 */
export declare class StripeBilling extends Construct {
    /**
     * Lambda function for creating checkout sessions
     */
    readonly checkoutFunction: lambda.Function;
    /**
     * Lambda function for handling Stripe webhooks
     */
    readonly webhookFunction: lambda.Function;
    /**
     * Lambda function for creating customer portal sessions
     */
    readonly portalFunction: lambda.Function;
    /**
     * API Gateway for billing endpoints
     */
    readonly api: apigateway.RestApi;
    /**
     * SSM parameter for webhook secret
     */
    readonly webhookSecretParameter: ssm.IStringParameter;
    constructor(scope: Construct, id: string, props: StripeBillingProps);
    /**
     * Grant permission to invoke checkout function
     * @param grantee The IAM principal to grant permissions to
     */
    grantCreateCheckout(grantee: iam.IGrantable): iam.Grant;
    /**
     * Grant permission to invoke portal function
     * @param grantee The IAM principal to grant permissions to
     */
    grantCreatePortalSession(grantee: iam.IGrantable): iam.Grant;
}
