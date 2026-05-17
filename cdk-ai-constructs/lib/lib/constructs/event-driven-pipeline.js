"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventDrivenPipeline = void 0;
const events = require("aws-cdk-lib/aws-events");
const targets = require("aws-cdk-lib/aws-events-targets");
const lambda = require("aws-cdk-lib/aws-lambda");
const sqs = require("aws-cdk-lib/aws-sqs");
const lambdaEventSources = require("aws-cdk-lib/aws-lambda-event-sources");
const sns = require("aws-cdk-lib/aws-sns");
const snsSubscriptions = require("aws-cdk-lib/aws-sns-subscriptions");
const cloudwatch = require("aws-cdk-lib/aws-cloudwatch");
const cloudwatchActions = require("aws-cdk-lib/aws-cloudwatch-actions");
const cdk = require("aws-cdk-lib");
const constructs_1 = require("constructs");
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
class EventDrivenPipeline extends constructs_1.Construct {
    /**
     * EventBridge rule that matches events
     */
    eventRule;
    /**
     * Dead letter queue for failed event processing
     */
    deadLetterQueue;
    /**
     * CloudWatch alarm for monitoring DLQ depth
     */
    dlqAlarm;
    /**
     * SNS topic for alarm notifications (if email provided)
     */
    alarmTopic;
    /**
     * EventBridge bus used for the rule
     */
    eventBus;
    constructor(scope, id, props) {
        super(scope, id);
        const { ruleName, eventPattern, targetFunction, dlqRetentionDays = 14, alarmEmail, appName, maxRetryAttempts = 3, eventBus, } = props;
        // Use provided event bus or default
        this.eventBus = eventBus || events.EventBus.fromEventBusName(this, 'DefaultBus', 'default');
        // Create dead letter queue
        this.deadLetterQueue = new sqs.Queue(this, 'DeadLetterQueue', {
            queueName: `${ruleName}-dlq`,
            retentionPeriod: cdk.Duration.days(dlqRetentionDays),
            encryption: sqs.QueueEncryption.KMS_MANAGED,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
        // Create EventBridge rule
        this.eventRule = new events.Rule(this, 'EventRule', {
            ruleName: `${appName}-${ruleName}`,
            description: `Event rule for ${appName} - processes events matching specified pattern`,
            eventBus: this.eventBus,
            eventPattern: eventPattern,
            enabled: true,
        });
        // Add Lambda target with DLQ configuration
        this.eventRule.addTarget(new targets.LambdaFunction(targetFunction, {
            deadLetterQueue: this.deadLetterQueue,
            maxEventAge: cdk.Duration.hours(2),
            retryAttempts: maxRetryAttempts,
        }));
        // Create SNS topic for notifications if email provided
        if (alarmEmail) {
            this.alarmTopic = new sns.Topic(this, 'AlarmTopic', {
                topicName: `${appName}-${ruleName}-alerts`,
                displayName: `${appName} Event Pipeline Alerts`,
            });
            // Add email subscription
            this.alarmTopic.addSubscription(new snsSubscriptions.EmailSubscription(alarmEmail, {
                json: false,
            }));
        }
        // Create CloudWatch alarm for DLQ depth
        this.dlqAlarm = new cloudwatch.Alarm(this, 'DLQAlarm', {
            alarmName: `${appName}-${ruleName}-dlq-messages`,
            alarmDescription: `Monitor dead letter queue depth for ${appName} event pipeline`,
            metric: this.deadLetterQueue.metricApproximateNumberOfMessagesVisible({
                period: cdk.Duration.minutes(5),
                statistic: 'Maximum',
            }),
            threshold: 0,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
            evaluationPeriods: 1,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
        // Add SNS notification to alarm if topic exists
        if (this.alarmTopic) {
            this.dlqAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alarmTopic));
        }
        // Add additional monitoring metrics
        this.createAdditionalMonitoring(targetFunction, appName, ruleName);
        // Apply consistent tagging
        cdk.Tags.of(this).add('Project', appName);
        cdk.Tags.of(this).add('ManagedBy', 'cdk-ai-constructs');
        cdk.Tags.of(this).add('Owner', 'johnathan-horner');
        cdk.Tags.of(this).add('Component', 'EventPipeline');
        // Output important values
        new cdk.CfnOutput(this, 'EventRuleArn', {
            value: this.eventRule.ruleArn,
            description: 'ARN of the EventBridge rule',
            exportName: `${cdk.Stack.of(this).stackName}-${id}-EventRuleArn`,
        });
        new cdk.CfnOutput(this, 'EventRuleName', {
            value: this.eventRule.ruleName,
            description: 'Name of the EventBridge rule',
            exportName: `${cdk.Stack.of(this).stackName}-${id}-EventRuleName`,
        });
        new cdk.CfnOutput(this, 'DeadLetterQueueUrl', {
            value: this.deadLetterQueue.queueUrl,
            description: 'URL of the dead letter queue',
            exportName: `${cdk.Stack.of(this).stackName}-${id}-DeadLetterQueueUrl`,
        });
        new cdk.CfnOutput(this, 'DeadLetterQueueArn', {
            value: this.deadLetterQueue.queueArn,
            description: 'ARN of the dead letter queue',
            exportName: `${cdk.Stack.of(this).stackName}-${id}-DeadLetterQueueArn`,
        });
        if (this.alarmTopic) {
            new cdk.CfnOutput(this, 'AlarmTopicArn', {
                value: this.alarmTopic.topicArn,
                description: 'ARN of the SNS alarm topic',
                exportName: `${cdk.Stack.of(this).stackName}-${id}-AlarmTopicArn`,
            });
        }
    }
    /**
     * Create additional CloudWatch monitoring for the pipeline
     * @param targetFunction The Lambda function being monitored
     * @param appName Application name
     * @param ruleName Rule name for alarm naming
     */
    createAdditionalMonitoring(targetFunction, appName, ruleName) {
        // Lambda error rate alarm
        const errorAlarm = new cloudwatch.Alarm(this, 'LambdaErrorAlarm', {
            alarmName: `${appName}-${ruleName}-lambda-errors`,
            alarmDescription: `Monitor error rate for ${appName} event processing Lambda`,
            metric: targetFunction.metricErrors({
                period: cdk.Duration.minutes(5),
                statistic: 'Sum',
            }),
            threshold: 5,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
            evaluationPeriods: 2,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
        // Lambda duration alarm
        const durationAlarm = new cloudwatch.Alarm(this, 'LambdaDurationAlarm', {
            alarmName: `${appName}-${ruleName}-lambda-duration`,
            alarmDescription: `Monitor execution duration for ${appName} event processing Lambda`,
            metric: targetFunction.metricDuration({
                period: cdk.Duration.minutes(5),
                statistic: 'Average',
            }),
            threshold: targetFunction.timeout?.toMilliseconds() || 30000, // Use function timeout or 30s default
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
            evaluationPeriods: 3,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
        // Add alarm actions if SNS topic exists
        if (this.alarmTopic) {
            errorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alarmTopic));
            durationAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alarmTopic));
        }
    }
    /**
     * Add an additional target to the EventBridge rule
     * @param target The target to add
     */
    addTarget(target) {
        this.eventRule.addTarget(target);
    }
    /**
     * Grant permissions to publish events to the event bus
     * @param grantee The IAM principal to grant permissions to
     */
    grantPutEvents(grantee) {
        this.eventBus.grantPutEventsTo(grantee);
    }
    /**
     * Grant permissions to consume messages from the dead letter queue
     * @param grantee The IAM principal to grant permissions to
     */
    grantConsumeMessages(grantee) {
        this.deadLetterQueue.grantConsumeMessages(grantee);
    }
    /**
     * Create a Lambda function to process DLQ messages
     * @param functionProps Properties for the DLQ processor function
     * @returns The created Lambda function
     */
    createDlqProcessor(functionProps) {
        const dlqProcessor = new lambda.Function(this, 'DLQProcessor', {
            ...functionProps,
            description: `${functionProps.description || ''} - Processes messages from DLQ`.trim(),
        });
        // Add SQS event source
        dlqProcessor.addEventSource(new lambdaEventSources.SqsEventSource(this.deadLetterQueue, {
            batchSize: 1,
            maxBatchingWindow: cdk.Duration.minutes(5),
            reportBatchItemFailures: true,
        }));
        return dlqProcessor;
    }
}
exports.EventDrivenPipeline = EventDrivenPipeline;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXZlbnQtZHJpdmVuLXBpcGVsaW5lLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vY29uc3RydWN0cy9ldmVudC1kcml2ZW4tcGlwZWxpbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsaURBQWlEO0FBQ2pELDBEQUEwRDtBQUMxRCxpREFBaUQ7QUFDakQsMkNBQTJDO0FBQzNDLDJFQUEyRTtBQUMzRSwyQ0FBMkM7QUFDM0Msc0VBQXNFO0FBQ3RFLHlEQUF5RDtBQUN6RCx3RUFBd0U7QUFDeEUsbUNBQW1DO0FBQ25DLDJDQUF1QztBQTREdkM7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FrQ0c7QUFDSCxNQUFhLG1CQUFvQixTQUFRLHNCQUFTO0lBQ2hEOztPQUVHO0lBQ2EsU0FBUyxDQUFjO0lBRXZDOztPQUVHO0lBQ2EsZUFBZSxDQUFZO0lBRTNDOztPQUVHO0lBQ2EsUUFBUSxDQUFtQjtJQUUzQzs7T0FFRztJQUNhLFVBQVUsQ0FBYTtJQUV2Qzs7T0FFRztJQUNhLFFBQVEsQ0FBbUI7SUFFM0MsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUErQjtRQUN2RSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLE1BQU0sRUFDSixRQUFRLEVBQ1IsWUFBWSxFQUNaLGNBQWMsRUFDZCxnQkFBZ0IsR0FBRyxFQUFFLEVBQ3JCLFVBQVUsRUFDVixPQUFPLEVBQ1AsZ0JBQWdCLEdBQUcsQ0FBQyxFQUNwQixRQUFRLEdBQ1QsR0FBRyxLQUFLLENBQUM7UUFFVixvQ0FBb0M7UUFDcEMsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLElBQUksTUFBTSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLEVBQUUsWUFBWSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBRTVGLDJCQUEyQjtRQUMzQixJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVB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LENBQUM7SUFDbkMsQ0FBQztJQUVEOzs7T0FHRztJQUNJLGNBQWMsQ0FBQyxPQUF3QjtRQUM1QyxJQUFJLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQzFDLENBQUM7SUFFRDs7O09BR0c7SUFDSSxvQkFBb0IsQ0FBQyxPQUF3QjtRQUNsRCxJQUFJLENBQUMsZUFBZSxDQUFDLG9CQUFvQixDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ3JELENBQUM7SUFFRDs7OztPQUlHO0lBQ0ksa0JBQWtCLENBQUMsYUFBbUQ7UUFDM0UsTUFBTSxZQUFZLEdBQUcsSUFBSSxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxjQUFjLEVBQUU7WUFDN0QsR0FBRyxhQUFhO1lBQ2hCLFdBQVcsRUFBRSxHQUFHLGFBQWEsQ0FBQyxXQUFXLElBQUksRUFBRSxnQ0FBZ0MsQ0FBQyxJQUFJLEVBQUU7U0FDdkYsQ0FBQyxDQUFDO1FBRUgsdUJBQXVCO1FBQ3ZCLFlBQVksQ0FBQyxjQUFjLENBQ3pCLElBQUksa0JBQWtCLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUU7WUFDMUQsU0FBUyxFQUFFLENBQUM7WUFDWixpQkFBaUIsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDMUMsdUJBQXVCLEVBQUUsSUFBSTtTQUM5QixDQUFDLENBQ0gsQ0FBQztRQUVGLE9BQU8sWUFBWSxDQUFDO0lBQ3RCLENBQUM7Q0FDRjtBQTlPRCxrREE4T0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBldmVudHMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWV2ZW50cyc7XG5pbXBvcnQgKiBhcyB0YXJnZXRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1ldmVudHMtdGFyZ2V0cyc7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgKiBhcyBzcXMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNxcyc7XG5pbXBvcnQgKiBhcyBsYW1iZGFFdmVudFNvdXJjZXMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYS1ldmVudC1zb3VyY2VzJztcbmltcG9ydCAqIGFzIHNucyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc25zJztcbmltcG9ydCAqIGFzIHNuc1N1YnNjcmlwdGlvbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNucy1zdWJzY3JpcHRpb25zJztcbmltcG9ydCAqIGFzIGNsb3Vkd2F0Y2ggZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3Vkd2F0Y2gnO1xuaW1wb3J0ICogYXMgY2xvdWR3YXRjaEFjdGlvbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3Vkd2F0Y2gtYWN0aW9ucyc7XG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5cbi8qKlxuICogUHJvcGVydGllcyBmb3IgRXZlbnREcml2ZW5QaXBlbGluZSBjb25zdHJ1Y3RcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBFdmVudERyaXZlblBpcGVsaW5lUHJvcHMge1xuICAvKipcbiAgICogTmFtZSBmb3IgdGhlIEV2ZW50QnJpZGdlIHJ1bGVcbiAgICovXG4gIHJlYWRvbmx5IHJ1bGVOYW1lOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEV2ZW50QnJpZGdlIGV2ZW50IHBhdHRlcm4gdG8gbWF0Y2ggaW5jb21pbmcgZXZlbnRzXG4gICAqIEBleGFtcGxlXG4gICAqIHtcbiAgICogICBzb3VyY2U6IFsnbXlhcHAub3JkZXJzJ10sXG4gICAqICAgJ2RldGFpbC10eXBlJzogWydPcmRlciBQbGFjZWQnXSxcbiAgICogICBkZXRhaWw6IHtcbiAgICogICAgIHN0YXR1czogWydQRU5ESU5HJ11cbiAgICogICB9XG4gICAqIH1cbiAgICovXG4gIHJlYWRvbmx5IGV2ZW50UGF0dGVybjogZXZlbnRzLkV2ZW50UGF0dGVybjtcblxuICAvKipcbiAgICogTGFtYmRhIGZ1bmN0aW9uIHRoYXQgd2lsbCBwcm9jZXNzIG1hdGNoZWQgZXZlbnRzXG4gICAqL1xuICByZWFkb25seSB0YXJnZXRGdW5jdGlvbjogbGFtYmRhLkZ1bmN0aW9uO1xuXG4gIC8qKlxuICAgKiBEZWFkIGxldHRlciBxdWV1ZSByZXRlbnRpb24gcGVyaW9kIGluIGRheXNcbiAgICogQGRlZmF1bHQgMTRcbiAgICovXG4gIHJlYWRvbmx5IGRscVJldGVudGlvbkRheXM/OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEVtYWlsIGFkZHJlc3MgZm9yIERMUSBhbGFybSBub3RpZmljYXRpb25zXG4gICAqIElmIHByb3ZpZGVkLCBjcmVhdGVzIFNOUyB0b3BpYyBhbmQgZW1haWwgc3Vic2NyaXB0aW9uXG4gICAqIEBkZWZhdWx0IHVuZGVmaW5lZFxuICAgKi9cbiAgcmVhZG9ubHkgYWxhcm1FbWFpbD86IHN0cmluZztcblxuICAvKipcbiAgICogQXBwbGljYXRpb24gbmFtZSBmb3IgY29uc2lzdGVudCB0YWdnaW5nIGFuZCBuYW1pbmdcbiAgICovXG4gIHJlYWRvbmx5IGFwcE5hbWU6IHN0cmluZztcblxuICAvKipcbiAgICogTWF4aW11bSBudW1iZXIgb2YgcmV0cnkgYXR0ZW1wdHMgYmVmb3JlIHNlbmRpbmcgdG8gRExRXG4gICAqIEBkZWZhdWx0IDNcbiAgICovXG4gIHJlYWRvbmx5IG1heFJldHJ5QXR0ZW1wdHM/OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEV2ZW50QnJpZGdlIGJ1cyB0byBjcmVhdGUgdGhlIHJ1bGUgb25cbiAgICogQGRlZmF1bHQgZXZlbnRzLkV2ZW50QnVzLmZyb21FdmVudEJ1c05hbWUodGhpcywgJ0RlZmF1bHRCdXMnLCAnZGVmYXVsdCcpXG4gICAqL1xuICByZWFkb25seSBldmVudEJ1cz86IGV2ZW50cy5JRXZlbnRCdXM7XG59XG5cbi8qKlxuICogQSBjb25zdHJ1Y3QgdGhhdCBjcmVhdGVzIGFuIGV2ZW50LWRyaXZlbiBwcm9jZXNzaW5nIHBpcGVsaW5lIHdpdGggRXZlbnRCcmlkZ2UsXG4gKiBMYW1iZGEsIFNRUyBkZWFkIGxldHRlciBxdWV1ZSwgYW5kIENsb3VkV2F0Y2ggbW9uaXRvcmluZy5cbiAqXG4gKiBGZWF0dXJlczpcbiAqIC0gRXZlbnRCcmlkZ2UgcnVsZSB3aXRoIGN1c3RvbWl6YWJsZSBldmVudCBwYXR0ZXJuc1xuICogLSBMYW1iZGEgZnVuY3Rpb24gdGFyZ2V0IHdpdGggcHJvcGVyIElBTSBwZXJtaXNzaW9uc1xuICogLSBTUVMgZGVhZCBsZXR0ZXIgcXVldWUgZm9yIGZhaWxlZCBwcm9jZXNzaW5nXG4gKiAtIENsb3VkV2F0Y2ggYWxhcm0gb24gRExRIG1lc3NhZ2UgZGVwdGhcbiAqIC0gT3B0aW9uYWwgU05TIGVtYWlsIG5vdGlmaWNhdGlvbnMgZm9yIERMUSBhbGVydHNcbiAqIC0gQ29uZmlndXJhYmxlIHJldHJ5IGF0dGVtcHRzIGFuZCByZXRlbnRpb24gcG9saWNpZXNcbiAqXG4gKiBAZXhhbXBsZVxuICogYGBgdHlwZXNjcmlwdFxuICogY29uc3Qgb3JkZXJQcm9jZXNzb3IgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdPcmRlclByb2Nlc3NvcicsIHtcbiAqICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfMTEsXG4gKiAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAqICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCdsYW1iZGEnKSxcbiAqIH0pO1xuICpcbiAqIG5ldyBFdmVudERyaXZlblBpcGVsaW5lKHRoaXMsICdPcmRlclBpcGVsaW5lJywge1xuICogICBhcHBOYW1lOiAnRUNvbW1lcmNlJyxcbiAqICAgcnVsZU5hbWU6ICdQcm9jZXNzTmV3T3JkZXJzJyxcbiAqICAgZXZlbnRQYXR0ZXJuOiB7XG4gKiAgICAgc291cmNlOiBbJ2Vjb21tZXJjZS5vcmRlcnMnXSxcbiAqICAgICAnZGV0YWlsLXR5cGUnOiBbJ09yZGVyIFBsYWNlZCddLFxuICogICAgIGRldGFpbDoge1xuICogICAgICAgc3RhdHVzOiBbJ1BFTkRJTkcnXVxuICogICAgIH1cbiAqICAgfSxcbiAqICAgdGFyZ2V0RnVuY3Rpb246IG9yZGVyUHJvY2Vzc29yLFxuICogICBhbGFybUVtYWlsOiAnYWRtaW5AZXhhbXBsZS5jb20nXG4gKiB9KTtcbiAqIGBgYFxuICovXG5leHBvcnQgY2xhc3MgRXZlbnREcml2ZW5QaXBlbGluZSBleHRlbmRzIENvbnN0cnVjdCB7XG4gIC8qKlxuICAgKiBFdmVudEJyaWRnZSBydWxlIHRoYXQgbWF0Y2hlcyBldmVudHNcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBldmVudFJ1bGU6IGV2ZW50cy5SdWxlO1xuXG4gIC8qKlxuICAgKiBEZWFkIGxldHRlciBxdWV1ZSBmb3IgZmFpbGVkIGV2ZW50IHByb2Nlc3NpbmdcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBkZWFkTGV0dGVyUXVldWU6IHNxcy5RdWV1ZTtcblxuICAvKipcbiAgICogQ2xvdWRXYXRjaCBhbGFybSBmb3IgbW9uaXRvcmluZyBETFEgZGVwdGhcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBkbHFBbGFybTogY2xvdWR3YXRjaC5BbGFybTtcblxuICAvKipcbiAgICogU05TIHRvcGljIGZvciBhbGFybSBub3RpZmljYXRpb25zIChpZiBlbWFpbCBwcm92aWRlZClcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBhbGFybVRvcGljPzogc25zLlRvcGljO1xuXG4gIC8qKlxuICAgKiBFdmVudEJyaWRnZSBidXMgdXNlZCBmb3IgdGhlIHJ1bGVcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBldmVudEJ1czogZXZlbnRzLklFdmVudEJ1cztcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogRXZlbnREcml2ZW5QaXBlbGluZVByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIGNvbnN0IHtcbiAgICAgIHJ1bGVOYW1lLFxuICAgICAgZXZlbnRQYXR0ZXJuLFxuICAgICAgdGFyZ2V0RnVuY3Rpb24sXG4gICAgICBkbHFSZXRlbnRpb25EYXlzID0gMTQsXG4gICAgICBhbGFybUVtYWlsLFxuICAgICAgYXBwTmFtZSxcbiAgICAgIG1heFJldHJ5QXR0ZW1wdHMgPSAzLFxuICAgICAgZXZlbnRCdXMsXG4gICAgfSA9IHByb3BzO1xuXG4gICAgLy8gVXNlIHByb3ZpZGVkIGV2ZW50IGJ1cyBvciBkZWZhdWx0XG4gICAgdGhpcy5ldmVudEJ1cyA9IGV2ZW50QnVzIHx8IGV2ZW50cy5FdmVudEJ1cy5mcm9tRXZlbnRCdXNOYW1lKHRoaXMsICdEZWZhdWx0QnVzJywgJ2RlZmF1bHQnKTtcblxuICAgIC8vIENyZWF0ZSBkZWFkIGxldHRlciBxdWV1ZVxuICAgIHRoaXMuZGVhZExldHRlclF1ZXVlID0gbmV3IHNxcy5RdWV1ZSh0aGlzLCAnRGVhZExldHRlclF1ZXVlJywge1xuICAgICAgcXVldWVOYW1lOiBgJHtydWxlTmFtZX0tZGxxYCxcbiAgICAgIHJldGVudGlvblBlcmlvZDogY2RrLkR1cmF0aW9uLmRheXMoZGxxUmV0ZW50aW9uRGF5cyksXG4gICAgICBlbmNyeXB0aW9uOiBzcXMuUXVldWVFbmNyeXB0aW9uLktNU19NQU5BR0VELFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBFdmVudEJyaWRnZSBydWxlXG4gICAgdGhpcy5ldmVudFJ1bGUgPSBuZXcgZXZlbnRzLlJ1bGUodGhpcywgJ0V2ZW50UnVsZScsIHtcbiAgICAgIHJ1bGVOYW1lOiBgJHthcHBOYW1lfS0ke3J1bGVOYW1lfWAsXG4gICAgICBkZXNjcmlwdGlvbjogYEV2ZW50IHJ1bGUgZm9yICR7YXBwTmFtZX0gLSBwcm9jZXNzZXMgZXZlbnRzIG1hdGNoaW5nIHNwZWNpZmllZCBwYXR0ZXJuYCxcbiAgICAgIGV2ZW50QnVzOiB0aGlzLmV2ZW50QnVzLFxuICAgICAgZXZlbnRQYXR0ZXJuOiBldmVudFBhdHRlcm4sXG4gICAgICBlbmFibGVkOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIExhbWJkYSB0YXJnZXQgd2l0aCBETFEgY29uZmlndXJhdGlvblxuICAgIHRoaXMuZXZlbnRSdWxlLmFkZFRhcmdldChcbiAgICAgIG5ldyB0YXJnZXRzLkxhbWJkYUZ1bmN0aW9uKHRhcmdldEZ1bmN0aW9uLCB7XG4gICAgICAgIGRlYWRMZXR0ZXJRdWV1ZTogdGhpcy5kZWFkTGV0dGVyUXVldWUsXG4gICAgICAgIG1heEV2ZW50QWdlOiBjZGsuRHVyYXRpb24uaG91cnMoMiksXG4gICAgICAgIHJldHJ5QXR0ZW1wdHM6IG1heFJldHJ5QXR0ZW1wdHMsXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBDcmVhdGUgU05TIHRvcGljIGZvciBub3RpZmljYXRpb25zIGlmIGVtYWlsIHByb3ZpZGVkXG4gICAgaWYgKGFsYXJtRW1haWwpIHtcbiAgICAgIHRoaXMuYWxhcm1Ub3BpYyA9IG5ldyBzbnMuVG9waWModGhpcywgJ0FsYXJtVG9waWMnLCB7XG4gICAgICAgIHRvcGljTmFtZTogYCR7YXBwTmFtZX0tJHtydWxlTmFtZX0tYWxlcnRzYCxcbiAgICAgICAgZGlzcGxheU5hbWU6IGAke2FwcE5hbWV9IEV2ZW50IFBpcGVsaW5lIEFsZXJ0c2AsXG4gICAgICB9KTtcblxuICAgICAgLy8gQWRkIGVtYWlsIHN1YnNjcmlwdGlvblxuICAgICAgdGhpcy5hbGFybVRvcGljLmFkZFN1YnNjcmlwdGlvbihcbiAgICAgICAgbmV3IHNuc1N1YnNjcmlwdGlvbnMuRW1haWxTdWJzY3JpcHRpb24oYWxhcm1FbWFpbCwge1xuICAgICAgICAgIGpzb246IGZhbHNlLFxuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9XG5cbiAgICAvLyBDcmVhdGUgQ2xvdWRXYXRjaCBhbGFybSBmb3IgRExRIGRlcHRoXG4gICAgdGhpcy5kbHFBbGFybSA9IG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdETFFBbGFybScsIHtcbiAgICAgIGFsYXJtTmFtZTogYCR7YXBwTmFtZX0tJHtydWxlTmFtZX0tZGxxLW1lc3NhZ2VzYCxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246IGBNb25pdG9yIGRlYWQgbGV0dGVyIHF1ZXVlIGRlcHRoIGZvciAke2FwcE5hbWV9IGV2ZW50IHBpcGVsaW5lYCxcbiAgICAgIG1ldHJpYzogdGhpcy5kZWFkTGV0dGVyUXVldWUubWV0cmljQXBwcm94aW1hdGVOdW1iZXJPZk1lc3NhZ2VzVmlzaWJsZSh7XG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICAgIHN0YXRpc3RpYzogJ01heGltdW0nLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDAsXG4gICAgICBjb21wYXJpc29uT3BlcmF0b3I6IGNsb3Vkd2F0Y2guQ29tcGFyaXNvbk9wZXJhdG9yLkdSRUFURVJfVEhBTl9USFJFU0hPTEQsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIFNOUyBub3RpZmljYXRpb24gdG8gYWxhcm0gaWYgdG9waWMgZXhpc3RzXG4gICAgaWYgKHRoaXMuYWxhcm1Ub3BpYykge1xuICAgICAgdGhpcy5kbHFBbGFybS5hZGRBbGFybUFjdGlvbihuZXcgY2xvdWR3YXRjaEFjdGlvbnMuU25zQWN0aW9uKHRoaXMuYWxhcm1Ub3BpYykpO1xuICAgIH1cblxuICAgIC8vIEFkZCBhZGRpdGlvbmFsIG1vbml0b3JpbmcgbWV0cmljc1xuICAgIHRoaXMuY3JlYXRlQWRkaXRpb25hbE1vbml0b3JpbmcodGFyZ2V0RnVuY3Rpb24sIGFwcE5hbWUsIHJ1bGVOYW1lKTtcblxuICAgIC8vIEFwcGx5IGNvbnNpc3RlbnQgdGFnZ2luZ1xuICAgIGNkay5UYWdzLm9mKHRoaXMpLmFkZCgnUHJvamVjdCcsIGFwcE5hbWUpO1xuICAgIGNkay5UYWdzLm9mKHRoaXMpLmFkZCgnTWFuYWdlZEJ5JywgJ2Nkay1haS1jb25zdHJ1Y3RzJyk7XG4gICAgY2RrLlRhZ3Mub2YodGhpcykuYWRkKCdPd25lcicsICdqb2huYXRoYW4taG9ybmVyJyk7XG4gICAgY2RrLlRhZ3Mub2YodGhpcykuYWRkKCdDb21wb25lbnQnLCAnRXZlbnRQaXBlbGluZScpO1xuXG4gICAgLy8gT3V0cHV0IGltcG9ydGFudCB2YWx1ZXNcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRXZlbnRSdWxlQXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMuZXZlbnRSdWxlLnJ1bGVBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0FSTiBvZiB0aGUgRXZlbnRCcmlkZ2UgcnVsZScsXG4gICAgICBleHBvcnROYW1lOiBgJHtjZGsuU3RhY2sub2YodGhpcykuc3RhY2tOYW1lfS0ke2lkfS1FdmVudFJ1bGVBcm5gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0V2ZW50UnVsZU5hbWUnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5ldmVudFJ1bGUucnVsZU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ05hbWUgb2YgdGhlIEV2ZW50QnJpZGdlIHJ1bGUnLFxuICAgICAgZXhwb3J0TmFtZTogYCR7Y2RrLlN0YWNrLm9mKHRoaXMpLnN0YWNrTmFtZX0tJHtpZH0tRXZlbnRSdWxlTmFtZWAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRGVhZExldHRlclF1ZXVlVXJsJywge1xuICAgICAgdmFsdWU6IHRoaXMuZGVhZExldHRlclF1ZXVlLnF1ZXVlVXJsLFxuICAgICAgZGVzY3JpcHRpb246ICdVUkwgb2YgdGhlIGRlYWQgbGV0dGVyIHF1ZXVlJyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke2Nkay5TdGFjay5vZih0aGlzKS5zdGFja05hbWV9LSR7aWR9LURlYWRMZXR0ZXJRdWV1ZVVybGAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRGVhZExldHRlclF1ZXVlQXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMuZGVhZExldHRlclF1ZXVlLnF1ZXVlQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdBUk4gb2YgdGhlIGRlYWQgbGV0dGVyIHF1ZXVlJyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke2Nkay5TdGFjay5vZih0aGlzKS5zdGFja05hbWV9LSR7aWR9LURlYWRMZXR0ZXJRdWV1ZUFybmAsXG4gICAgfSk7XG5cbiAgICBpZiAodGhpcy5hbGFybVRvcGljKSB7XG4gICAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQWxhcm1Ub3BpY0FybicsIHtcbiAgICAgICAgdmFsdWU6IHRoaXMuYWxhcm1Ub3BpYy50b3BpY0FybixcbiAgICAgICAgZGVzY3JpcHRpb246ICdBUk4gb2YgdGhlIFNOUyBhbGFybSB0b3BpYycsXG4gICAgICAgIGV4cG9ydE5hbWU6IGAke2Nkay5TdGFjay5vZih0aGlzKS5zdGFja05hbWV9LSR7aWR9LUFsYXJtVG9waWNBcm5gLFxuICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBhZGRpdGlvbmFsIENsb3VkV2F0Y2ggbW9uaXRvcmluZyBmb3IgdGhlIHBpcGVsaW5lXG4gICAqIEBwYXJhbSB0YXJnZXRGdW5jdGlvbiBUaGUgTGFtYmRhIGZ1bmN0aW9uIGJlaW5nIG1vbml0b3JlZFxuICAgKiBAcGFyYW0gYXBwTmFtZSBBcHBsaWNhdGlvbiBuYW1lXG4gICAqIEBwYXJhbSBydWxlTmFtZSBSdWxlIG5hbWUgZm9yIGFsYXJtIG5hbWluZ1xuICAgKi9cbiAgcHJpdmF0ZSBjcmVhdGVBZGRpdGlvbmFsTW9uaXRvcmluZyhcbiAgICB0YXJnZXRGdW5jdGlvbjogbGFtYmRhLkZ1bmN0aW9uLFxuICAgIGFwcE5hbWU6IHN0cmluZyxcbiAgICBydWxlTmFtZTogc3RyaW5nXG4gICk6IHZvaWQge1xuICAgIC8vIExhbWJkYSBlcnJvciByYXRlIGFsYXJtXG4gICAgY29uc3QgZXJyb3JBbGFybSA9IG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdMYW1iZGFFcnJvckFsYXJtJywge1xuICAgICAgYWxhcm1OYW1lOiBgJHthcHBOYW1lfS0ke3J1bGVOYW1lfS1sYW1iZGEtZXJyb3JzYCxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246IGBNb25pdG9yIGVycm9yIHJhdGUgZm9yICR7YXBwTmFtZX0gZXZlbnQgcHJvY2Vzc2luZyBMYW1iZGFgLFxuICAgICAgbWV0cmljOiB0YXJnZXRGdW5jdGlvbi5tZXRyaWNFcnJvcnMoe1xuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgICBzdGF0aXN0aWM6ICdTdW0nLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDUsXG4gICAgICBjb21wYXJpc29uT3BlcmF0b3I6IGNsb3Vkd2F0Y2guQ29tcGFyaXNvbk9wZXJhdG9yLkdSRUFURVJfVEhBTl9PUl9FUVVBTF9UT19USFJFU0hPTEQsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMixcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuXG4gICAgLy8gTGFtYmRhIGR1cmF0aW9uIGFsYXJtXG4gICAgY29uc3QgZHVyYXRpb25BbGFybSA9IG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdMYW1iZGFEdXJhdGlvbkFsYXJtJywge1xuICAgICAgYWxhcm1OYW1lOiBgJHthcHBOYW1lfS0ke3J1bGVOYW1lfS1sYW1iZGEtZHVyYXRpb25gLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogYE1vbml0b3IgZXhlY3V0aW9uIGR1cmF0aW9uIGZvciAke2FwcE5hbWV9IGV2ZW50IHByb2Nlc3NpbmcgTGFtYmRhYCxcbiAgICAgIG1ldHJpYzogdGFyZ2V0RnVuY3Rpb24ubWV0cmljRHVyYXRpb24oe1xuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgICBzdGF0aXN0aWM6ICdBdmVyYWdlJyxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiB0YXJnZXRGdW5jdGlvbi50aW1lb3V0Py50b01pbGxpc2Vjb25kcygpIHx8IDMwMDAwLCAvLyBVc2UgZnVuY3Rpb24gdGltZW91dCBvciAzMHMgZGVmYXVsdFxuICAgICAgY29tcGFyaXNvbk9wZXJhdG9yOiBjbG91ZHdhdGNoLkNvbXBhcmlzb25PcGVyYXRvci5HUkVBVEVSX1RIQU5fVEhSRVNIT0xELFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDMsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICB9KTtcblxuICAgIC8vIEFkZCBhbGFybSBhY3Rpb25zIGlmIFNOUyB0b3BpYyBleGlzdHNcbiAgICBpZiAodGhpcy5hbGFybVRvcGljKSB7XG4gICAgICBlcnJvckFsYXJtLmFkZEFsYXJtQWN0aW9uKG5ldyBjbG91ZHdhdGNoQWN0aW9ucy5TbnNBY3Rpb24odGhpcy5hbGFybVRvcGljKSk7XG4gICAgICBkdXJhdGlvbkFsYXJtLmFkZEFsYXJtQWN0aW9uKG5ldyBjbG91ZHdhdGNoQWN0aW9ucy5TbnNBY3Rpb24odGhpcy5hbGFybVRvcGljKSk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEFkZCBhbiBhZGRpdGlvbmFsIHRhcmdldCB0byB0aGUgRXZlbnRCcmlkZ2UgcnVsZVxuICAgKiBAcGFyYW0gdGFyZ2V0IFRoZSB0YXJnZXQgdG8gYWRkXG4gICAqL1xuICBwdWJsaWMgYWRkVGFyZ2V0KHRhcmdldDogZXZlbnRzLklSdWxlVGFyZ2V0KTogdm9pZCB7XG4gICAgdGhpcy5ldmVudFJ1bGUuYWRkVGFyZ2V0KHRhcmdldCk7XG4gIH1cblxuICAvKipcbiAgICogR3JhbnQgcGVybWlzc2lvbnMgdG8gcHVibGlzaCBldmVudHMgdG8gdGhlIGV2ZW50IGJ1c1xuICAgKiBAcGFyYW0gZ3JhbnRlZSBUaGUgSUFNIHByaW5jaXBhbCB0byBncmFudCBwZXJtaXNzaW9ucyB0b1xuICAgKi9cbiAgcHVibGljIGdyYW50UHV0RXZlbnRzKGdyYW50ZWU6IGxhbWJkYS5GdW5jdGlvbik6IHZvaWQge1xuICAgIHRoaXMuZXZlbnRCdXMuZ3JhbnRQdXRFdmVudHNUbyhncmFudGVlKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHcmFudCBwZXJtaXNzaW9ucyB0byBjb25zdW1lIG1lc3NhZ2VzIGZyb20gdGhlIGRlYWQgbGV0dGVyIHF1ZXVlXG4gICAqIEBwYXJhbSBncmFudGVlIFRoZSBJQU0gcHJpbmNpcGFsIHRvIGdyYW50IHBlcm1pc3Npb25zIHRvXG4gICAqL1xuICBwdWJsaWMgZ3JhbnRDb25zdW1lTWVzc2FnZXMoZ3JhbnRlZTogbGFtYmRhLkZ1bmN0aW9uKTogdm9pZCB7XG4gICAgdGhpcy5kZWFkTGV0dGVyUXVldWUuZ3JhbnRDb25zdW1lTWVzc2FnZXMoZ3JhbnRlZSk7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIGEgTGFtYmRhIGZ1bmN0aW9uIHRvIHByb2Nlc3MgRExRIG1lc3NhZ2VzXG4gICAqIEBwYXJhbSBmdW5jdGlvblByb3BzIFByb3BlcnRpZXMgZm9yIHRoZSBETFEgcHJvY2Vzc29yIGZ1bmN0aW9uXG4gICAqIEByZXR1cm5zIFRoZSBjcmVhdGVkIExhbWJkYSBmdW5jdGlvblxuICAgKi9cbiAgcHVibGljIGNyZWF0ZURscVByb2Nlc3NvcihmdW5jdGlvblByb3BzOiBPbWl0PGxhbWJkYS5GdW5jdGlvblByb3BzLCAnZXZlbnRzJz4pOiBsYW1iZGEuRnVuY3Rpb24ge1xuICAgIGNvbnN0IGRscVByb2Nlc3NvciA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0RMUVByb2Nlc3NvcicsIHtcbiAgICAgIC4uLmZ1bmN0aW9uUHJvcHMsXG4gICAgICBkZXNjcmlwdGlvbjogYCR7ZnVuY3Rpb25Qcm9wcy5kZXNjcmlwdGlvbiB8fCAnJ30gLSBQcm9jZXNzZXMgbWVzc2FnZXMgZnJvbSBETFFgLnRyaW0oKSxcbiAgICB9KTtcblxuICAgIC8vIEFkZCBTUVMgZXZlbnQgc291cmNlXG4gICAgZGxxUHJvY2Vzc29yLmFkZEV2ZW50U291cmNlKFxuICAgICAgbmV3IGxhbWJkYUV2ZW50U291cmNlcy5TcXNFdmVudFNvdXJjZSh0aGlzLmRlYWRMZXR0ZXJRdWV1ZSwge1xuICAgICAgICBiYXRjaFNpemU6IDEsXG4gICAgICAgIG1heEJhdGNoaW5nV2luZG93OiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgICAgcmVwb3J0QmF0Y2hJdGVtRmFpbHVyZXM6IHRydWUsXG4gICAgICB9KVxuICAgICk7XG5cbiAgICByZXR1cm4gZGxxUHJvY2Vzc29yO1xuICB9XG59Il19