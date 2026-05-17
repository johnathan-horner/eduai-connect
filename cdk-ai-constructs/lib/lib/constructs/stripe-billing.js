"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StripeBilling = void 0;
const lambda = require("aws-cdk-lib/aws-lambda");
const apigateway = require("aws-cdk-lib/aws-apigateway");
const ssm = require("aws-cdk-lib/aws-ssm");
const cdk = require("aws-cdk-lib");
const constructs_1 = require("constructs");
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
class StripeBilling extends constructs_1.Construct {
    /**
     * Lambda function for creating checkout sessions
     */
    checkoutFunction;
    /**
     * Lambda function for handling Stripe webhooks
     */
    webhookFunction;
    /**
     * Lambda function for creating customer portal sessions
     */
    portalFunction;
    /**
     * API Gateway for billing endpoints
     */
    api;
    /**
     * SSM parameter for webhook secret
     */
    webhookSecretParameter;
    constructor(scope, id, props) {
        super(scope, id);
        const { appName, tiers, webhookSecret, successUrl, cancelUrl, onPaymentSuccess, tenantsTable, domainName, stripePublishableKey, } = props;
        // Create or reference SSM parameter for webhook secret
        this.webhookSecretParameter = ssm.StringParameter.fromStringParameterName(this, 'WebhookSecret', webhookSecret);
        // Create checkout session Lambda
        this.checkoutFunction = new lambda.Function(this, 'CheckoutFunction', {
            functionName: `${appName}-stripe-checkout`,
            runtime: lambda.Runtime.PYTHON_3_11,
            handler: 'index.handler',
            timeout: cdk.Duration.minutes(1),
            environment: {
                TENANTS_TABLE_NAME: tenantsTable.tableName,
                SUCCESS_URL: successUrl,
                CANCEL_URL: cancelUrl,
                STRIPE_PUBLISHABLE_KEY: stripePublishableKey || '',
                TIERS_CONFIG: JSON.stringify(tiers),
            },
            code: lambda.Code.fromInline(`
import json
import boto3
import os
import stripe
import logging
from datetime import datetime

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['TENANTS_TABLE_NAME'])

# Initialize Stripe with secret key from environment
stripe.api_key = os.environ.get('STRIPE_SECRET_KEY')

def handler(event, context):
    try:
        body = json.loads(event['body']) if event.get('body') else {}
        tenant_id = body.get('tenant_id')
        price_id = body.get('price_id')

        if not tenant_id or not price_id:
            return {
                'statusCode': 400,
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps({'error': 'tenant_id and price_id required'})
            }

        # Get tenant information
        response = table.get_item(Key={'tenant_id': tenant_id})
        if 'Item' not in response:
            return {
                'statusCode': 404,
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps({'error': 'Tenant not found'})
            }

        tenant = response['Item']
        customer_id = tenant.get('stripe_customer_id')

        # Create or retrieve Stripe customer
        if not customer_id:
            customer = stripe.Customer.create(
                email=tenant.get('email', ''),
                metadata={'tenant_id': tenant_id}
            )
            customer_id = customer.id

            # Update tenant record with customer ID
            table.update_item(
                Key={'tenant_id': tenant_id},
                UpdateExpression='SET stripe_customer_id = :cid',
                ExpressionAttributeValues={':cid': customer_id}
            )

        # Create checkout session
        session = stripe.checkout.Session.create(
            customer=customer_id,
            payment_method_types=['card'],
            line_items=[{
                'price': price_id,
                'quantity': 1,
            }],
            mode='subscription',
            success_url=os.environ['SUCCESS_URL'],
            cancel_url=os.environ['CANCEL_URL'],
            metadata={
                'tenant_id': tenant_id,
                'price_id': price_id
            }
        )

        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            'body': json.dumps({
                'checkout_url': session.url,
                'session_id': session.id
            })
        }

    except Exception as e:
        logger.error(f"Checkout error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'error': 'Internal server error'})
        }
`),
        });
        // Create webhook handler Lambda
        this.webhookFunction = new lambda.Function(this, 'WebhookFunction', {
            functionName: `${appName}-stripe-webhook`,
            runtime: lambda.Runtime.PYTHON_3_11,
            handler: 'index.handler',
            timeout: cdk.Duration.minutes(5),
            environment: {
                TENANTS_TABLE_NAME: tenantsTable.tableName,
                WEBHOOK_SECRET_PARAM: webhookSecret,
                PAYMENT_SUCCESS_FUNCTION: onPaymentSuccess.functionName,
                TIERS_CONFIG: JSON.stringify(tiers),
            },
            code: lambda.Code.fromInline(`
import json
import boto3
import os
import stripe
import logging
from datetime import datetime

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['TENANTS_TABLE_NAME'])
ssm = boto3.client('ssm')
lambda_client = boto3.client('lambda')

def handler(event, context):
    try:
        # Get webhook secret from SSM
        webhook_secret = ssm.get_parameter(
            Name=os.environ['WEBHOOK_SECRET_PARAM'],
            WithDecryption=True
        )['Parameter']['Value']

        # Verify webhook signature
        payload = event['body']
        sig_header = event['headers'].get('stripe-signature')

        try:
            webhook_event = stripe.Webhook.construct_event(
                payload, sig_header, webhook_secret
            )
        except ValueError:
            logger.error("Invalid payload")
            return {'statusCode': 400}
        except stripe.error.SignatureVerificationError:
            logger.error("Invalid signature")
            return {'statusCode': 400}

        # Handle the event
        if webhook_event['type'] == 'checkout.session.completed':
            session = webhook_event['data']['object']
            tenant_id = session['metadata']['tenant_id']
            customer_id = session['customer']
            subscription_id = session['subscription']

            # Get subscription details
            subscription = stripe.Subscription.retrieve(subscription_id)
            price_id = subscription['items']['data'][0]['price']['id']

            # Find tier name from price_id
            tiers = json.loads(os.environ['TIERS_CONFIG'])
            tier_name = next((tier['name'] for tier in tiers if tier['priceId'] == price_id), 'unknown')

            # Update tenant record
            table.update_item(
                Key={'tenant_id': tenant_id},
                UpdateExpression='SET stripe_customer_id = :cid, tier = :tier, stripe_subscription_id = :sid, updated_at = :updated',
                ExpressionAttributeValues={
                    ':cid': customer_id,
                    ':tier': tier_name.lower(),
                    ':sid': subscription_id,
                    ':updated': datetime.utcnow().isoformat()
                }
            )

            # Invoke payment success function
            lambda_client.invoke(
                FunctionName=os.environ['PAYMENT_SUCCESS_FUNCTION'],
                InvocationType='Event',
                Payload=json.dumps({
                    'tenant_id': tenant_id,
                    'tier': tier_name.lower(),
                    'stripe_event': webhook_event
                })
            )

            logger.info(f"Updated tenant {tenant_id} to tier {tier_name}")

        elif webhook_event['type'] == 'customer.subscription.deleted':
            subscription = webhook_event['data']['object']
            customer_id = subscription['customer']

            # Find tenant by customer_id using GSI
            response = table.query(
                IndexName='stripe-customer-index',
                KeyConditionExpression='stripe_customer_id = :cid',
                ExpressionAttributeValues={':cid': customer_id}
            )

            if response['Items']:
                tenant = response['Items'][0]
                tenant_id = tenant['tenant_id']

                # Downgrade to free tier
                table.update_item(
                    Key={'tenant_id': tenant_id},
                    UpdateExpression='SET tier = :tier, stripe_subscription_id = :sid, updated_at = :updated',
                    ExpressionAttributeValues={
                        ':tier': 'free',
                        ':sid': None,
                        ':updated': datetime.utcnow().isoformat()
                    }
                )

                logger.info(f"Downgraded tenant {tenant_id} to free tier")

        return {'statusCode': 200}

    except Exception as e:
        logger.error(f"Webhook error: {str(e)}")
        return {'statusCode': 500}
`),
        });
        // Create customer portal Lambda
        this.portalFunction = new lambda.Function(this, 'PortalFunction', {
            functionName: `${appName}-stripe-portal`,
            runtime: lambda.Runtime.PYTHON_3_11,
            handler: 'index.handler',
            timeout: cdk.Duration.minutes(1),
            environment: {
                TENANTS_TABLE_NAME: tenantsTable.tableName,
            },
            code: lambda.Code.fromInline(`
import json
import boto3
import os
import stripe
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['TENANTS_TABLE_NAME'])

def handler(event, context):
    try:
        body = json.loads(event['body']) if event.get('body') else {}
        tenant_id = body.get('tenant_id')
        return_url = body.get('return_url', 'https://example.com')

        if not tenant_id:
            return {
                'statusCode': 400,
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps({'error': 'tenant_id required'})
            }

        # Get tenant information
        response = table.get_item(Key={'tenant_id': tenant_id})
        if 'Item' not in response:
            return {
                'statusCode': 404,
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps({'error': 'Tenant not found'})
            }

        tenant = response['Item']
        customer_id = tenant.get('stripe_customer_id')

        if not customer_id:
            return {
                'statusCode': 400,
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps({'error': 'No Stripe customer found for tenant'})
            }

        # Create portal session
        session = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=return_url,
        )

        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            'body': json.dumps({
                'portal_url': session.url
            })
        }

    except Exception as e:
        logger.error(f"Portal error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'error': 'Internal server error'})
        }
`),
        });
        // Grant DynamoDB permissions
        tenantsTable.grantReadWriteData(this.checkoutFunction);
        tenantsTable.grantReadWriteData(this.webhookFunction);
        tenantsTable.grantReadData(this.portalFunction);
        // Grant SSM permissions to webhook function
        this.webhookSecretParameter.grantRead(this.webhookFunction);
        // Grant permission to invoke the payment success function
        onPaymentSuccess.grantInvoke(this.webhookFunction);
        // Create API Gateway
        this.api = new apigateway.RestApi(this, 'BillingAPI', {
            restApiName: `${appName}-billing-api`,
            description: `Stripe billing API for ${appName}`,
            defaultCorsPreflightOptions: {
                allowOrigins: apigateway.Cors.ALL_ORIGINS,
                allowMethods: apigateway.Cors.ALL_METHODS,
                allowHeaders: ['Content-Type', 'Authorization'],
            },
        });
        // Add billing resource
        const billingResource = this.api.root.addResource('billing');
        // Add checkout endpoint
        const checkoutResource = billingResource.addResource('checkout');
        checkoutResource.addMethod('POST', new apigateway.LambdaIntegration(this.checkoutFunction));
        // Add webhook endpoint
        const webhookResource = billingResource.addResource('webhook');
        webhookResource.addMethod('POST', new apigateway.LambdaIntegration(this.webhookFunction));
        // Add portal endpoint
        const portalResource = billingResource.addResource('portal');
        portalResource.addMethod('GET', new apigateway.LambdaIntegration(this.portalFunction));
        // Apply consistent tagging
        cdk.Tags.of(this).add('Project', appName);
        cdk.Tags.of(this).add('ManagedBy', 'cdk-ai-constructs');
        cdk.Tags.of(this).add('Owner', 'johnathan-horner');
        cdk.Tags.of(this).add('Component', 'StripeBilling');
        // Output important values
        new cdk.CfnOutput(this, 'BillingApiUrl', {
            value: this.api.url,
            description: 'Base URL for billing API',
            exportName: `${cdk.Stack.of(this).stackName}-${id}-BillingApiUrl`,
        });
        new cdk.CfnOutput(this, 'CheckoutEndpoint', {
            value: `${this.api.url}billing/checkout`,
            description: 'Checkout session creation endpoint',
            exportName: `${cdk.Stack.of(this).stackName}-${id}-CheckoutEndpoint`,
        });
        new cdk.CfnOutput(this, 'WebhookEndpoint', {
            value: `${this.api.url}billing/webhook`,
            description: 'Stripe webhook endpoint',
            exportName: `${cdk.Stack.of(this).stackName}-${id}-WebhookEndpoint`,
        });
        new cdk.CfnOutput(this, 'PortalEndpoint', {
            value: `${this.api.url}billing/portal`,
            description: 'Customer portal session endpoint',
            exportName: `${cdk.Stack.of(this).stackName}-${id}-PortalEndpoint`,
        });
        new cdk.CfnOutput(this, 'TierConfiguration', {
            value: JSON.stringify(tiers),
            description: 'Pricing tier configuration',
            exportName: `${cdk.Stack.of(this).stackName}-${id}-TierConfiguration`,
        });
    }
    /**
     * Grant permission to invoke checkout function
     * @param grantee The IAM principal to grant permissions to
     */
    grantCreateCheckout(grantee) {
        return this.checkoutFunction.grantInvoke(grantee);
    }
    /**
     * Grant permission to invoke portal function
     * @param grantee The IAM principal to grant permissions to
     */
    grantCreatePortalSession(grantee) {
        return this.portalFunction.grantInvoke(grantee);
    }
}
exports.StripeBilling = StripeBilling;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RyaXBlLWJpbGxpbmcuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9jb25zdHJ1Y3RzL3N0cmlwZS1iaWxsaW5nLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLGlEQUFpRDtBQUNqRCx5REFBeUQ7QUFFekQsMkNBQTJDO0FBRTNDLG1DQUFtQztBQUNuQywyQ0FBdUM7QUEyRnZDOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBd0NHO0FBQ0gsTUFBYSxhQUFjLFNBQVEsc0JBQVM7SUFDMUM7O09BRUc7SUFDYSxnQkFBZ0IsQ0FBa0I7SUFFbEQ7O09BRUc7SUFDYSxlQUFlLENBQWtCO0lBRWpEOztPQUVHO0lBQ2EsY0FBYyxDQUFrQjtJQUVoRDs7T0FFRztJQUNhLEdBQUcsQ0FBcUI7SUFFeEM7O09BRUc7SUFDYSxzQkFBc0IsQ0FBdUI7SUFFN0QsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUF5QjtRQUNqRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLE1BQU0sRUFDSixPQUFPLEVBQ1AsS0FBSyxFQUNMLGFBQWEsRUFDYixVQUFVLEVBQ1YsU0FBUyxFQUNULGdCQUFnQixFQUNoQixZQUFZLEVBQ1osVUFBVSxFQUNWLG9CQUFvQixHQUNyQixHQUFHLEtBQUssQ0FBQztRQUVWLHVEQUF1RDtRQUN2RCxJQUFJLENBQUMsc0JBQXNCLEdBQUcsR0FBRyxDQUFDLGVBQWUsQ0FBQyx1QkFBdUIsQ0FDdkUsSUFBSSxFQUNKLGVBQWUsRUFDZixhQUFhLENBQ2QsQ0FBQztRQUVGLGlDQUFpQztRQUNqQyxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsSUFBSSxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRTtZQUNwRSxZQUFZLEVBQUUsR0FBRyxPQUFPLGtCQUFrQjtZQUMxQyxPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXO1lBQ25DLE9B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RSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLFNBQVMsSUFBSSxFQUFFLGtCQUFrQjtTQUNwRSxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGdCQUFnQixFQUFFO1lBQ3hDLEtBQUssRUFBRSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxnQkFBZ0I7WUFDdEMsV0FBVyxFQUFFLGtDQUFrQztZQUMvQyxVQUFVLEVBQUUsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxTQUFTLElBQUksRUFBRSxpQkFBaUI7U0FDbkUsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxtQkFBbUIsRUFBRTtZQUMzQyxLQUFLLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUM7WUFDNUIsV0FBVyxFQUFFLDRCQUE0QjtZQUN6QyxVQUFVLEVBQUUsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxTQUFTLElBQUksRUFBRSxvQkFBb0I7U0FDdEUsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVEOzs7T0FHRztJQUNJLG1CQUFtQixDQUFDLE9BQXVCO1FBQ2hELE9BQU8sSUFBSSxDQUFDLGdCQUFnQixDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUNwRCxDQUFDO0lBRUQ7OztPQUdHO0lBQ0ksd0JBQXdCLENBQUMsT0FBdUI7UUFDckQsT0FBTyxJQUFJLENBQUMsY0FBYyxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUNsRCxDQUFDO0NBQ0Y7QUF2Y0Qsc0NBdWNDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0ICogYXMgYXBpZ2F0ZXdheSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheSc7XG5pbXBvcnQgKiBhcyBkeW5hbW9kYiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGInO1xuaW1wb3J0ICogYXMgc3NtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zc20nO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG4vKipcbiAqIFN0cmlwZSBwcmljaW5nIHRpZXIgY29uZmlndXJhdGlvblxuICovXG5leHBvcnQgaW50ZXJmYWNlIFN0cmlwZVRpZXIge1xuICAvKipcbiAgICogRGlzcGxheSBuYW1lIGZvciB0aGUgdGllclxuICAgKi9cbiAgcmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBTdHJpcGUgcHJpY2UgSURcbiAgICovXG4gIHJlYWRvbmx5IHByaWNlSWQ6IHN0cmluZztcblxuICAvKipcbiAgICogQW1vdW50IGluIGNlbnRzIChmb3IgZGlzcGxheSBwdXJwb3NlcylcbiAgICovXG4gIHJlYWRvbmx5IGFtb3VudDogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBDdXJyZW5jeSBjb2RlXG4gICAqIEBkZWZhdWx0IFwidXNkXCJcbiAgICovXG4gIHJlYWRvbmx5IGN1cnJlbmN5Pzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBCaWxsaW5nIGludGVydmFsXG4gICAqIEBkZWZhdWx0IFwibW9udGhcIlxuICAgKi9cbiAgcmVhZG9ubHkgaW50ZXJ2YWw/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogUHJvcGVydGllcyBmb3IgU3RyaXBlQmlsbGluZyBjb25zdHJ1Y3RcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBTdHJpcGVCaWxsaW5nUHJvcHMge1xuICAvKipcbiAgICogQXBwbGljYXRpb24gbmFtZSBmb3IgY29uc2lzdGVudCBuYW1pbmcgYW5kIHRhZ2dpbmdcbiAgICovXG4gIHJlYWRvbmx5IGFwcE5hbWU6IHN0cmluZztcblxuICAvKipcbiAgICogQXJyYXkgb2YgcHJpY2luZyB0aWVycyB3aXRoIFN0cmlwZSBwcmljZSBJRHNcbiAgICovXG4gIHJlYWRvbmx5IHRpZXJzOiBTdHJpcGVUaWVyW107XG5cbiAgLyoqXG4gICAqIFNTTSBwYXJhbWV0ZXIgbmFtZSBjb250YWluaW5nIHRoZSBTdHJpcGUgd2ViaG9vayBzZWNyZXRcbiAgICogVGhlIHBhcmFtZXRlciBzaG91bGQgYmUgb2YgdHlwZSBTZWN1cmVTdHJpbmdcbiAgICogQGV4YW1wbGUgXCIvbXlhcHAvc3RyaXBlL3dlYmhvb2stc2VjcmV0XCJcbiAgICovXG4gIHJlYWRvbmx5IHdlYmhvb2tTZWNyZXQ6IHN0cmluZztcblxuICAvKipcbiAgICogU3VjY2VzcyBVUkwgYWZ0ZXIgc3VjY2Vzc2Z1bCBwYXltZW50XG4gICAqL1xuICByZWFkb25seSBzdWNjZXNzVXJsOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIENhbmNlbCBVUkwgd2hlbiBwYXltZW50IGlzIGNhbmNlbGxlZFxuICAgKi9cbiAgcmVhZG9ubHkgY2FuY2VsVXJsOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIExhbWJkYSBmdW5jdGlvbiB0byBpbnZva2Ugd2hlbiBwYXltZW50IGlzIHN1Y2Nlc3NmdWxcbiAgICogVGhpcyBmdW5jdGlvbiB3aWxsIHJlY2VpdmUgdGhlIFN0cmlwZSB3ZWJob29rIGV2ZW50XG4gICAqL1xuICByZWFkb25seSBvblBheW1lbnRTdWNjZXNzOiBsYW1iZGEuRnVuY3Rpb247XG5cbiAgLyoqXG4gICAqIER5bmFtb0RCIHRhYmxlIGNvbnRhaW5pbmcgdGVuYW50IGluZm9ybWF0aW9uXG4gICAqIE11c3QgaGF2ZSBwYXJ0aXRpb24ga2V5ICd0ZW5hbnRfaWQnIGFuZCBHU0kgJ3N0cmlwZS1jdXN0b21lci1pbmRleCcgb24gJ3N0cmlwZV9jdXN0b21lcl9pZCdcbiAgICovXG4gIHJlYWRvbmx5IHRlbmFudHNUYWJsZTogZHluYW1vZGIuVGFibGU7XG5cbiAgLyoqXG4gICAqIERvbWFpbiBuYW1lIGZvciBBUEkgR2F0ZXdheSBjdXN0b20gZG9tYWluXG4gICAqIElmIHByb3ZpZGVkLCBjcmVhdGVzIEhUVFBTIGVuZHBvaW50c1xuICAgKiBAZGVmYXVsdCB1bmRlZmluZWQgLSB1c2VzIGRlZmF1bHQgQVBJIEdhdGV3YXkgZG9tYWluXG4gICAqL1xuICByZWFkb25seSBkb21haW5OYW1lPzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBTdHJpcGUgcHVibGlzaGFibGUga2V5IChzdG9yZWQgYXMgZW52aXJvbm1lbnQgdmFyaWFibGUpXG4gICAqIEBkZWZhdWx0IHVuZGVmaW5lZFxuICAgKi9cbiAgcmVhZG9ubHkgc3RyaXBlUHVibGlzaGFibGVLZXk/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogQSBjb21wcmVoZW5zaXZlIFN0cmlwZSBiaWxsaW5nIGludGVncmF0aW9uIGNvbnN0cnVjdCB3aXRoIGNoZWNrb3V0IHNlc3Npb25zLFxuICogd2ViaG9vayBoYW5kbGluZywgYW5kIHRlbmFudCBzdWJzY3JpcHRpb24gbWFuYWdlbWVudC5cbiAqXG4gKiBGZWF0dXJlczpcbiAqIC0gTGFtYmRhIGZ1bmN0aW9uIGZvciBjcmVhdGluZyBTdHJpcGUgY2hlY2tvdXQgc2Vzc2lvbnNcbiAqIC0gV2ViaG9vayBoYW5kbGVyIGZvciBwcm9jZXNzaW5nIFN0cmlwZSBldmVudHNcbiAqIC0gQVBJIEdhdGV3YXkgZW5kcG9pbnRzIGZvciBiaWxsaW5nIG9wZXJhdGlvbnNcbiAqIC0gU1NNIFBhcmFtZXRlciBTdG9yZSBpbnRlZ3JhdGlvbiBmb3Igc2VjdXJlIHdlYmhvb2sgc2VjcmV0c1xuICogLSBEeW5hbW9EQiBpbnRlZ3JhdGlvbiBmb3IgdGVuYW50IHN1YnNjcmlwdGlvbiBtYW5hZ2VtZW50XG4gKiAtIEN1c3RvbWVyIHBvcnRhbCBzZXNzaW9uIGNyZWF0aW9uXG4gKiAtIEF1dG9tYXRpYyB0aWVyIHVwZGF0ZXMgb24gc3VjY2Vzc2Z1bCBwYXltZW50c1xuICpcbiAqIEFQSSBFbmRwb2ludHM6XG4gKiAtIFBPU1QgL2JpbGxpbmcvY2hlY2tvdXQgLSBDcmVhdGUgY2hlY2tvdXQgc2Vzc2lvblxuICogLSBQT1NUIC9iaWxsaW5nL3dlYmhvb2sgLSBQcm9jZXNzIFN0cmlwZSB3ZWJob29rc1xuICogLSBHRVQgL2JpbGxpbmcvcG9ydGFsIC0gQ3JlYXRlIGN1c3RvbWVyIHBvcnRhbCBzZXNzaW9uXG4gKlxuICogQGV4YW1wbGVcbiAqIGBgYHR5cGVzY3JpcHRcbiAqIGNvbnN0IHBheW1lbnRIYW5kbGVyID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnUGF5bWVudEhhbmRsZXInLCB7XG4gKiAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzExLFxuICogICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gKiAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnbGFtYmRhJyksXG4gKiB9KTtcbiAqXG4gKiBuZXcgU3RyaXBlQmlsbGluZyh0aGlzLCAnQmlsbGluZycsIHtcbiAqICAgYXBwTmFtZTogJ015QXBwJyxcbiAqICAgdGllcnM6IFtcbiAqICAgICB7IG5hbWU6ICdTdGFydGVyJywgcHJpY2VJZDogJ3ByaWNlXzEyMzQnLCBhbW91bnQ6IDk5OSB9LFxuICogICAgIHsgbmFtZTogJ0dyb3d0aCcsIHByaWNlSWQ6ICdwcmljZV81Njc4JywgYW1vdW50OiAyOTk5IH0sXG4gKiAgICAgeyBuYW1lOiAnUHJvJywgcHJpY2VJZDogJ3ByaWNlXzkwMTInLCBhbW91bnQ6IDk5OTkgfVxuICogICBdLFxuICogICB3ZWJob29rU2VjcmV0OiAnL215YXBwL3N0cmlwZS93ZWJob29rLXNlY3JldCcsXG4gKiAgIHN1Y2Nlc3NVcmw6ICdodHRwczovL215YXBwLmNvbS9zdWNjZXNzJyxcbiAqICAgY2FuY2VsVXJsOiAnaHR0cHM6Ly9teWFwcC5jb20vY2FuY2VsJyxcbiAqICAgb25QYXltZW50U3VjY2VzczogcGF5bWVudEhhbmRsZXIsXG4gKiAgIHRlbmFudHNUYWJsZTogYXV0aC50ZW5hbnRzVGFibGVcbiAqIH0pO1xuICogYGBgXG4gKi9cbmV4cG9ydCBjbGFzcyBTdHJpcGVCaWxsaW5nIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgLyoqXG4gICAqIExhbWJkYSBmdW5jdGlvbiBmb3IgY3JlYXRpbmcgY2hlY2tvdXQgc2Vzc2lvbnNcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBjaGVja291dEZ1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG5cbiAgLyoqXG4gICAqIExhbWJkYSBmdW5jdGlvbiBmb3IgaGFuZGxpbmcgU3RyaXBlIHdlYmhvb2tzXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgd2ViaG9va0Z1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG5cbiAgLyoqXG4gICAqIExhbWJkYSBmdW5jdGlvbiBmb3IgY3JlYXRpbmcgY3VzdG9tZXIgcG9ydGFsIHNlc3Npb25zXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgcG9ydGFsRnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcblxuICAvKipcbiAgICogQVBJIEdhdGV3YXkgZm9yIGJpbGxpbmcgZW5kcG9pbnRzXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgYXBpOiBhcGlnYXRld2F5LlJlc3RBcGk7XG5cbiAgLyoqXG4gICAqIFNTTSBwYXJhbWV0ZXIgZm9yIHdlYmhvb2sgc2VjcmV0XG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgd2ViaG9va1NlY3JldFBhcmFtZXRlcjogc3NtLklTdHJpbmdQYXJhbWV0ZXI7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFN0cmlwZUJpbGxpbmdQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICBjb25zdCB7XG4gICAgICBhcHBOYW1lLFxuICAgICAgdGllcnMsXG4gICAgICB3ZWJob29rU2VjcmV0LFxuICAgICAgc3VjY2Vzc1VybCxcbiAgICAgIGNhbmNlbFVybCxcbiAgICAgIG9uUGF5bWVudFN1Y2Nlc3MsXG4gICAgICB0ZW5hbnRzVGFibGUsXG4gICAgICBkb21haW5OYW1lLFxuICAgICAgc3RyaXBlUHVibGlzaGFibGVLZXksXG4gICAgfSA9IHByb3BzO1xuXG4gICAgLy8gQ3JlYXRlIG9yIHJlZmVyZW5jZSBTU00gcGFyYW1ldGVyIGZvciB3ZWJob29rIHNlY3JldFxuICAgIHRoaXMud2ViaG9va1NlY3JldFBhcmFtZXRlciA9IHNzbS5TdHJpbmdQYXJhbWV0ZXIuZnJvbVN0cmluZ1BhcmFtZXRlck5hbWUoXG4gICAgICB0aGlzLFxuICAgICAgJ1dlYmhvb2tTZWNyZXQnLFxuICAgICAgd2ViaG9va1NlY3JldFxuICAgICk7XG5cbiAgICAvLyBDcmVhdGUgY2hlY2tvdXQgc2Vzc2lvbiBMYW1iZGFcbiAgICB0aGlzLmNoZWNrb3V0RnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdDaGVja291dEZ1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgJHthcHBOYW1lfS1zdHJpcGUtY2hlY2tvdXRgLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfMTEsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygxKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFRFTkFOVFNfVEFCTEVfTkFNRTogdGVuYW50c1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgU1VDQ0VTU19VUkw6IHN1Y2Nlc3NVcmwsXG4gICAgICAgIENBTkNFTF9VUkw6IGNhbmNlbFVybCxcbiAgICAgICAgU1RSSVBFX1BVQkxJU0hBQkxFX0tFWTogc3RyaXBlUHVibGlzaGFibGVLZXkgfHwgJycsXG4gICAgICAgIFRJRVJTX0NPTkZJRzogSlNPTi5zdHJpbmdpZnkodGllcnMpLFxuICAgICAgfSxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21JbmxpbmUoYFxuaW1wb3J0IGpzb25cbmltcG9ydCBib3RvM1xuaW1wb3J0IG9zXG5pbXBvcnQgc3RyaXBlXG5pbXBvcnQgbG9nZ2luZ1xuZnJvbSBkYXRldGltZSBpbXBvcnQgZGF0ZXRpbWVcblxubG9nZ2VyID0gbG9nZ2luZy5nZXRMb2dnZXIoKVxubG9nZ2VyLnNldExldmVsKGxvZ2dpbmcuSU5GTylcblxuZHluYW1vZGIgPSBib3RvMy5yZXNvdXJjZSgnZHluYW1vZGInKVxudGFibGUgPSBkeW5hbW9kYi5UYWJsZShvcy5lbnZpcm9uWydURU5BTlRTX1RBQkxFX05BTUUnXSlcblxuIyBJbml0aWFsaXplIFN0cmlwZSB3aXRoIHNlY3JldCBrZXkgZnJvbSBlbnZpcm9ubWVudFxuc3RyaXBlLmFwaV9rZXkgPSBvcy5lbnZpcm9uLmdldCgnU1RSSVBFX1NFQ1JFVF9LRVknKVxuXG5kZWYgaGFuZGxlcihldmVudCwgY29udGV4dCk6XG4gICAgdHJ5OlxuICAgICAgICBib2R5ID0ganNvbi5sb2FkcyhldmVudFsnYm9keSddKSBpZiBldmVudC5nZXQoJ2JvZHknKSBlbHNlIHt9XG4gICAgICAgIHRlbmFudF9pZCA9IGJvZHkuZ2V0KCd0ZW5hbnRfaWQnKVxuICAgICAgICBwcmljZV9pZCA9IGJvZHkuZ2V0KCdwcmljZV9pZCcpXG5cbiAgICAgICAgaWYgbm90IHRlbmFudF9pZCBvciBub3QgcHJpY2VfaWQ6XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICdzdGF0dXNDb2RlJzogNDAwLFxuICAgICAgICAgICAgICAgICdoZWFkZXJzJzogeydDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbid9LFxuICAgICAgICAgICAgICAgICdib2R5JzoganNvbi5kdW1wcyh7J2Vycm9yJzogJ3RlbmFudF9pZCBhbmQgcHJpY2VfaWQgcmVxdWlyZWQnfSlcbiAgICAgICAgICAgIH1cblxuICAgICAgICAjIEdldCB0ZW5hbnQgaW5mb3JtYXRpb25cbiAgICAgICAgcmVzcG9uc2UgPSB0YWJsZS5nZXRfaXRlbShLZXk9eyd0ZW5hbnRfaWQnOiB0ZW5hbnRfaWR9KVxuICAgICAgICBpZiAnSXRlbScgbm90IGluIHJlc3BvbnNlOlxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAnc3RhdHVzQ29kZSc6IDQwNCxcbiAgICAgICAgICAgICAgICAnaGVhZGVycyc6IHsnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nfSxcbiAgICAgICAgICAgICAgICAnYm9keSc6IGpzb24uZHVtcHMoeydlcnJvcic6ICdUZW5hbnQgbm90IGZvdW5kJ30pXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgdGVuYW50ID0gcmVzcG9uc2VbJ0l0ZW0nXVxuICAgICAgICBjdXN0b21lcl9pZCA9IHRlbmFudC5nZXQoJ3N0cmlwZV9jdXN0b21lcl9pZCcpXG5cbiAgICAgICAgIyBDcmVhdGUgb3IgcmV0cmlldmUgU3RyaXBlIGN1c3RvbWVyXG4gICAgICAgIGlmIG5vdCBjdXN0b21lcl9pZDpcbiAgICAgICAgICAgIGN1c3RvbWVyID0gc3RyaXBlLkN1c3RvbWVyLmNyZWF0ZShcbiAgICAgICAgICAgICAgICBlbWFpbD10ZW5hbnQuZ2V0KCdlbWFpbCcsICcnKSxcbiAgICAgICAgICAgICAgICBtZXRhZGF0YT17J3RlbmFudF9pZCc6IHRlbmFudF9pZH1cbiAgICAgICAgICAgIClcbiAgICAgICAgICAgIGN1c3RvbWVyX2lkID0gY3VzdG9tZXIuaWRcblxuICAgICAgICAgICAgIyBVcGRhdGUgdGVuYW50IHJlY29yZCB3aXRoIGN1c3RvbWVyIElEXG4gICAgICAgICAgICB0YWJsZS51cGRhdGVfaXRlbShcbiAgICAgICAgICAgICAgICBLZXk9eyd0ZW5hbnRfaWQnOiB0ZW5hbnRfaWR9LFxuICAgICAgICAgICAgICAgIFVwZGF0ZUV4cHJlc3Npb249J1NFVCBzdHJpcGVfY3VzdG9tZXJfaWQgPSA6Y2lkJyxcbiAgICAgICAgICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzPXsnOmNpZCc6IGN1c3RvbWVyX2lkfVxuICAgICAgICAgICAgKVxuXG4gICAgICAgICMgQ3JlYXRlIGNoZWNrb3V0IHNlc3Npb25cbiAgICAgICAgc2Vzc2lvbiA9IHN0cmlwZS5jaGVja291dC5TZXNzaW9uLmNyZWF0ZShcbiAgICAgICAgICAgIGN1c3RvbWVyPWN1c3RvbWVyX2lkLFxuICAgICAgICAgICAgcGF5bWVudF9tZXRob2RfdHlwZXM9WydjYXJkJ10sXG4gICAgICAgICAgICBsaW5lX2l0ZW1zPVt7XG4gICAgICAgICAgICAgICAgJ3ByaWNlJzogcHJpY2VfaWQsXG4gICAgICAgICAgICAgICAgJ3F1YW50aXR5JzogMSxcbiAgICAgICAgICAgIH1dLFxuICAgICAgICAgICAgbW9kZT0nc3Vic2NyaXB0aW9uJyxcbiAgICAgICAgICAgIHN1Y2Nlc3NfdXJsPW9zLmVudmlyb25bJ1NVQ0NFU1NfVVJMJ10sXG4gICAgICAgICAgICBjYW5jZWxfdXJsPW9zLmVudmlyb25bJ0NBTkNFTF9VUkwnXSxcbiAgICAgICAgICAgIG1ldGFkYXRhPXtcbiAgICAgICAgICAgICAgICAndGVuYW50X2lkJzogdGVuYW50X2lkLFxuICAgICAgICAgICAgICAgICdwcmljZV9pZCc6IHByaWNlX2lkXG4gICAgICAgICAgICB9XG4gICAgICAgIClcblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgJ3N0YXR1c0NvZGUnOiAyMDAsXG4gICAgICAgICAgICAnaGVhZGVycyc6IHtcbiAgICAgICAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ2JvZHknOiBqc29uLmR1bXBzKHtcbiAgICAgICAgICAgICAgICAnY2hlY2tvdXRfdXJsJzogc2Vzc2lvbi51cmwsXG4gICAgICAgICAgICAgICAgJ3Nlc3Npb25faWQnOiBzZXNzaW9uLmlkXG4gICAgICAgICAgICB9KVxuICAgICAgICB9XG5cbiAgICBleGNlcHQgRXhjZXB0aW9uIGFzIGU6XG4gICAgICAgIGxvZ2dlci5lcnJvcihmXCJDaGVja291dCBlcnJvcjoge3N0cihlKX1cIilcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICdzdGF0dXNDb2RlJzogNTAwLFxuICAgICAgICAgICAgJ2hlYWRlcnMnOiB7J0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJ30sXG4gICAgICAgICAgICAnYm9keSc6IGpzb24uZHVtcHMoeydlcnJvcic6ICdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3InfSlcbiAgICAgICAgfVxuYCksXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgd2ViaG9vayBoYW5kbGVyIExhbWJkYVxuICAgIHRoaXMud2ViaG9va0Z1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnV2ViaG9va0Z1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgJHthcHBOYW1lfS1zdHJpcGUtd2ViaG9va2AsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMSxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgVEVOQU5UU19UQUJMRV9OQU1FOiB0ZW5hbnRzVGFibGUudGFibGVOYW1lLFxuICAgICAgICBXRUJIT09LX1NFQ1JFVF9QQVJBTTogd2ViaG9va1NlY3JldCxcbiAgICAgICAgUEFZTUVOVF9TVUNDRVNTX0ZVTkNUSU9OOiBvblBheW1lbnRTdWNjZXNzLmZ1bmN0aW9uTmFtZSxcbiAgICAgICAgVElFUlNfQ09ORklHOiBKU09OLnN0cmluZ2lmeSh0aWVycyksXG4gICAgICB9LFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUlubGluZShgXG5pbXBvcnQganNvblxuaW1wb3J0IGJvdG8zXG5pbXBvcnQgb3NcbmltcG9ydCBzdHJpcGVcbmltcG9ydCBsb2dnaW5nXG5mcm9tIGRhdGV0aW1lIGltcG9ydCBkYXRldGltZVxuXG5sb2dnZXIgPSBsb2dnaW5nLmdldExvZ2dlcigpXG5sb2dnZXIuc2V0TGV2ZWwobG9nZ2luZy5JTkZPKVxuXG5keW5hbW9kYiA9IGJvdG8zLnJlc291cmNlKCdkeW5hbW9kYicpXG50YWJsZSA9IGR5bmFtb2RiLlRhYmxlKG9zLmVudmlyb25bJ1RFTkFOVFNfVEFCTEVfTkFNRSddKVxuc3NtID0gYm90bzMuY2xpZW50KCdzc20nKVxubGFtYmRhX2NsaWVudCA9IGJvdG8zLmNsaWVudCgnbGFtYmRhJylcblxuZGVmIGhhbmRsZXIoZXZlbnQsIGNvbnRleHQpOlxuICAgIHRyeTpcbiAgICAgICAgIyBHZXQgd2ViaG9vayBzZWNyZXQgZnJvbSBTU01cbiAgICAgICAgd2ViaG9va19zZWNyZXQgPSBzc20uZ2V0X3BhcmFtZXRlcihcbiAgICAgICAgICAgIE5hbWU9b3MuZW52aXJvblsnV0VCSE9PS19TRUNSRVRfUEFSQU0nXSxcbiAgICAgICAgICAgIFdpdGhEZWNyeXB0aW9uPVRydWVcbiAgICAgICAgKVsnUGFyYW1ldGVyJ11bJ1ZhbHVlJ11cblxuICAgICAgICAjIFZlcmlmeSB3ZWJob29rIHNpZ25hdHVyZVxuICAgICAgICBwYXlsb2FkID0gZXZlbnRbJ2JvZHknXVxuICAgICAgICBzaWdfaGVhZGVyID0gZXZlbnRbJ2hlYWRlcnMnXS5nZXQoJ3N0cmlwZS1zaWduYXR1cmUnKVxuXG4gICAgICAgIHRyeTpcbiAgICAgICAgICAgIHdlYmhvb2tfZXZlbnQgPSBzdHJpcGUuV2ViaG9vay5jb25zdHJ1Y3RfZXZlbnQoXG4gICAgICAgICAgICAgICAgcGF5bG9hZCwgc2lnX2hlYWRlciwgd2ViaG9va19zZWNyZXRcbiAgICAgICAgICAgIClcbiAgICAgICAgZXhjZXB0IFZhbHVlRXJyb3I6XG4gICAgICAgICAgICBsb2dnZXIuZXJyb3IoXCJJbnZhbGlkIHBheWxvYWRcIilcbiAgICAgICAgICAgIHJldHVybiB7J3N0YXR1c0NvZGUnOiA0MDB9XG4gICAgICAgIGV4Y2VwdCBzdHJpcGUuZXJyb3IuU2lnbmF0dXJlVmVyaWZpY2F0aW9uRXJyb3I6XG4gICAgICAgICAgICBsb2dnZXIuZXJyb3IoXCJJbnZhbGlkIHNpZ25hdHVyZVwiKVxuICAgICAgICAgICAgcmV0dXJuIHsnc3RhdHVzQ29kZSc6IDQwMH1cblxuICAgICAgICAjIEhhbmRsZSB0aGUgZXZlbnRcbiAgICAgICAgaWYgd2ViaG9va19ldmVudFsndHlwZSddID09ICdjaGVja291dC5zZXNzaW9uLmNvbXBsZXRlZCc6XG4gICAgICAgICAgICBzZXNzaW9uID0gd2ViaG9va19ldmVudFsnZGF0YSddWydvYmplY3QnXVxuICAgICAgICAgICAgdGVuYW50X2lkID0gc2Vzc2lvblsnbWV0YWRhdGEnXVsndGVuYW50X2lkJ11cbiAgICAgICAgICAgIGN1c3RvbWVyX2lkID0gc2Vzc2lvblsnY3VzdG9tZXInXVxuICAgICAgICAgICAgc3Vic2NyaXB0aW9uX2lkID0gc2Vzc2lvblsnc3Vic2NyaXB0aW9uJ11cblxuICAgICAgICAgICAgIyBHZXQgc3Vic2NyaXB0aW9uIGRldGFpbHNcbiAgICAgICAgICAgIHN1YnNjcmlwdGlvbiA9IHN0cmlwZS5TdWJzY3JpcHRpb24ucmV0cmlldmUoc3Vic2NyaXB0aW9uX2lkKVxuICAgICAgICAgICAgcHJpY2VfaWQgPSBzdWJzY3JpcHRpb25bJ2l0ZW1zJ11bJ2RhdGEnXVswXVsncHJpY2UnXVsnaWQnXVxuXG4gICAgICAgICAgICAjIEZpbmQgdGllciBuYW1lIGZyb20gcHJpY2VfaWRcbiAgICAgICAgICAgIHRpZXJzID0ganNvbi5sb2Fkcyhvcy5lbnZpcm9uWydUSUVSU19DT05GSUcnXSlcbiAgICAgICAgICAgIHRpZXJfbmFtZSA9IG5leHQoKHRpZXJbJ25hbWUnXSBmb3IgdGllciBpbiB0aWVycyBpZiB0aWVyWydwcmljZUlkJ10gPT0gcHJpY2VfaWQpLCAndW5rbm93bicpXG5cbiAgICAgICAgICAgICMgVXBkYXRlIHRlbmFudCByZWNvcmRcbiAgICAgICAgICAgIHRhYmxlLnVwZGF0ZV9pdGVtKFxuICAgICAgICAgICAgICAgIEtleT17J3RlbmFudF9pZCc6IHRlbmFudF9pZH0sXG4gICAgICAgICAgICAgICAgVXBkYXRlRXhwcmVzc2lvbj0nU0VUIHN0cmlwZV9jdXN0b21lcl9pZCA9IDpjaWQsIHRpZXIgPSA6dGllciwgc3RyaXBlX3N1YnNjcmlwdGlvbl9pZCA9IDpzaWQsIHVwZGF0ZWRfYXQgPSA6dXBkYXRlZCcsXG4gICAgICAgICAgICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlcz17XG4gICAgICAgICAgICAgICAgICAgICc6Y2lkJzogY3VzdG9tZXJfaWQsXG4gICAgICAgICAgICAgICAgICAgICc6dGllcic6IHRpZXJfbmFtZS5sb3dlcigpLFxuICAgICAgICAgICAgICAgICAgICAnOnNpZCc6IHN1YnNjcmlwdGlvbl9pZCxcbiAgICAgICAgICAgICAgICAgICAgJzp1cGRhdGVkJzogZGF0ZXRpbWUudXRjbm93KCkuaXNvZm9ybWF0KClcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICApXG5cbiAgICAgICAgICAgICMgSW52b2tlIHBheW1lbnQgc3VjY2VzcyBmdW5jdGlvblxuICAgICAgICAgICAgbGFtYmRhX2NsaWVudC5pbnZva2UoXG4gICAgICAgICAgICAgICAgRnVuY3Rpb25OYW1lPW9zLmVudmlyb25bJ1BBWU1FTlRfU1VDQ0VTU19GVU5DVElPTiddLFxuICAgICAgICAgICAgICAgIEludm9jYXRpb25UeXBlPSdFdmVudCcsXG4gICAgICAgICAgICAgICAgUGF5bG9hZD1qc29uLmR1bXBzKHtcbiAgICAgICAgICAgICAgICAgICAgJ3RlbmFudF9pZCc6IHRlbmFudF9pZCxcbiAgICAgICAgICAgICAgICAgICAgJ3RpZXInOiB0aWVyX25hbWUubG93ZXIoKSxcbiAgICAgICAgICAgICAgICAgICAgJ3N0cmlwZV9ldmVudCc6IHdlYmhvb2tfZXZlbnRcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgKVxuXG4gICAgICAgICAgICBsb2dnZXIuaW5mbyhmXCJVcGRhdGVkIHRlbmFudCB7dGVuYW50X2lkfSB0byB0aWVyIHt0aWVyX25hbWV9XCIpXG5cbiAgICAgICAgZWxpZiB3ZWJob29rX2V2ZW50Wyd0eXBlJ10gPT0gJ2N1c3RvbWVyLnN1YnNjcmlwdGlvbi5kZWxldGVkJzpcbiAgICAgICAgICAgIHN1YnNjcmlwdGlvbiA9IHdlYmhvb2tfZXZlbnRbJ2RhdGEnXVsnb2JqZWN0J11cbiAgICAgICAgICAgIGN1c3RvbWVyX2lkID0gc3Vic2NyaXB0aW9uWydjdXN0b21lciddXG5cbiAgICAgICAgICAgICMgRmluZCB0ZW5hbnQgYnkgY3VzdG9tZXJfaWQgdXNpbmcgR1NJXG4gICAgICAgICAgICByZXNwb25zZSA9IHRhYmxlLnF1ZXJ5KFxuICAgICAgICAgICAgICAgIEluZGV4TmFtZT0nc3RyaXBlLWN1c3RvbWVyLWluZGV4JyxcbiAgICAgICAgICAgICAgICBLZXlDb25kaXRpb25FeHByZXNzaW9uPSdzdHJpcGVfY3VzdG9tZXJfaWQgPSA6Y2lkJyxcbiAgICAgICAgICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzPXsnOmNpZCc6IGN1c3RvbWVyX2lkfVxuICAgICAgICAgICAgKVxuXG4gICAgICAgICAgICBpZiByZXNwb25zZVsnSXRlbXMnXTpcbiAgICAgICAgICAgICAgICB0ZW5hbnQgPSByZXNwb25zZVsnSXRlbXMnXVswXVxuICAgICAgICAgICAgICAgIHRlbmFudF9pZCA9IHRlbmFudFsndGVuYW50X2lkJ11cblxuICAgICAgICAgICAgICAgICMgRG93bmdyYWRlIHRvIGZyZWUgdGllclxuICAgICAgICAgICAgICAgIHRhYmxlLnVwZGF0ZV9pdGVtKFxuICAgICAgICAgICAgICAgICAgICBLZXk9eyd0ZW5hbnRfaWQnOiB0ZW5hbnRfaWR9LFxuICAgICAgICAgICAgICAgICAgICBVcGRhdGVFeHByZXNzaW9uPSdTRVQgdGllciA9IDp0aWVyLCBzdHJpcGVfc3Vic2NyaXB0aW9uX2lkID0gOnNpZCwgdXBkYXRlZF9hdCA9IDp1cGRhdGVkJyxcbiAgICAgICAgICAgICAgICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlcz17XG4gICAgICAgICAgICAgICAgICAgICAgICAnOnRpZXInOiAnZnJlZScsXG4gICAgICAgICAgICAgICAgICAgICAgICAnOnNpZCc6IE5vbmUsXG4gICAgICAgICAgICAgICAgICAgICAgICAnOnVwZGF0ZWQnOiBkYXRldGltZS51dGNub3coKS5pc29mb3JtYXQoKVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgKVxuXG4gICAgICAgICAgICAgICAgbG9nZ2VyLmluZm8oZlwiRG93bmdyYWRlZCB0ZW5hbnQge3RlbmFudF9pZH0gdG8gZnJlZSB0aWVyXCIpXG5cbiAgICAgICAgcmV0dXJuIHsnc3RhdHVzQ29kZSc6IDIwMH1cblxuICAgIGV4Y2VwdCBFeGNlcHRpb24gYXMgZTpcbiAgICAgICAgbG9nZ2VyLmVycm9yKGZcIldlYmhvb2sgZXJyb3I6IHtzdHIoZSl9XCIpXG4gICAgICAgIHJldHVybiB7J3N0YXR1c0NvZGUnOiA1MDB9XG5gKSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBjdXN0b21lciBwb3J0YWwgTGFtYmRhXG4gICAgdGhpcy5wb3J0YWxGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1BvcnRhbEZ1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgJHthcHBOYW1lfS1zdHJpcGUtcG9ydGFsYCxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzExLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBURU5BTlRTX1RBQkxFX05BTUU6IHRlbmFudHNUYWJsZS50YWJsZU5hbWUsXG4gICAgICB9LFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUlubGluZShgXG5pbXBvcnQganNvblxuaW1wb3J0IGJvdG8zXG5pbXBvcnQgb3NcbmltcG9ydCBzdHJpcGVcbmltcG9ydCBsb2dnaW5nXG5cbmxvZ2dlciA9IGxvZ2dpbmcuZ2V0TG9nZ2VyKClcbmxvZ2dlci5zZXRMZXZlbChsb2dnaW5nLklORk8pXG5cbmR5bmFtb2RiID0gYm90bzMucmVzb3VyY2UoJ2R5bmFtb2RiJylcbnRhYmxlID0gZHluYW1vZGIuVGFibGUob3MuZW52aXJvblsnVEVOQU5UU19UQUJMRV9OQU1FJ10pXG5cbmRlZiBoYW5kbGVyKGV2ZW50LCBjb250ZXh0KTpcbiAgICB0cnk6XG4gICAgICAgIGJvZHkgPSBqc29uLmxvYWRzKGV2ZW50Wydib2R5J10pIGlmIGV2ZW50LmdldCgnYm9keScpIGVsc2Uge31cbiAgICAgICAgdGVuYW50X2lkID0gYm9keS5nZXQoJ3RlbmFudF9pZCcpXG4gICAgICAgIHJldHVybl91cmwgPSBib2R5LmdldCgncmV0dXJuX3VybCcsICdodHRwczovL2V4YW1wbGUuY29tJylcblxuICAgICAgICBpZiBub3QgdGVuYW50X2lkOlxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAnc3RhdHVzQ29kZSc6IDQwMCxcbiAgICAgICAgICAgICAgICAnaGVhZGVycyc6IHsnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nfSxcbiAgICAgICAgICAgICAgICAnYm9keSc6IGpzb24uZHVtcHMoeydlcnJvcic6ICd0ZW5hbnRfaWQgcmVxdWlyZWQnfSlcbiAgICAgICAgICAgIH1cblxuICAgICAgICAjIEdldCB0ZW5hbnQgaW5mb3JtYXRpb25cbiAgICAgICAgcmVzcG9uc2UgPSB0YWJsZS5nZXRfaXRlbShLZXk9eyd0ZW5hbnRfaWQnOiB0ZW5hbnRfaWR9KVxuICAgICAgICBpZiAnSXRlbScgbm90IGluIHJlc3BvbnNlOlxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAnc3RhdHVzQ29kZSc6IDQwNCxcbiAgICAgICAgICAgICAgICAnaGVhZGVycyc6IHsnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nfSxcbiAgICAgICAgICAgICAgICAnYm9keSc6IGpzb24uZHVtcHMoeydlcnJvcic6ICdUZW5hbnQgbm90IGZvdW5kJ30pXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgdGVuYW50ID0gcmVzcG9uc2VbJ0l0ZW0nXVxuICAgICAgICBjdXN0b21lcl9pZCA9IHRlbmFudC5nZXQoJ3N0cmlwZV9jdXN0b21lcl9pZCcpXG5cbiAgICAgICAgaWYgbm90IGN1c3RvbWVyX2lkOlxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAnc3RhdHVzQ29kZSc6IDQwMCxcbiAgICAgICAgICAgICAgICAnaGVhZGVycyc6IHsnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nfSxcbiAgICAgICAgICAgICAgICAnYm9keSc6IGpzb24uZHVtcHMoeydlcnJvcic6ICdObyBTdHJpcGUgY3VzdG9tZXIgZm91bmQgZm9yIHRlbmFudCd9KVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICMgQ3JlYXRlIHBvcnRhbCBzZXNzaW9uXG4gICAgICAgIHNlc3Npb24gPSBzdHJpcGUuYmlsbGluZ19wb3J0YWwuU2Vzc2lvbi5jcmVhdGUoXG4gICAgICAgICAgICBjdXN0b21lcj1jdXN0b21lcl9pZCxcbiAgICAgICAgICAgIHJldHVybl91cmw9cmV0dXJuX3VybCxcbiAgICAgICAgKVxuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAnc3RhdHVzQ29kZSc6IDIwMCxcbiAgICAgICAgICAgICdoZWFkZXJzJzoge1xuICAgICAgICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAnYm9keSc6IGpzb24uZHVtcHMoe1xuICAgICAgICAgICAgICAgICdwb3J0YWxfdXJsJzogc2Vzc2lvbi51cmxcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cblxuICAgIGV4Y2VwdCBFeGNlcHRpb24gYXMgZTpcbiAgICAgICAgbG9nZ2VyLmVycm9yKGZcIlBvcnRhbCBlcnJvcjoge3N0cihlKX1cIilcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICdzdGF0dXNDb2RlJzogNTAwLFxuICAgICAgICAgICAgJ2hlYWRlcnMnOiB7J0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJ30sXG4gICAgICAgICAgICAnYm9keSc6IGpzb24uZHVtcHMoeydlcnJvcic6ICdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3InfSlcbiAgICAgICAgfVxuYCksXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBEeW5hbW9EQiBwZXJtaXNzaW9uc1xuICAgIHRlbmFudHNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEodGhpcy5jaGVja291dEZ1bmN0aW9uKTtcbiAgICB0ZW5hbnRzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHRoaXMud2ViaG9va0Z1bmN0aW9uKTtcbiAgICB0ZW5hbnRzVGFibGUuZ3JhbnRSZWFkRGF0YSh0aGlzLnBvcnRhbEZ1bmN0aW9uKTtcblxuICAgIC8vIEdyYW50IFNTTSBwZXJtaXNzaW9ucyB0byB3ZWJob29rIGZ1bmN0aW9uXG4gICAgdGhpcy53ZWJob29rU2VjcmV0UGFyYW1ldGVyLmdyYW50UmVhZCh0aGlzLndlYmhvb2tGdW5jdGlvbik7XG5cbiAgICAvLyBHcmFudCBwZXJtaXNzaW9uIHRvIGludm9rZSB0aGUgcGF5bWVudCBzdWNjZXNzIGZ1bmN0aW9uXG4gICAgb25QYXltZW50U3VjY2Vzcy5ncmFudEludm9rZSh0aGlzLndlYmhvb2tGdW5jdGlvbik7XG5cbiAgICAvLyBDcmVhdGUgQVBJIEdhdGV3YXlcbiAgICB0aGlzLmFwaSA9IG5ldyBhcGlnYXRld2F5LlJlc3RBcGkodGhpcywgJ0JpbGxpbmdBUEknLCB7XG4gICAgICByZXN0QXBpTmFtZTogYCR7YXBwTmFtZX0tYmlsbGluZy1hcGlgLFxuICAgICAgZGVzY3JpcHRpb246IGBTdHJpcGUgYmlsbGluZyBBUEkgZm9yICR7YXBwTmFtZX1gLFxuICAgICAgZGVmYXVsdENvcnNQcmVmbGlnaHRPcHRpb25zOiB7XG4gICAgICAgIGFsbG93T3JpZ2luczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9PUklHSU5TLFxuICAgICAgICBhbGxvd01ldGhvZHM6IGFwaWdhdGV3YXkuQ29ycy5BTExfTUVUSE9EUyxcbiAgICAgICAgYWxsb3dIZWFkZXJzOiBbJ0NvbnRlbnQtVHlwZScsICdBdXRob3JpemF0aW9uJ10sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIGJpbGxpbmcgcmVzb3VyY2VcbiAgICBjb25zdCBiaWxsaW5nUmVzb3VyY2UgPSB0aGlzLmFwaS5yb290LmFkZFJlc291cmNlKCdiaWxsaW5nJyk7XG5cbiAgICAvLyBBZGQgY2hlY2tvdXQgZW5kcG9pbnRcbiAgICBjb25zdCBjaGVja291dFJlc291cmNlID0gYmlsbGluZ1Jlc291cmNlLmFkZFJlc291cmNlKCdjaGVja291dCcpO1xuICAgIGNoZWNrb3V0UmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24odGhpcy5jaGVja291dEZ1bmN0aW9uKSk7XG5cbiAgICAvLyBBZGQgd2ViaG9vayBlbmRwb2ludFxuICAgIGNvbnN0IHdlYmhvb2tSZXNvdXJjZSA9IGJpbGxpbmdSZXNvdXJjZS5hZGRSZXNvdXJjZSgnd2ViaG9vaycpO1xuICAgIHdlYmhvb2tSZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih0aGlzLndlYmhvb2tGdW5jdGlvbikpO1xuXG4gICAgLy8gQWRkIHBvcnRhbCBlbmRwb2ludFxuICAgIGNvbnN0IHBvcnRhbFJlc291cmNlID0gYmlsbGluZ1Jlc291cmNlLmFkZFJlc291cmNlKCdwb3J0YWwnKTtcbiAgICBwb3J0YWxSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHRoaXMucG9ydGFsRnVuY3Rpb24pKTtcblxuICAgIC8vIEFwcGx5IGNvbnNpc3RlbnQgdGFnZ2luZ1xuICAgIGNkay5UYWdzLm9mKHRoaXMpLmFkZCgnUHJvamVjdCcsIGFwcE5hbWUpO1xuICAgIGNkay5UYWdzLm9mKHRoaXMpLmFkZCgnTWFuYWdlZEJ5JywgJ2Nkay1haS1jb25zdHJ1Y3RzJyk7XG4gICAgY2RrLlRhZ3Mub2YodGhpcykuYWRkKCdPd25lcicsICdqb2huYXRoYW4taG9ybmVyJyk7XG4gICAgY2RrLlRhZ3Mub2YodGhpcykuYWRkKCdDb21wb25lbnQnLCAnU3RyaXBlQmlsbGluZycpO1xuXG4gICAgLy8gT3V0cHV0IGltcG9ydGFudCB2YWx1ZXNcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQmlsbGluZ0FwaVVybCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmFwaS51cmwsXG4gICAgICBkZXNjcmlwdGlvbjogJ0Jhc2UgVVJMIGZvciBiaWxsaW5nIEFQSScsXG4gICAgICBleHBvcnROYW1lOiBgJHtjZGsuU3RhY2sub2YodGhpcykuc3RhY2tOYW1lfS0ke2lkfS1CaWxsaW5nQXBpVXJsYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDaGVja291dEVuZHBvaW50Jywge1xuICAgICAgdmFsdWU6IGAke3RoaXMuYXBpLnVybH1iaWxsaW5nL2NoZWNrb3V0YCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ2hlY2tvdXQgc2Vzc2lvbiBjcmVhdGlvbiBlbmRwb2ludCcsXG4gICAgICBleHBvcnROYW1lOiBgJHtjZGsuU3RhY2sub2YodGhpcykuc3RhY2tOYW1lfS0ke2lkfS1DaGVja291dEVuZHBvaW50YCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdXZWJob29rRW5kcG9pbnQnLCB7XG4gICAgICB2YWx1ZTogYCR7dGhpcy5hcGkudXJsfWJpbGxpbmcvd2ViaG9va2AsXG4gICAgICBkZXNjcmlwdGlvbjogJ1N0cmlwZSB3ZWJob29rIGVuZHBvaW50JyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke2Nkay5TdGFjay5vZih0aGlzKS5zdGFja05hbWV9LSR7aWR9LVdlYmhvb2tFbmRwb2ludGAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUG9ydGFsRW5kcG9pbnQnLCB7XG4gICAgICB2YWx1ZTogYCR7dGhpcy5hcGkudXJsfWJpbGxpbmcvcG9ydGFsYCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ3VzdG9tZXIgcG9ydGFsIHNlc3Npb24gZW5kcG9pbnQnLFxuICAgICAgZXhwb3J0TmFtZTogYCR7Y2RrLlN0YWNrLm9mKHRoaXMpLnN0YWNrTmFtZX0tJHtpZH0tUG9ydGFsRW5kcG9pbnRgLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1RpZXJDb25maWd1cmF0aW9uJywge1xuICAgICAgdmFsdWU6IEpTT04uc3RyaW5naWZ5KHRpZXJzKSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUHJpY2luZyB0aWVyIGNvbmZpZ3VyYXRpb24nLFxuICAgICAgZXhwb3J0TmFtZTogYCR7Y2RrLlN0YWNrLm9mKHRoaXMpLnN0YWNrTmFtZX0tJHtpZH0tVGllckNvbmZpZ3VyYXRpb25gLFxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIEdyYW50IHBlcm1pc3Npb24gdG8gaW52b2tlIGNoZWNrb3V0IGZ1bmN0aW9uXG4gICAqIEBwYXJhbSBncmFudGVlIFRoZSBJQU0gcHJpbmNpcGFsIHRvIGdyYW50IHBlcm1pc3Npb25zIHRvXG4gICAqL1xuICBwdWJsaWMgZ3JhbnRDcmVhdGVDaGVja291dChncmFudGVlOiBpYW0uSUdyYW50YWJsZSk6IGlhbS5HcmFudCB7XG4gICAgcmV0dXJuIHRoaXMuY2hlY2tvdXRGdW5jdGlvbi5ncmFudEludm9rZShncmFudGVlKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHcmFudCBwZXJtaXNzaW9uIHRvIGludm9rZSBwb3J0YWwgZnVuY3Rpb25cbiAgICogQHBhcmFtIGdyYW50ZWUgVGhlIElBTSBwcmluY2lwYWwgdG8gZ3JhbnQgcGVybWlzc2lvbnMgdG9cbiAgICovXG4gIHB1YmxpYyBncmFudENyZWF0ZVBvcnRhbFNlc3Npb24oZ3JhbnRlZTogaWFtLklHcmFudGFibGUpOiBpYW0uR3JhbnQge1xuICAgIHJldHVybiB0aGlzLnBvcnRhbEZ1bmN0aW9uLmdyYW50SW52b2tlKGdyYW50ZWUpO1xuICB9XG59Il19