import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';
/**
 * Properties for BedrockAgentConstruct
 */
export interface BedrockAgentConstructProps {
    /**
     * The Bedrock model ID to use for AI operations
     * @default "anthropic.claude-3-haiku-20240307-v1:0"
     */
    readonly modelId?: string;
    /**
     * Lambda function that will invoke Bedrock services
     * The construct will grant this function the necessary Bedrock permissions
     */
    readonly handler: lambda.Function;
    /**
     * Bedrock API actions this function is allowed to perform
     * @default ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
     */
    readonly allowedActions?: string[];
    /**
     * CloudWatch log retention period in days
     * @default 30
     */
    readonly logRetentionDays?: number;
    /**
     * Application name for consistent tagging and naming
     */
    readonly appName: string;
    /**
     * SNS topic ARN for error notifications
     * If not provided, no error notifications will be sent
     * @default undefined
     */
    readonly errorNotificationTopicArn?: string;
}
/**
 * A construct that configures a Lambda function with the necessary permissions,
 * logging, and monitoring for Amazon Bedrock AI operations.
 *
 * Features:
 * - IAM role with least-privilege Bedrock permissions
 * - CloudWatch log group with configurable retention
 * - Environment variables for model configuration
 * - CloudWatch alarm for Lambda error monitoring
 * - Optional SNS notifications for critical errors
 *
 * @example
 * ```typescript
 * const aiLambda = new lambda.Function(this, 'AIFunction', {
 *   runtime: lambda.Runtime.PYTHON_3_11,
 *   handler: 'index.handler',
 *   code: lambda.Code.fromAsset('lambda'),
 * });
 *
 * new BedrockAgentConstruct(this, 'BedrockAgent', {
 *   appName: 'MyAIApp',
 *   handler: aiLambda,
 *   modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
 *   allowedActions: [
 *     'bedrock:InvokeModel',
 *     'bedrock:InvokeModelWithResponseStream',
 *     'bedrock:GetModel'
 *   ]
 * });
 * ```
 */
export declare class BedrockAgentConstruct extends Construct {
    /**
     * IAM role used by the Lambda function for Bedrock access
     */
    readonly bedrockRole: iam.Role;
    /**
     * CloudWatch log group for Bedrock invocation logging
     */
    readonly logGroup: logs.LogGroup;
    /**
     * CloudWatch alarm for monitoring Lambda errors
     */
    readonly errorAlarm: cloudwatch.Alarm;
    /**
     * The model ID being used by this agent
     */
    readonly modelId: string;
    constructor(scope: Construct, id: string, props: BedrockAgentConstructProps);
    /**
     * Grant additional Bedrock permissions to the role
     * @param actions Additional Bedrock actions to allow
     * @param resources Additional Bedrock resources (model ARNs) to allow access to
     */
    grantBedrockAccess(actions: string[], resources?: string[]): void;
    /**
     * Add additional CloudWatch metrics and alarms
     * @param metricName Name of the custom metric
     * @param threshold Alarm threshold
     * @param comparisonOperator Comparison operator for the alarm
     * @param handler Lambda function to monitor
     * @param appName Application name for alarm naming
     */
    addCustomMetricAlarm(metricName: string, threshold: number, handler: lambda.Function, appName: string, comparisonOperator?: cloudwatch.ComparisonOperator): cloudwatch.Alarm;
}
