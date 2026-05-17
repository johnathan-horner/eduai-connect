"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BedrockAgentConstruct = void 0;
const iam = require("aws-cdk-lib/aws-iam");
const logs = require("aws-cdk-lib/aws-logs");
const cloudwatch = require("aws-cdk-lib/aws-cloudwatch");
const cloudwatchActions = require("aws-cdk-lib/aws-cloudwatch-actions");
const sns = require("aws-cdk-lib/aws-sns");
const cdk = require("aws-cdk-lib");
const constructs_1 = require("constructs");
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
class BedrockAgentConstruct extends constructs_1.Construct {
    /**
     * IAM role used by the Lambda function for Bedrock access
     */
    bedrockRole;
    /**
     * CloudWatch log group for Bedrock invocation logging
     */
    logGroup;
    /**
     * CloudWatch alarm for monitoring Lambda errors
     */
    errorAlarm;
    /**
     * The model ID being used by this agent
     */
    modelId;
    constructor(scope, id, props) {
        super(scope, id);
        const { modelId = 'anthropic.claude-3-haiku-20240307-v1:0', handler, allowedActions = ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'], logRetentionDays = 30, appName, errorNotificationTopicArn, } = props;
        this.modelId = modelId;
        // Create CloudWatch log group for Bedrock invocations
        this.logGroup = new logs.LogGroup(this, 'BedrockLogGroup', {
            logGroupName: `/aws/lambda/${handler.functionName}/bedrock`,
            retention: logRetentionDays === 30 ? logs.RetentionDays.ONE_MONTH :
                logRetentionDays === 7 ? logs.RetentionDays.ONE_WEEK :
                    logRetentionDays === 14 ? logs.RetentionDays.TWO_WEEKS :
                        logRetentionDays === 90 ? logs.RetentionDays.THREE_MONTHS :
                            logs.RetentionDays.ONE_MONTH,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
        // Create IAM role with least-privilege Bedrock permissions
        this.bedrockRole = new iam.Role(this, 'BedrockRole', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            description: `Role for ${appName} Bedrock operations`,
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
            ],
        });
        // Add Bedrock permissions
        this.bedrockRole.addToPolicy(new iam.PolicyStatement({
            sid: 'BedrockInvokePermissions',
            effect: iam.Effect.ALLOW,
            actions: allowedActions,
            resources: [
                `arn:aws:bedrock:${cdk.Stack.of(this).region}::foundation-model/${modelId}`,
                // Allow access to other Claude models in the same family
                `arn:aws:bedrock:${cdk.Stack.of(this).region}::foundation-model/anthropic.*`,
            ],
        }));
        // Grant CloudWatch Logs permissions
        this.logGroup.grantWrite(this.bedrockRole);
        // Update Lambda function with Bedrock configuration
        handler.addEnvironment('MODEL_ID', modelId);
        handler.addEnvironment('LOG_LEVEL', 'INFO');
        handler.addEnvironment('BEDROCK_LOG_GROUP', this.logGroup.logGroupName);
        // Grant the Lambda function the Bedrock role permissions
        this.bedrockRole.addToPolicy(new iam.PolicyStatement({
            sid: 'CloudWatchLogsPermissions',
            effect: iam.Effect.ALLOW,
            actions: [
                'logs:CreateLogStream',
                'logs:PutLogEvents',
                'logs:DescribeLogStreams',
            ],
            resources: [this.logGroup.logGroupArn],
        }));
        // Create CloudWatch alarm for Lambda errors
        this.errorAlarm = new cloudwatch.Alarm(this, 'ErrorAlarm', {
            alarmName: `${appName}-bedrock-lambda-errors`,
            alarmDescription: `Monitor errors in ${appName} Bedrock Lambda function`,
            metric: handler.metricErrors({
                period: cdk.Duration.minutes(5),
                statistic: 'Sum',
            }),
            threshold: 5,
            evaluationPeriods: 1,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
        // Add SNS notification if topic provided
        if (errorNotificationTopicArn) {
            const topic = sns.Topic.fromTopicArn(this, 'ErrorTopic', errorNotificationTopicArn);
            this.errorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(topic));
        }
        // Apply consistent tagging
        cdk.Tags.of(this).add('Project', appName);
        cdk.Tags.of(this).add('ManagedBy', 'cdk-ai-constructs');
        cdk.Tags.of(this).add('Owner', 'johnathan-horner');
        cdk.Tags.of(this).add('Component', 'BedrockAgent');
        // Output important values
        new cdk.CfnOutput(this, 'BedrockRoleArn', {
            value: this.bedrockRole.roleArn,
            description: 'ARN of the IAM role for Bedrock operations',
            exportName: `${cdk.Stack.of(this).stackName}-${id}-BedrockRoleArn`,
        });
        new cdk.CfnOutput(this, 'LogGroupName', {
            value: this.logGroup.logGroupName,
            description: 'Name of the CloudWatch log group for Bedrock logs',
            exportName: `${cdk.Stack.of(this).stackName}-${id}-LogGroupName`,
        });
        new cdk.CfnOutput(this, 'ModelId', {
            value: this.modelId,
            description: 'Bedrock model ID configured for this agent',
            exportName: `${cdk.Stack.of(this).stackName}-${id}-ModelId`,
        });
        new cdk.CfnOutput(this, 'ErrorAlarmArn', {
            value: this.errorAlarm.alarmArn,
            description: 'ARN of the CloudWatch alarm for monitoring errors',
            exportName: `${cdk.Stack.of(this).stackName}-${id}-ErrorAlarmArn`,
        });
    }
    /**
     * Grant additional Bedrock permissions to the role
     * @param actions Additional Bedrock actions to allow
     * @param resources Additional Bedrock resources (model ARNs) to allow access to
     */
    grantBedrockAccess(actions, resources) {
        const effectiveResources = resources || [
            `arn:aws:bedrock:${cdk.Stack.of(this).region}::foundation-model/*`,
        ];
        this.bedrockRole.addToPolicy(new iam.PolicyStatement({
            sid: 'AdditionalBedrockPermissions',
            effect: iam.Effect.ALLOW,
            actions: actions,
            resources: effectiveResources,
        }));
    }
    /**
     * Add additional CloudWatch metrics and alarms
     * @param metricName Name of the custom metric
     * @param threshold Alarm threshold
     * @param comparisonOperator Comparison operator for the alarm
     * @param handler Lambda function to monitor
     * @param appName Application name for alarm naming
     */
    addCustomMetricAlarm(metricName, threshold, handler, appName, comparisonOperator = cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD) {
        return new cloudwatch.Alarm(this, `${metricName}Alarm`, {
            alarmName: `${appName}-bedrock-${metricName}`,
            metric: new cloudwatch.Metric({
                namespace: 'AWS/Lambda',
                metricName: metricName,
                dimensionsMap: {
                    FunctionName: handler.functionName,
                },
                period: cdk.Duration.minutes(5),
                statistic: 'Sum',
            }),
            threshold: threshold,
            comparisonOperator: comparisonOperator,
            evaluationPeriods: 2,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
    }
}
exports.BedrockAgentConstruct = BedrockAgentConstruct;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmVkcm9jay1hZ2VudC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2NvbnN0cnVjdHMvYmVkcm9jay1hZ2VudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSwyQ0FBMkM7QUFDM0MsNkNBQTZDO0FBQzdDLHlEQUF5RDtBQUN6RCx3RUFBd0U7QUFDeEUsMkNBQTJDO0FBQzNDLG1DQUFtQztBQUNuQywyQ0FBdUM7QUEyQ3ZDOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0E4Qkc7QUFDSCxNQUFhLHFCQUFzQixTQUFRLHNCQUFTO0lBQ2xEOztPQUVHO0lBQ2EsV0FBVyxDQUFXO0lBRXRDOztPQUVHO0lBQ2EsUUFBUSxDQUFnQjtJQUV4Qzs7T0FFRztJQUNhLFVBQVUsQ0FBbUI7SUFFN0M7O09BRUc7SUFDYSxPQUFPLENBQVM7SUFFaEMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFpQztRQUN6RSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLE1BQU0sRUFDSixPQUFPLEdBQUcsd0NBQXdDLEVBQ2xELE9BQU8sRUFDUCxjQUFjLEdBQUcsQ0FBQyxxQkFBcUIsRUFBRSx1Q0FBdUMsQ0FBQyxFQUNqRixnQkFBZ0IsR0FBRyxFQUFFLEVBQ3JCLE9BQU8sRUFDUCx5QkFBeUIsR0FDMUIsR0FBRyxLQUFLLENBQUM7UUFFVixJQUFJLENBQUMsT0FBTyxHQUFHLE9BQU8sQ0FBQztRQUV2QixzREFBc0Q7UUFDdEQsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLGlCQUFpQixFQUFFO1lBQ3pELFlBQVksRUFBRSxlQUFlLE9BQU8sQ0FBQyxZQUFZLFVBQVU7WUFDM0QsU0FBUyxFQUFFLGdCQUFnQixLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxTQUFTLENBQUMsQ0FBQztnQkFDeEQsZ0JBQWdCLEtBQUssQ0FB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TztZQUNoQixTQUFTLEVBQUUsa0JBQWtCO1NBQzlCLENBQUMsQ0FDSCxDQUFDO0lBQ0osQ0FBQztJQUVEOzs7Ozs7O09BT0c7SUFDSSxvQkFBb0IsQ0FDekIsVUFBa0IsRUFDbEIsU0FBaUIsRUFDakIsT0FBd0IsRUFDeEIsT0FBZSxFQUNmLHFCQUFvRCxVQUFVLENBQUMsa0JBQWtCLENBQUMsc0JBQXNCO1FBRXhHLE9BQU8sSUFBSSxVQUFVLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxHQUFHLFVBQVUsT0FBTyxFQUFFO1lBQ3RELFNBQVMsRUFBRSxHQUFHLE9BQU8sWUFBWSxVQUFVLEVBQUU7WUFDN0MsTUFBTSxFQUFFLElBQUksVUFBVSxDQUFDLE1BQU0sQ0FBQztnQkFDNUIsU0FBUyxFQUFFLFlBQVk7Z0JBQ3ZCLFVBQVUsRUFBRSxVQUFVO2dCQUN0QixhQUFhLEVBQUU7b0JBQ2IsWUFBWSxFQUFFLE9BQU8sQ0FBQyxZQUFZO2lCQUNuQztnQkFDRCxNQUFNLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO2dCQUMvQixTQUFTLEVBQUUsS0FBSzthQUNqQixDQUFDO1lBQ0YsU0FBUyxFQUFFLFNBQVM7WUFDcEIsa0JBQWtCLEVBQUUsa0JBQWtCO1lBQ3RDLGlCQUFpQixFQUFFLENBQUM7WUFDcEIsZ0JBQWdCLEVBQUUsVUFBVSxDQUFDLGdCQUFnQixDQUFDLGFBQWE7U0FDNUQsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBbE1ELHNEQWtNQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxvZ3MnO1xuaW1wb3J0ICogYXMgY2xvdWR3YXRjaCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWR3YXRjaCc7XG5pbXBvcnQgKiBhcyBjbG91ZHdhdGNoQWN0aW9ucyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWR3YXRjaC1hY3Rpb25zJztcbmltcG9ydCAqIGFzIHNucyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc25zJztcbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcblxuLyoqXG4gKiBQcm9wZXJ0aWVzIGZvciBCZWRyb2NrQWdlbnRDb25zdHJ1Y3RcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBCZWRyb2NrQWdlbnRDb25zdHJ1Y3RQcm9wcyB7XG4gIC8qKlxuICAgKiBUaGUgQmVkcm9jayBtb2RlbCBJRCB0byB1c2UgZm9yIEFJIG9wZXJhdGlvbnNcbiAgICogQGRlZmF1bHQgXCJhbnRocm9waWMuY2xhdWRlLTMtaGFpa3UtMjAyNDAzMDctdjE6MFwiXG4gICAqL1xuICByZWFkb25seSBtb2RlbElkPzogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBMYW1iZGEgZnVuY3Rpb24gdGhhdCB3aWxsIGludm9rZSBCZWRyb2NrIHNlcnZpY2VzXG4gICAqIFRoZSBjb25zdHJ1Y3Qgd2lsbCBncmFudCB0aGlzIGZ1bmN0aW9uIHRoZSBuZWNlc3NhcnkgQmVkcm9jayBwZXJtaXNzaW9uc1xuICAgKi9cbiAgcmVhZG9ubHkgaGFuZGxlcjogbGFtYmRhLkZ1bmN0aW9uO1xuXG4gIC8qKlxuICAgKiBCZWRyb2NrIEFQSSBhY3Rpb25zIHRoaXMgZnVuY3Rpb24gaXMgYWxsb3dlZCB0byBwZXJmb3JtXG4gICAqIEBkZWZhdWx0IFtcImJlZHJvY2s6SW52b2tlTW9kZWxcIiwgXCJiZWRyb2NrOkludm9rZU1vZGVsV2l0aFJlc3BvbnNlU3RyZWFtXCJdXG4gICAqL1xuICByZWFkb25seSBhbGxvd2VkQWN0aW9ucz86IHN0cmluZ1tdO1xuXG4gIC8qKlxuICAgKiBDbG91ZFdhdGNoIGxvZyByZXRlbnRpb24gcGVyaW9kIGluIGRheXNcbiAgICogQGRlZmF1bHQgMzBcbiAgICovXG4gIHJlYWRvbmx5IGxvZ1JldGVudGlvbkRheXM/OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEFwcGxpY2F0aW9uIG5hbWUgZm9yIGNvbnNpc3RlbnQgdGFnZ2luZyBhbmQgbmFtaW5nXG4gICAqL1xuICByZWFkb25seSBhcHBOYW1lOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFNOUyB0b3BpYyBBUk4gZm9yIGVycm9yIG5vdGlmaWNhdGlvbnNcbiAgICogSWYgbm90IHByb3ZpZGVkLCBubyBlcnJvciBub3RpZmljYXRpb25zIHdpbGwgYmUgc2VudFxuICAgKiBAZGVmYXVsdCB1bmRlZmluZWRcbiAgICovXG4gIHJlYWRvbmx5IGVycm9yTm90aWZpY2F0aW9uVG9waWNBcm4/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogQSBjb25zdHJ1Y3QgdGhhdCBjb25maWd1cmVzIGEgTGFtYmRhIGZ1bmN0aW9uIHdpdGggdGhlIG5lY2Vzc2FyeSBwZXJtaXNzaW9ucyxcbiAqIGxvZ2dpbmcsIGFuZCBtb25pdG9yaW5nIGZvciBBbWF6b24gQmVkcm9jayBBSSBvcGVyYXRpb25zLlxuICpcbiAqIEZlYXR1cmVzOlxuICogLSBJQU0gcm9sZSB3aXRoIGxlYXN0LXByaXZpbGVnZSBCZWRyb2NrIHBlcm1pc3Npb25zXG4gKiAtIENsb3VkV2F0Y2ggbG9nIGdyb3VwIHdpdGggY29uZmlndXJhYmxlIHJldGVudGlvblxuICogLSBFbnZpcm9ubWVudCB2YXJpYWJsZXMgZm9yIG1vZGVsIGNvbmZpZ3VyYXRpb25cbiAqIC0gQ2xvdWRXYXRjaCBhbGFybSBmb3IgTGFtYmRhIGVycm9yIG1vbml0b3JpbmdcbiAqIC0gT3B0aW9uYWwgU05TIG5vdGlmaWNhdGlvbnMgZm9yIGNyaXRpY2FsIGVycm9yc1xuICpcbiAqIEBleGFtcGxlXG4gKiBgYGB0eXBlc2NyaXB0XG4gKiBjb25zdCBhaUxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0FJRnVuY3Rpb24nLCB7XG4gKiAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzExLFxuICogICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gKiAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnbGFtYmRhJyksXG4gKiB9KTtcbiAqXG4gKiBuZXcgQmVkcm9ja0FnZW50Q29uc3RydWN0KHRoaXMsICdCZWRyb2NrQWdlbnQnLCB7XG4gKiAgIGFwcE5hbWU6ICdNeUFJQXBwJyxcbiAqICAgaGFuZGxlcjogYWlMYW1iZGEsXG4gKiAgIG1vZGVsSWQ6ICdhbnRocm9waWMuY2xhdWRlLTMtc29ubmV0LTIwMjQwMjI5LXYxOjAnLFxuICogICBhbGxvd2VkQWN0aW9uczogW1xuICogICAgICdiZWRyb2NrOkludm9rZU1vZGVsJyxcbiAqICAgICAnYmVkcm9jazpJbnZva2VNb2RlbFdpdGhSZXNwb25zZVN0cmVhbScsXG4gKiAgICAgJ2JlZHJvY2s6R2V0TW9kZWwnXG4gKiAgIF1cbiAqIH0pO1xuICogYGBgXG4gKi9cbmV4cG9ydCBjbGFzcyBCZWRyb2NrQWdlbnRDb25zdHJ1Y3QgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICAvKipcbiAgICogSUFNIHJvbGUgdXNlZCBieSB0aGUgTGFtYmRhIGZ1bmN0aW9uIGZvciBCZWRyb2NrIGFjY2Vzc1xuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGJlZHJvY2tSb2xlOiBpYW0uUm9sZTtcblxuICAvKipcbiAgICogQ2xvdWRXYXRjaCBsb2cgZ3JvdXAgZm9yIEJlZHJvY2sgaW52b2NhdGlvbiBsb2dnaW5nXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgbG9nR3JvdXA6IGxvZ3MuTG9nR3JvdXA7XG5cbiAgLyoqXG4gICAqIENsb3VkV2F0Y2ggYWxhcm0gZm9yIG1vbml0b3JpbmcgTGFtYmRhIGVycm9yc1xuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGVycm9yQWxhcm06IGNsb3Vkd2F0Y2guQWxhcm07XG5cbiAgLyoqXG4gICAqIFRoZSBtb2RlbCBJRCBiZWluZyB1c2VkIGJ5IHRoaXMgYWdlbnRcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBtb2RlbElkOiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEJlZHJvY2tBZ2VudENvbnN0cnVjdFByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIGNvbnN0IHtcbiAgICAgIG1vZGVsSWQgPSAnYW50aHJvcGljLmNsYXVkZS0zLWhhaWt1LTIwMjQwMzA3LXYxOjAnLFxuICAgICAgaGFuZGxlcixcbiAgICAgIGFsbG93ZWRBY3Rpb25zID0gWydiZWRyb2NrOkludm9rZU1vZGVsJywgJ2JlZHJvY2s6SW52b2tlTW9kZWxXaXRoUmVzcG9uc2VTdHJlYW0nXSxcbiAgICAgIGxvZ1JldGVudGlvbkRheXMgPSAzMCxcbiAgICAgIGFwcE5hbWUsXG4gICAgICBlcnJvck5vdGlmaWNhdGlvblRvcGljQXJuLFxuICAgIH0gPSBwcm9wcztcblxuICAgIHRoaXMubW9kZWxJZCA9IG1vZGVsSWQ7XG5cbiAgICAvLyBDcmVhdGUgQ2xvdWRXYXRjaCBsb2cgZ3JvdXAgZm9yIEJlZHJvY2sgaW52b2NhdGlvbnNcbiAgICB0aGlzLmxvZ0dyb3VwID0gbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ0JlZHJvY2tMb2dHcm91cCcsIHtcbiAgICAgIGxvZ0dyb3VwTmFtZTogYC9hd3MvbGFtYmRhLyR7aGFuZGxlci5mdW5jdGlvbk5hbWV9L2JlZHJvY2tgLFxuICAgICAgcmV0ZW50aW9uOiBsb2dSZXRlbnRpb25EYXlzID09PSAzMCA/IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEggOlxuICAgICAgICAgICAgICAgICBsb2dSZXRlbnRpb25EYXlzID09PSA3ID8gbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLIDpcbiAgICAgICAgICAgICAgICAgbG9nUmV0ZW50aW9uRGF5cyA9PT0gMTQgPyBsb2dzLlJldGVudGlvbkRheXMuVFdPX1dFRUtTIDpcbiAgICAgICAgICAgICAgICAgbG9nUmV0ZW50aW9uRGF5cyA9PT0gOTAgPyBsb2dzLlJldGVudGlvbkRheXMuVEhSRUVfTU9OVEhTIDpcbiAgICAgICAgICAgICAgICAgbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgSUFNIHJvbGUgd2l0aCBsZWFzdC1wcml2aWxlZ2UgQmVkcm9jayBwZXJtaXNzaW9uc1xuICAgIHRoaXMuYmVkcm9ja1JvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0JlZHJvY2tSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2xhbWJkYS5hbWF6b25hd3MuY29tJyksXG4gICAgICBkZXNjcmlwdGlvbjogYFJvbGUgZm9yICR7YXBwTmFtZX0gQmVkcm9jayBvcGVyYXRpb25zYCxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUnKSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgQmVkcm9jayBwZXJtaXNzaW9uc1xuICAgIHRoaXMuYmVkcm9ja1JvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIHNpZDogJ0JlZHJvY2tJbnZva2VQZXJtaXNzaW9ucycsXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogYWxsb3dlZEFjdGlvbnMsXG4gICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgIGBhcm46YXdzOmJlZHJvY2s6JHtjZGsuU3RhY2sub2YodGhpcykucmVnaW9ufTo6Zm91bmRhdGlvbi1tb2RlbC8ke21vZGVsSWR9YCxcbiAgICAgICAgICAvLyBBbGxvdyBhY2Nlc3MgdG8gb3RoZXIgQ2xhdWRlIG1vZGVscyBpbiB0aGUgc2FtZSBmYW1pbHlcbiAgICAgICAgICBgYXJuOmF3czpiZWRyb2NrOiR7Y2RrLlN0YWNrLm9mKHRoaXMpLnJlZ2lvbn06OmZvdW5kYXRpb24tbW9kZWwvYW50aHJvcGljLipgLFxuICAgICAgICBdLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gR3JhbnQgQ2xvdWRXYXRjaCBMb2dzIHBlcm1pc3Npb25zXG4gICAgdGhpcy5sb2dHcm91cC5ncmFudFdyaXRlKHRoaXMuYmVkcm9ja1JvbGUpO1xuXG4gICAgLy8gVXBkYXRlIExhbWJkYSBmdW5jdGlvbiB3aXRoIEJlZHJvY2sgY29uZmlndXJhdGlvblxuICAgIGhhbmRsZXIuYWRkRW52aXJvbm1lbnQoJ01PREVMX0lEJywgbW9kZWxJZCk7XG4gICAgaGFuZGxlci5hZGRFbnZpcm9ubWVudCgnTE9HX0xFVkVMJywgJ0lORk8nKTtcbiAgICBoYW5kbGVyLmFkZEVudmlyb25tZW50KCdCRURST0NLX0xPR19HUk9VUCcsIHRoaXMubG9nR3JvdXAubG9nR3JvdXBOYW1lKTtcblxuICAgIC8vIEdyYW50IHRoZSBMYW1iZGEgZnVuY3Rpb24gdGhlIEJlZHJvY2sgcm9sZSBwZXJtaXNzaW9uc1xuICAgIHRoaXMuYmVkcm9ja1JvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIHNpZDogJ0Nsb3VkV2F0Y2hMb2dzUGVybWlzc2lvbnMnLFxuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAnbG9nczpDcmVhdGVMb2dTdHJlYW0nLFxuICAgICAgICAgICdsb2dzOlB1dExvZ0V2ZW50cycsXG4gICAgICAgICAgJ2xvZ3M6RGVzY3JpYmVMb2dTdHJlYW1zJyxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbdGhpcy5sb2dHcm91cC5sb2dHcm91cEFybl0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBDcmVhdGUgQ2xvdWRXYXRjaCBhbGFybSBmb3IgTGFtYmRhIGVycm9yc1xuICAgIHRoaXMuZXJyb3JBbGFybSA9IG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdFcnJvckFsYXJtJywge1xuICAgICAgYWxhcm1OYW1lOiBgJHthcHBOYW1lfS1iZWRyb2NrLWxhbWJkYS1lcnJvcnNgLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogYE1vbml0b3IgZXJyb3JzIGluICR7YXBwTmFtZX0gQmVkcm9jayBMYW1iZGEgZnVuY3Rpb25gLFxuICAgICAgbWV0cmljOiBoYW5kbGVyLm1ldHJpY0Vycm9ycyh7XG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICAgIHN0YXRpc3RpYzogJ1N1bScsXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogNSxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAxLFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgU05TIG5vdGlmaWNhdGlvbiBpZiB0b3BpYyBwcm92aWRlZFxuICAgIGlmIChlcnJvck5vdGlmaWNhdGlvblRvcGljQXJuKSB7XG4gICAgICBjb25zdCB0b3BpYyA9IHNucy5Ub3BpYy5mcm9tVG9waWNBcm4odGhpcywgJ0Vycm9yVG9waWMnLCBlcnJvck5vdGlmaWNhdGlvblRvcGljQXJuKTtcbiAgICAgIHRoaXMuZXJyb3JBbGFybS5hZGRBbGFybUFjdGlvbihuZXcgY2xvdWR3YXRjaEFjdGlvbnMuU25zQWN0aW9uKHRvcGljKSk7XG4gICAgfVxuXG4gICAgLy8gQXBwbHkgY29uc2lzdGVudCB0YWdnaW5nXG4gICAgY2RrLlRhZ3Mub2YodGhpcykuYWRkKCdQcm9qZWN0JywgYXBwTmFtZSk7XG4gICAgY2RrLlRhZ3Mub2YodGhpcykuYWRkKCdNYW5hZ2VkQnknLCAnY2RrLWFpLWNvbnN0cnVjdHMnKTtcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ093bmVyJywgJ2pvaG5hdGhhbi1ob3JuZXInKTtcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ0NvbXBvbmVudCcsICdCZWRyb2NrQWdlbnQnKTtcblxuICAgIC8vIE91dHB1dCBpbXBvcnRhbnQgdmFsdWVzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0JlZHJvY2tSb2xlQXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMuYmVkcm9ja1JvbGUucm9sZUFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVJOIG9mIHRoZSBJQU0gcm9sZSBmb3IgQmVkcm9jayBvcGVyYXRpb25zJyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke2Nkay5TdGFjay5vZih0aGlzKS5zdGFja05hbWV9LSR7aWR9LUJlZHJvY2tSb2xlQXJuYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdMb2dHcm91cE5hbWUnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5sb2dHcm91cC5sb2dHcm91cE5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ05hbWUgb2YgdGhlIENsb3VkV2F0Y2ggbG9nIGdyb3VwIGZvciBCZWRyb2NrIGxvZ3MnLFxuICAgICAgZXhwb3J0TmFtZTogYCR7Y2RrLlN0YWNrLm9mKHRoaXMpLnN0YWNrTmFtZX0tJHtpZH0tTG9nR3JvdXBOYW1lYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdNb2RlbElkJywge1xuICAgICAgdmFsdWU6IHRoaXMubW9kZWxJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQmVkcm9jayBtb2RlbCBJRCBjb25maWd1cmVkIGZvciB0aGlzIGFnZW50JyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke2Nkay5TdGFjay5vZih0aGlzKS5zdGFja05hbWV9LSR7aWR9LU1vZGVsSWRgLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0Vycm9yQWxhcm1Bcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5lcnJvckFsYXJtLmFsYXJtQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdBUk4gb2YgdGhlIENsb3VkV2F0Y2ggYWxhcm0gZm9yIG1vbml0b3JpbmcgZXJyb3JzJyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke2Nkay5TdGFjay5vZih0aGlzKS5zdGFja05hbWV9LSR7aWR9LUVycm9yQWxhcm1Bcm5gLFxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIEdyYW50IGFkZGl0aW9uYWwgQmVkcm9jayBwZXJtaXNzaW9ucyB0byB0aGUgcm9sZVxuICAgKiBAcGFyYW0gYWN0aW9ucyBBZGRpdGlvbmFsIEJlZHJvY2sgYWN0aW9ucyB0byBhbGxvd1xuICAgKiBAcGFyYW0gcmVzb3VyY2VzIEFkZGl0aW9uYWwgQmVkcm9jayByZXNvdXJjZXMgKG1vZGVsIEFSTnMpIHRvIGFsbG93IGFjY2VzcyB0b1xuICAgKi9cbiAgcHVibGljIGdyYW50QmVkcm9ja0FjY2VzcyhhY3Rpb25zOiBzdHJpbmdbXSwgcmVzb3VyY2VzPzogc3RyaW5nW10pOiB2b2lkIHtcbiAgICBjb25zdCBlZmZlY3RpdmVSZXNvdXJjZXMgPSByZXNvdXJjZXMgfHwgW1xuICAgICAgYGFybjphd3M6YmVkcm9jazoke2Nkay5TdGFjay5vZih0aGlzKS5yZWdpb259Ojpmb3VuZGF0aW9uLW1vZGVsLypgLFxuICAgIF07XG5cbiAgICB0aGlzLmJlZHJvY2tSb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBzaWQ6ICdBZGRpdGlvbmFsQmVkcm9ja1Blcm1pc3Npb25zJyxcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBhY3Rpb25zLFxuICAgICAgICByZXNvdXJjZXM6IGVmZmVjdGl2ZVJlc291cmNlcyxcbiAgICAgIH0pXG4gICAgKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBBZGQgYWRkaXRpb25hbCBDbG91ZFdhdGNoIG1ldHJpY3MgYW5kIGFsYXJtc1xuICAgKiBAcGFyYW0gbWV0cmljTmFtZSBOYW1lIG9mIHRoZSBjdXN0b20gbWV0cmljXG4gICAqIEBwYXJhbSB0aHJlc2hvbGQgQWxhcm0gdGhyZXNob2xkXG4gICAqIEBwYXJhbSBjb21wYXJpc29uT3BlcmF0b3IgQ29tcGFyaXNvbiBvcGVyYXRvciBmb3IgdGhlIGFsYXJtXG4gICAqIEBwYXJhbSBoYW5kbGVyIExhbWJkYSBmdW5jdGlvbiB0byBtb25pdG9yXG4gICAqIEBwYXJhbSBhcHBOYW1lIEFwcGxpY2F0aW9uIG5hbWUgZm9yIGFsYXJtIG5hbWluZ1xuICAgKi9cbiAgcHVibGljIGFkZEN1c3RvbU1ldHJpY0FsYXJtKFxuICAgIG1ldHJpY05hbWU6IHN0cmluZyxcbiAgICB0aHJlc2hvbGQ6IG51bWJlcixcbiAgICBoYW5kbGVyOiBsYW1iZGEuRnVuY3Rpb24sXG4gICAgYXBwTmFtZTogc3RyaW5nLFxuICAgIGNvbXBhcmlzb25PcGVyYXRvcjogY2xvdWR3YXRjaC5Db21wYXJpc29uT3BlcmF0b3IgPSBjbG91ZHdhdGNoLkNvbXBhcmlzb25PcGVyYXRvci5HUkVBVEVSX1RIQU5fVEhSRVNIT0xEXG4gICk6IGNsb3Vkd2F0Y2guQWxhcm0ge1xuICAgIHJldHVybiBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCBgJHttZXRyaWNOYW1lfUFsYXJtYCwge1xuICAgICAgYWxhcm1OYW1lOiBgJHthcHBOYW1lfS1iZWRyb2NrLSR7bWV0cmljTmFtZX1gLFxuICAgICAgbWV0cmljOiBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xuICAgICAgICBuYW1lc3BhY2U6ICdBV1MvTGFtYmRhJyxcbiAgICAgICAgbWV0cmljTmFtZTogbWV0cmljTmFtZSxcbiAgICAgICAgZGltZW5zaW9uc01hcDoge1xuICAgICAgICAgIEZ1bmN0aW9uTmFtZTogaGFuZGxlci5mdW5jdGlvbk5hbWUsXG4gICAgICAgIH0sXG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICAgIHN0YXRpc3RpYzogJ1N1bScsXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogdGhyZXNob2xkLFxuICAgICAgY29tcGFyaXNvbk9wZXJhdG9yOiBjb21wYXJpc29uT3BlcmF0b3IsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMixcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuICB9XG59Il19