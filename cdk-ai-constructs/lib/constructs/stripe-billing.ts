import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cdk from 'aws-cdk-lib';
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
export class StripeBilling extends Construct {
  /**
   * Lambda function for creating checkout sessions
   */
  public readonly checkoutFunction: lambda.Function;

  /**
   * Lambda function for handling Stripe webhooks
   */
  public readonly webhookFunction: lambda.Function;

  /**
   * Lambda function for creating customer portal sessions
   */
  public readonly portalFunction: lambda.Function;

  /**
   * API Gateway for billing endpoints
   */
  public readonly api: apigateway.RestApi;

  /**
   * SSM parameter for webhook secret
   */
  public readonly webhookSecretParameter: ssm.IStringParameter;

  constructor(scope: Construct, id: string, props: StripeBillingProps) {
    super(scope, id);

    const {
      appName,
      tiers,
      webhookSecret,
      successUrl,
      cancelUrl,
      onPaymentSuccess,
      tenantsTable,
      domainName,
      stripePublishableKey,
    } = props;

    // Create or reference SSM parameter for webhook secret
    this.webhookSecretParameter = ssm.StringParameter.fromStringParameterName(
      this,
      'WebhookSecret',
      webhookSecret
    );

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
  public grantCreateCheckout(grantee: iam.IGrantable): iam.Grant {
    return this.checkoutFunction.grantInvoke(grantee);
  }

  /**
   * Grant permission to invoke portal function
   * @param grantee The IAM principal to grant permissions to
   */
  public grantCreatePortalSession(grantee: iam.IGrantable): iam.Grant {
    return this.portalFunction.grantInvoke(grantee);
  }
}