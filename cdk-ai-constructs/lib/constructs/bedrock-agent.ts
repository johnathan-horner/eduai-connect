import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cdk from 'aws-cdk-lib';
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
export class BedrockAgentConstruct extends Construct {
  /**
   * IAM role used by the Lambda function for Bedrock access
   */
  public readonly bedrockRole: iam.Role;

  /**
   * CloudWatch log group for Bedrock invocation logging
   */
  public readonly logGroup: logs.LogGroup;

  /**
   * CloudWatch alarm for monitoring Lambda errors
   */
  public readonly errorAlarm: cloudwatch.Alarm;

  /**
   * The model ID being used by this agent
   */
  public readonly modelId: string;

  constructor(scope: Construct, id: string, props: BedrockAgentConstructProps) {
    super(scope, id);

    const {
      modelId = 'anthropic.claude-3-haiku-20240307-v1:0',
      handler,
      allowedActions = ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
      logRetentionDays = 30,
      appName,
      errorNotificationTopicArn,
    } = props;

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
    this.bedrockRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'BedrockInvokePermissions',
        effect: iam.Effect.ALLOW,
        actions: allowedActions,
        resources: [
          `arn:aws:bedrock:${cdk.Stack.of(this).region}::foundation-model/${modelId}`,
          // Allow access to other Claude models in the same family
          `arn:aws:bedrock:${cdk.Stack.of(this).region}::foundation-model/anthropic.*`,
        ],
      })
    );

    // Grant CloudWatch Logs permissions
    this.logGroup.grantWrite(this.bedrockRole);

    // Update Lambda function with Bedrock configuration
    handler.addEnvironment('MODEL_ID', modelId);
    handler.addEnvironment('LOG_LEVEL', 'INFO');
    handler.addEnvironment('BEDROCK_LOG_GROUP', this.logGroup.logGroupName);

    // Grant the Lambda function the Bedrock role permissions
    this.bedrockRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'CloudWatchLogsPermissions',
        effect: iam.Effect.ALLOW,
        actions: [
          'logs:CreateLogStream',
          'logs:PutLogEvents',
          'logs:DescribeLogStreams',
        ],
        resources: [this.logGroup.logGroupArn],
      })
    );

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
  public grantBedrockAccess(actions: string[], resources?: string[]): void {
    const effectiveResources = resources || [
      `arn:aws:bedrock:${cdk.Stack.of(this).region}::foundation-model/*`,
    ];

    this.bedrockRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AdditionalBedrockPermissions',
        effect: iam.Effect.ALLOW,
        actions: actions,
        resources: effectiveResources,
      })
    );
  }

  /**
   * Add additional CloudWatch metrics and alarms
   * @param metricName Name of the custom metric
   * @param threshold Alarm threshold
   * @param comparisonOperator Comparison operator for the alarm
   * @param handler Lambda function to monitor
   * @param appName Application name for alarm naming
   */
  public addCustomMetricAlarm(
    metricName: string,
    threshold: number,
    handler: lambda.Function,
    appName: string,
    comparisonOperator: cloudwatch.ComparisonOperator = cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD
  ): cloudwatch.Alarm {
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