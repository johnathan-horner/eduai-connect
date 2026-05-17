import * as events from 'aws-cdk-lib/aws-events';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';
/**
 * Properties for EventDrivenPipeline construct
 */
export interface EventDrivenPipelineProps {
    /**
     * Name for the EventBridge rule
     */
    readonly ruleName: string;
    /**
     * EventBridge event pattern to match incoming events
     * @example
     * {
     *   source: ['myapp.orders'],
     *   'detail-type': ['Order Placed'],
     *   detail: {
     *     status: ['PENDING']
     *   }
     * }
     */
    readonly eventPattern: events.EventPattern;
    /**
     * Lambda function that will process matched events
     */
    readonly targetFunction: lambda.Function;
    /**
     * Dead letter queue retention period in days
     * @default 14
     */
    readonly dlqRetentionDays?: number;
    /**
     * Email address for DLQ alarm notifications
     * If provided, creates SNS topic and email subscription
     * @default undefined
     */
    readonly alarmEmail?: string;
    /**
     * Application name for consistent tagging and naming
     */
    readonly appName: string;
    /**
     * Maximum number of retry attempts before sending to DLQ
     * @default 3
     */
    readonly maxRetryAttempts?: number;
    /**
     * EventBridge bus to create the rule on
     * @default events.EventBus.fromEventBusName(this, 'DefaultBus', 'default')
     */
    readonly eventBus?: events.IEventBus;
}
/**
 * A construct that creates an event-driven processing pipeline with EventBridge,
 * Lambda, SQS dead letter queue, and CloudWatch monitoring.
 *
 * Features:
 * - EventBridge rule with customizable event patterns
 * - Lambda function target with proper IAM permissions
 * - SQS dead letter queue for failed processing
 * - CloudWatch alarm on DLQ message depth
 * - Optional SNS email notifications for DLQ alerts
 * - Configurable retry attempts and retention policies
 *
 * @example
 * ```typescript
 * const orderProcessor = new lambda.Function(this, 'OrderProcessor', {
 *   runtime: lambda.Runtime.PYTHON_3_11,
 *   handler: 'index.handler',
 *   code: lambda.Code.fromAsset('lambda'),
 * });
 *
 * new EventDrivenPipeline(this, 'OrderPipeline', {
 *   appName: 'ECommerce',
 *   ruleName: 'ProcessNewOrders',
 *   eventPattern: {
 *     source: ['ecommerce.orders'],
 *     'detail-type': ['Order Placed'],
 *     detail: {
 *       status: ['PENDING']
 *     }
 *   },
 *   targetFunction: orderProcessor,
 *   alarmEmail: 'admin@example.com'
 * });
 * ```
 */
export declare class EventDrivenPipeline extends Construct {
    /**
     * EventBridge rule that matches events
     */
    readonly eventRule: events.Rule;
    /**
     * Dead letter queue for failed event processing
     */
    readonly deadLetterQueue: sqs.Queue;
    /**
     * CloudWatch alarm for monitoring DLQ depth
     */
    readonly dlqAlarm: cloudwatch.Alarm;
    /**
     * SNS topic for alarm notifications (if email provided)
     */
    readonly alarmTopic?: sns.Topic;
    /**
     * EventBridge bus used for the rule
     */
    readonly eventBus: events.IEventBus;
    constructor(scope: Construct, id: string, props: EventDrivenPipelineProps);
    /**
     * Create additional CloudWatch monitoring for the pipeline
     * @param targetFunction The Lambda function being monitored
     * @param appName Application name
     * @param ruleName Rule name for alarm naming
     */
    private createAdditionalMonitoring;
    /**
     * Add an additional target to the EventBridge rule
     * @param target The target to add
     */
    addTarget(target: events.IRuleTarget): void;
    /**
     * Grant permissions to publish events to the event bus
     * @param grantee The IAM principal to grant permissions to
     */
    grantPutEvents(grantee: lambda.Function): void;
    /**
     * Grant permissions to consume messages from the dead letter queue
     * @param grantee The IAM principal to grant permissions to
     */
    grantConsumeMessages(grantee: lambda.Function): void;
    /**
     * Create a Lambda function to process DLQ messages
     * @param functionProps Properties for the DLQ processor function
     * @returns The created Lambda function
     */
    createDlqProcessor(functionProps: Omit<lambda.FunctionProps, 'events'>): lambda.Function;
}
