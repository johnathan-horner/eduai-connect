"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerlessMLEndpoint = void 0;
const sagemaker = require("aws-cdk-lib/aws-sagemaker");
const iam = require("aws-cdk-lib/aws-iam");
const cloudwatch = require("aws-cdk-lib/aws-cloudwatch");
const cloudwatchActions = require("aws-cdk-lib/aws-cloudwatch-actions");
const sns = require("aws-cdk-lib/aws-sns");
const cdk = require("aws-cdk-lib");
const constructs_1 = require("constructs");
/**
 * A construct that creates a SageMaker serverless inference endpoint
 * with monitoring, error handling, and Lambda integration.
 *
 * Features:
 * - SageMaker serverless inference configuration
 * - IAM roles with least-privilege permissions
 * - Lambda function integration with invoke permissions
 * - CloudWatch monitoring and alarms
 * - Optional SNS notifications for errors
 * - Cost-optimized serverless scaling
 *
 * @example
 * ```typescript
 * const mlLambda = new lambda.Function(this, 'MLFunction', {
 *   runtime: lambda.Runtime.PYTHON_3_11,
 *   handler: 'index.handler',
 *   code: lambda.Code.fromAsset('lambda'),
 * });
 *
 * const endpoint = new ServerlessMLEndpoint(this, 'ModelEndpoint', {
 *   appName: 'MyMLApp',
 *   modelDataUrl: 's3://my-bucket/models/sentiment-analysis/model.tar.gz',
 *   containerImage: '763104351884.dkr.ecr.us-east-1.amazonaws.com/pytorch-inference:1.12.0-gpu-py38',
 *   invokerFunction: mlLambda,
 *   maxConcurrency: 10,
 *   memorySize: 4096
 * });
 * ```
 */
class ServerlessMLEndpoint extends constructs_1.Construct {
    /**
     * SageMaker model resource
     */
    model;
    /**
     * SageMaker endpoint configuration
     */
    endpointConfig;
    /**
     * SageMaker serverless endpoint
     */
    endpoint;
    /**
     * IAM role for SageMaker execution
     */
    executionRole;
    /**
     * CloudWatch alarm for endpoint errors
     */
    errorAlarm;
    /**
     * The name of the created endpoint
     */
    endpointName;
    constructor(scope, id, props) {
        super(scope, id);
        const { modelDataUrl, containerImage, memorySize = 2048, maxConcurrency = 5, invokerFunction, appName, modelName, endpointConfigName, endpointName, errorNotificationTopicArn, modelEnvironment = {}, } = props;
        // Generate resource names
        const modelResourceName = modelName || `${appName}-model-${cdk.Names.uniqueId(this).slice(-8)}`;
        const configResourceName = endpointConfigName || `${appName}-config-${cdk.Names.uniqueId(this).slice(-8)}`;
        this.endpointName = endpointName || `${appName}-endpoint-${cdk.Names.uniqueId(this).slice(-8)}`;
        // Create IAM role for SageMaker execution
        this.executionRole = new iam.Role(this, 'ExecutionRole', {
            roleName: `${appName}-sagemaker-execution-role`,
            assumedBy: new iam.ServicePrincipal('sagemaker.amazonaws.com'),
            description: `Execution role for ${appName} SageMaker serverless endpoint`,
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSageMakerFullAccess'),
            ],
        });
        // Add S3 permissions for model data
        this.executionRole.addToPolicy(new iam.PolicyStatement({
            sid: 'S3ModelDataAccess',
            effect: iam.Effect.ALLOW,
            actions: [
                's3:GetObject',
                's3:GetBucketLocation',
                's3:ListBucket',
            ],
            resources: [
                modelDataUrl.replace(/\/[^/]*$/, '/*'), // Bucket + prefix
                modelDataUrl.replace(/^s3:\/\/([^/]+)\/.*/, 'arn:aws:s3:::$1'), // Bucket ARN
            ],
        }));
        // Add ECR permissions for container image
        this.executionRole.addToPolicy(new iam.PolicyStatement({
            sid: 'ECRAccess',
            effect: iam.Effect.ALLOW,
            actions: [
                'ecr:BatchCheckLayerAvailability',
                'ecr:GetDownloadUrlForLayer',
                'ecr:BatchGetImage',
                'ecr:GetAuthorizationToken',
            ],
            resources: ['*'], // ECR permissions require wildcard
        }));
        // Add CloudWatch permissions
        this.executionRole.addToPolicy(new iam.PolicyStatement({
            sid: 'CloudWatchAccess',
            effect: iam.Effect.ALLOW,
            actions: [
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents',
                'logs:DescribeLogStreams',
                'cloudwatch:PutMetricData',
            ],
            resources: ['*'],
        }));
        // Create SageMaker model
        this.model = new sagemaker.CfnModel(this, 'Model', {
            modelName: modelResourceName,
            executionRoleArn: this.executionRole.roleArn,
            primaryContainer: {
                image: containerImage,
                modelDataUrl: modelDataUrl,
                environment: {
                    SAGEMAKER_PROGRAM: 'inference.py',
                    SAGEMAKER_SUBMIT_DIRECTORY: '/opt/ml/code',
                    SAGEMAKER_CONTAINER_LOG_LEVEL: '20',
                    SAGEMAKER_REGION: cdk.Stack.of(this).region,
                    ...modelEnvironment,
                },
            },
        });
        // Create endpoint configuration for serverless
        this.endpointConfig = new sagemaker.CfnEndpointConfig(this, 'EndpointConfig', {
            endpointConfigName: configResourceName,
            productionVariants: [
                {
                    modelName: this.model.attrModelName,
                    variantName: 'primary',
                    serverlessConfig: {
                        maxConcurrency: maxConcurrency,
                        memorySizeInMb: memorySize,
                    },
                },
            ],
        });
        // Ensure model is created before endpoint config
        this.endpointConfig.addDependency(this.model);
        // Create serverless endpoint
        this.endpoint = new sagemaker.CfnEndpoint(this, 'Endpoint', {
            endpointName: this.endpointName,
            endpointConfigName: this.endpointConfig.attrEndpointConfigName,
        });
        // Ensure endpoint config is created before endpoint
        this.endpoint.addDependency(this.endpointConfig);
        // Grant invoke permissions to the Lambda function
        invokerFunction.addToRolePolicy(new iam.PolicyStatement({
            sid: 'SageMakerInvokeEndpoint',
            effect: iam.Effect.ALLOW,
            actions: ['sagemaker:InvokeEndpoint'],
            resources: [
                `arn:aws:sagemaker:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:endpoint/${this.endpointName}`,
            ],
        }));
        // Add endpoint name to Lambda environment
        invokerFunction.addEnvironment('SAGEMAKER_ENDPOINT_NAME', this.endpointName);
        // Create CloudWatch alarm for endpoint errors
        this.errorAlarm = new cloudwatch.Alarm(this, 'EndpointErrorAlarm', {
            alarmName: `${appName}-sagemaker-endpoint-errors`,
            alarmDescription: `Monitor errors in ${appName} SageMaker endpoint`,
            metric: new cloudwatch.Metric({
                namespace: 'AWS/SageMaker',
                metricName: 'ModelLatency',
                dimensionsMap: {
                    EndpointName: this.endpointName,
                    VariantName: 'primary',
                },
                period: cdk.Duration.minutes(5),
                statistic: 'Average',
            }),
            threshold: 30000, // 30 seconds
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
            evaluationPeriods: 2,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
        // Add invocation error alarm
        const invocationErrorAlarm = new cloudwatch.Alarm(this, 'InvocationErrorAlarm', {
            alarmName: `${appName}-sagemaker-invocation-errors`,
            alarmDescription: `Monitor invocation errors in ${appName} SageMaker endpoint`,
            metric: new cloudwatch.Metric({
                namespace: 'AWS/SageMaker',
                metricName: 'Invocation4XXErrors',
                dimensionsMap: {
                    EndpointName: this.endpointName,
                    VariantName: 'primary',
                },
                period: cdk.Duration.minutes(5),
                statistic: 'Sum',
            }),
            threshold: 5,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
            evaluationPeriods: 1,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
        // Add SNS notification if topic provided
        if (errorNotificationTopicArn) {
            const topic = sns.Topic.fromTopicArn(this, 'ErrorTopic', errorNotificationTopicArn);
            this.errorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(topic));
            invocationErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(topic));
        }
        // Apply consistent tagging
        cdk.Tags.of(this).add('Project', appName);
        cdk.Tags.of(this).add('ManagedBy', 'cdk-ai-constructs');
        cdk.Tags.of(this).add('Owner', 'johnathan-horner');
        cdk.Tags.of(this).add('Component', 'ServerlessMLEndpoint');
        // Output important values
        new cdk.CfnOutput(this, 'ModelName', {
            value: this.model.attrModelName,
            description: 'Name of the SageMaker model',
            exportName: `${cdk.Stack.of(this).stackName}-${id}-ModelName`,
        });
        new cdk.CfnOutput(this, 'EndpointName', {
            value: this.endpoint.attrEndpointName,
            description: 'Name of the SageMaker endpoint',
            exportName: `${cdk.Stack.of(this).stackName}-${id}-EndpointName`,
        });
        new cdk.CfnOutput(this, 'EndpointArn', {
            value: `arn:aws:sagemaker:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:endpoint/${this.endpointName}`,
            description: 'ARN of the SageMaker endpoint',
            exportName: `${cdk.Stack.of(this).stackName}-${id}-EndpointArn`,
        });
        new cdk.CfnOutput(this, 'ExecutionRoleArn', {
            value: this.executionRole.roleArn,
            description: 'ARN of the SageMaker execution role',
            exportName: `${cdk.Stack.of(this).stackName}-${id}-ExecutionRoleArn`,
        });
    }
    /**
     * Grant invoke permissions to an additional Lambda function
     * @param grantee The Lambda function to grant permissions to
     */
    grantInvoke(grantee) {
        grantee.addToRolePolicy(new iam.PolicyStatement({
            sid: 'SageMakerInvokeEndpoint',
            effect: iam.Effect.ALLOW,
            actions: ['sagemaker:InvokeEndpoint'],
            resources: [
                `arn:aws:sagemaker:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:endpoint/${this.endpointName}`,
            ],
        }));
        grantee.addEnvironment('SAGEMAKER_ENDPOINT_NAME', this.endpointName);
    }
    /**
     * Add a custom CloudWatch alarm
     * @param alarmName Name for the alarm
     * @param metricName SageMaker metric name
     * @param threshold Alarm threshold
     * @param appName Application name for alarm naming
     * @param comparisonOperator Comparison operator
     * @returns The created alarm
     */
    addCustomAlarm(alarmName, metricName, threshold, appName, comparisonOperator = cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD) {
        return new cloudwatch.Alarm(this, alarmName, {
            alarmName: `${appName}-${alarmName}`,
            metric: new cloudwatch.Metric({
                namespace: 'AWS/SageMaker',
                metricName: metricName,
                dimensionsMap: {
                    EndpointName: this.endpointName,
                    VariantName: 'primary',
                },
                period: cdk.Duration.minutes(5),
                statistic: 'Average',
            }),
            threshold: threshold,
            comparisonOperator: comparisonOperator,
            evaluationPeriods: 2,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
    }
}
exports.ServerlessMLEndpoint = ServerlessMLEndpoint;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmVybGVzcy1tbC1lbmRwb2ludC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2NvbnN0cnVjdHMvc2VydmVybGVzcy1tbC1lbmRwb2ludC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSx1REFBdUQ7QUFDdkQsMkNBQTJDO0FBRTNDLHlEQUF5RDtBQUN6RCx3RUFBd0U7QUFDeEUsMkNBQTJDO0FBQzNDLG1DQUFtQztBQUNuQywyQ0FBdUM7QUEyRXZDOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQTZCRztBQUNILE1BQWEsb0JBQXFCLFNBQVEsc0JBQVM7SUFDakQ7O09BRUc7SUFDYSxLQUFLLENBQXFCO0lBRTFDOztPQUVHO0lBQ2EsY0FBYyxDQUE4QjtJQUU1RDs7T0FFRztJQUNhLFFBQVEsQ0FBd0I7SUFFaEQ7O09BRUc7SUFDYSxhQUFhLENBQVc7SUFFeEM7O09BRUc7SUFDYSxVQUFVLENBQW1CO0lBRTdDOztPQUVHO0lBQ2EsWUFBWSxDQUFTO0lBRXJDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBZ0M7UUFDeEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixNQUFNLEVBQ0osWUFBWSxFQUNaLGNBQWMsRUFDZCxVQUFVLEdBQUcsSUFBSSxFQUNqQixjQUFjLEdBQUcsQ0FBQyxFQUNsQixlQUFlLEVBQ2YsT0FBTyxFQUNQLFNBQVMsRUFDVCxrQkFBa0IsRUFDbEIsWUFBWSxFQUNaLHlCQUF5QixFQUN6QixnQkFBZ0IsR0FBRyxFQUFFLEdBQ3RCLEdBQUcsS0FBSyxDQUFDO1FBRVYsMEJBQTBCO1FBQzFCLE1BQU0saUJBQWlCLEdBQUcsU0FBUyxJQUFJLEdBQUcsT0FBTyxVQUFVLEdBQUcsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFDaEcsTUFBTSxrQkFBa0IsR0FBRyxrQkFB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QUFTLEVBQUUsR0FBRyxPQUFPLElBQUksU0FBUyxFQUFFO1lBQ3BDLE1BQU0sRUFBRSxJQUFJLFVBQVUsQ0FBQyxNQUFNLENBQUM7Z0JBQzVCLFNBQVMsRUFBRSxlQUFlO2dCQUMxQixVQUFVLEVBQUUsVUFBVTtnQkFDdEIsYUFBYSxFQUFFO29CQUNiLFlBQVksRUFBRSxJQUFJLENBQUMsWUFBWTtvQkFDL0IsV0FBVyxFQUFFLFNBQVM7aUJBQ3ZCO2dCQUNELE1BQU0sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7Z0JBQy9CLFNBQVMsRUFBRSxTQUFTO2FBQ3JCLENBQUM7WUFDRixTQUFTLEVBQUUsU0FBUztZQUNwQixrQkFBa0IsRUFBRSxrQkFBa0I7WUFDdEMsaUJBQWlCLEVBQUUsQ0FBQztZQUNwQixnQkFBZ0IsRUFBRSxVQUFVLENBQUMsZ0JBQWdCLENBQUMsYUFBYTtTQUM1RCxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUE5U0Qsb0RBOFNDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgc2FnZW1ha2VyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zYWdlbWFrZXInO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0ICogYXMgY2xvdWR3YXRjaCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWR3YXRjaCc7XG5pbXBvcnQgKiBhcyBjbG91ZHdhdGNoQWN0aW9ucyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWR3YXRjaC1hY3Rpb25zJztcbmltcG9ydCAqIGFzIHNucyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc25zJztcbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcblxuLyoqXG4gKiBQcm9wZXJ0aWVzIGZvciBTZXJ2ZXJsZXNzTUxFbmRwb2ludCBjb25zdHJ1Y3RcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBTZXJ2ZXJsZXNzTUxFbmRwb2ludFByb3BzIHtcbiAgLyoqXG4gICAqIFMzIFVSSSBwb2ludGluZyB0byB0aGUgbW9kZWwudGFyLmd6IGZpbGVcbiAgICogQGV4YW1wbGUgXCJzMzovL215LWJ1Y2tldC9tb2RlbHMvbXktbW9kZWwvbW9kZWwudGFyLmd6XCJcbiAgICovXG4gIHJlYWRvbmx5IG1vZGVsRGF0YVVybDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBTYWdlTWFrZXIgY29udGFpbmVyIGltYWdlIFVSSSBmb3IgbW9kZWwgaW5mZXJlbmNlXG4gICAqIEBleGFtcGxlIFwiNzYzMTA0MzUxODg0LmRrci5lY3IudXMtZWFzdC0xLmFtYXpvbmF3cy5jb20vcHl0b3JjaC1pbmZlcmVuY2U6MS4xMi4wLWdwdS1weTM4LWN1MTEzLXVidW50dTIwLjA0LXNhZ2VtYWtlclwiXG4gICAqL1xuICByZWFkb25seSBjb250YWluZXJJbWFnZTogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBNZW1vcnkgYWxsb2NhdGlvbiBmb3IgdGhlIHNlcnZlcmxlc3MgZW5kcG9pbnQgaW4gTUJcbiAgICogQGRlZmF1bHQgMjA0OFxuICAgKi9cbiAgcmVhZG9ubHkgbWVtb3J5U2l6ZT86IG51bWJlcjtcblxuICAvKipcbiAgICogTWF4aW11bSBjb25jdXJyZW50IGludm9jYXRpb25zXG4gICAqIEBkZWZhdWx0IDVcbiAgICovXG4gIHJlYWRvbmx5IG1heENvbmN1cnJlbmN5PzogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBMYW1iZGEgZnVuY3Rpb24gdGhhdCB3aWxsIGludm9rZSB0aGlzIGVuZHBvaW50XG4gICAqIFRoaXMgZnVuY3Rpb24gd2lsbCBiZSBncmFudGVkIGludm9rZSBwZXJtaXNzaW9uc1xuICAgKi9cbiAgcmVhZG9ubHkgaW52b2tlckZ1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG5cbiAgLyoqXG4gICAqIEFwcGxpY2F0aW9uIG5hbWUgZm9yIGNvbnNpc3RlbnQgdGFnZ2luZyBhbmQgbmFtaW5nXG4gICAqL1xuICByZWFkb25seSBhcHBOYW1lOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIE1vZGVsIG5hbWUgZm9yIHRoZSBTYWdlTWFrZXIgbW9kZWxcbiAgICogSWYgbm90IHByb3ZpZGVkLCB3aWxsIGJlIGdlbmVyYXRlZCBmcm9tIGFwcE5hbWVcbiAgICogQGRlZmF1bHQgdW5kZWZpbmVkXG4gICAqL1xuICByZWFkb25seSBtb2RlbE5hbWU/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEVuZHBvaW50IGNvbmZpZ3VyYXRpb24gbmFtZVxuICAgKiBJZiBub3QgcHJvdmlkZWQsIHdpbGwgYmUgZ2VuZXJhdGVkIGZyb20gYXBwTmFtZVxuICAgKiBAZGVmYXVsdCB1bmRlZmluZWRcbiAgICovXG4gIHJlYWRvbmx5IGVuZHBvaW50Q29uZmlnTmFtZT86IHN0cmluZztcblxuICAvKipcbiAgICogRW5kcG9pbnQgbmFtZVxuICAgKiBJZiBub3QgcHJvdmlkZWQsIHdpbGwgYmUgZ2VuZXJhdGVkIGZyb20gYXBwTmFtZVxuICAgKiBAZGVmYXVsdCB1bmRlZmluZWRcbiAgICovXG4gIHJlYWRvbmx5IGVuZHBvaW50TmFtZT86IHN0cmluZztcblxuICAvKipcbiAgICogU05TIHRvcGljIEFSTiBmb3IgZXJyb3Igbm90aWZpY2F0aW9uc1xuICAgKiBAZGVmYXVsdCB1bmRlZmluZWRcbiAgICovXG4gIHJlYWRvbmx5IGVycm9yTm90aWZpY2F0aW9uVG9waWNBcm4/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEVudmlyb25tZW50IHZhcmlhYmxlcyB0byBwYXNzIHRvIHRoZSBtb2RlbCBjb250YWluZXJcbiAgICogQGRlZmF1bHQge31cbiAgICovXG4gIHJlYWRvbmx5IG1vZGVsRW52aXJvbm1lbnQ/OiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9O1xufVxuXG4vKipcbiAqIEEgY29uc3RydWN0IHRoYXQgY3JlYXRlcyBhIFNhZ2VNYWtlciBzZXJ2ZXJsZXNzIGluZmVyZW5jZSBlbmRwb2ludFxuICogd2l0aCBtb25pdG9yaW5nLCBlcnJvciBoYW5kbGluZywgYW5kIExhbWJkYSBpbnRlZ3JhdGlvbi5cbiAqXG4gKiBGZWF0dXJlczpcbiAqIC0gU2FnZU1ha2VyIHNlcnZlcmxlc3MgaW5mZXJlbmNlIGNvbmZpZ3VyYXRpb25cbiAqIC0gSUFNIHJvbGVzIHdpdGggbGVhc3QtcHJpdmlsZWdlIHBlcm1pc3Npb25zXG4gKiAtIExhbWJkYSBmdW5jdGlvbiBpbnRlZ3JhdGlvbiB3aXRoIGludm9rZSBwZXJtaXNzaW9uc1xuICogLSBDbG91ZFdhdGNoIG1vbml0b3JpbmcgYW5kIGFsYXJtc1xuICogLSBPcHRpb25hbCBTTlMgbm90aWZpY2F0aW9ucyBmb3IgZXJyb3JzXG4gKiAtIENvc3Qtb3B0aW1pemVkIHNlcnZlcmxlc3Mgc2NhbGluZ1xuICpcbiAqIEBleGFtcGxlXG4gKiBgYGB0eXBlc2NyaXB0XG4gKiBjb25zdCBtbExhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ01MRnVuY3Rpb24nLCB7XG4gKiAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzExLFxuICogICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gKiAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnbGFtYmRhJyksXG4gKiB9KTtcbiAqXG4gKiBjb25zdCBlbmRwb2ludCA9IG5ldyBTZXJ2ZXJsZXNzTUxFbmRwb2ludCh0aGlzLCAnTW9kZWxFbmRwb2ludCcsIHtcbiAqICAgYXBwTmFtZTogJ015TUxBcHAnLFxuICogICBtb2RlbERhdGFVcmw6ICdzMzovL215LWJ1Y2tldC9tb2RlbHMvc2VudGltZW50LWFuYWx5c2lzL21vZGVsLnRhci5neicsXG4gKiAgIGNvbnRhaW5lckltYWdlOiAnNzYzMTA0MzUxODg0LmRrci5lY3IudXMtZWFzdC0xLmFtYXpvbmF3cy5jb20vcHl0b3JjaC1pbmZlcmVuY2U6MS4xMi4wLWdwdS1weTM4JyxcbiAqICAgaW52b2tlckZ1bmN0aW9uOiBtbExhbWJkYSxcbiAqICAgbWF4Q29uY3VycmVuY3k6IDEwLFxuICogICBtZW1vcnlTaXplOiA0MDk2XG4gKiB9KTtcbiAqIGBgYFxuICovXG5leHBvcnQgY2xhc3MgU2VydmVybGVzc01MRW5kcG9pbnQgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICAvKipcbiAgICogU2FnZU1ha2VyIG1vZGVsIHJlc291cmNlXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgbW9kZWw6IHNhZ2VtYWtlci5DZm5Nb2RlbDtcblxuICAvKipcbiAgICogU2FnZU1ha2VyIGVuZHBvaW50IGNvbmZpZ3VyYXRpb25cbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBlbmRwb2ludENvbmZpZzogc2FnZW1ha2VyLkNmbkVuZHBvaW50Q29uZmlnO1xuXG4gIC8qKlxuICAgKiBTYWdlTWFrZXIgc2VydmVybGVzcyBlbmRwb2ludFxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGVuZHBvaW50OiBzYWdlbWFrZXIuQ2ZuRW5kcG9pbnQ7XG5cbiAgLyoqXG4gICAqIElBTSByb2xlIGZvciBTYWdlTWFrZXIgZXhlY3V0aW9uXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgZXhlY3V0aW9uUm9sZTogaWFtLlJvbGU7XG5cbiAgLyoqXG4gICAqIENsb3VkV2F0Y2ggYWxhcm0gZm9yIGVuZHBvaW50IGVycm9yc1xuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGVycm9yQWxhcm06IGNsb3Vkd2F0Y2guQWxhcm07XG5cbiAgLyoqXG4gICAqIFRoZSBuYW1lIG9mIHRoZSBjcmVhdGVkIGVuZHBvaW50XG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgZW5kcG9pbnROYW1lOiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFNlcnZlcmxlc3NNTEVuZHBvaW50UHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgY29uc3Qge1xuICAgICAgbW9kZWxEYXRhVXJsLFxuICAgICAgY29udGFpbmVySW1hZ2UsXG4gICAgICBtZW1vcnlTaXplID0gMjA0OCxcbiAgICAgIG1heENvbmN1cnJlbmN5ID0gNSxcbiAgICAgIGludm9rZXJGdW5jdGlvbixcbiAgICAgIGFwcE5hbWUsXG4gICAgICBtb2RlbE5hbWUsXG4gICAgICBlbmRwb2ludENvbmZpZ05hbWUsXG4gICAgICBlbmRwb2ludE5hbWUsXG4gICAgICBlcnJvck5vdGlmaWNhdGlvblRvcGljQXJuLFxuICAgICAgbW9kZWxFbnZpcm9ubWVudCA9IHt9LFxuICAgIH0gPSBwcm9wcztcblxuICAgIC8vIEdlbmVyYXRlIHJlc291cmNlIG5hbWVzXG4gICAgY29uc3QgbW9kZWxSZXNvdXJjZU5hbWUgPSBtb2RlbE5hbWUgfHwgYCR7YXBwTmFtZX0tbW9kZWwtJHtjZGsuTmFtZXMudW5pcXVlSWQodGhpcykuc2xpY2UoLTgpfWA7XG4gICAgY29uc3QgY29uZmlnUmVzb3VyY2VOYW1lID0gZW5kcG9pbnRDb25maWdOYW1lIHx8IGAke2FwcE5hbWV9LWNvbmZpZy0ke2Nkay5OYW1lcy51bmlxdWVJZCh0aGlzKS5zbGljZSgtOCl9YDtcbiAgICB0aGlzLmVuZHBvaW50TmFtZSA9IGVuZHBvaW50TmFtZSB8fCBgJHthcHBOYW1lfS1lbmRwb2ludC0ke2Nkay5OYW1lcy51bmlxdWVJZCh0aGlzKS5zbGljZSgtOCl9YDtcblxuICAgIC8vIENyZWF0ZSBJQU0gcm9sZSBmb3IgU2FnZU1ha2VyIGV4ZWN1dGlvblxuICAgIHRoaXMuZXhlY3V0aW9uUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnRXhlY3V0aW9uUm9sZScsIHtcbiAgICAgIHJvbGVOYW1lOiBgJHthcHBOYW1lfS1zYWdlbWFrZXItZXhlY3V0aW9uLXJvbGVgLFxuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ3NhZ2VtYWtlci5hbWF6b25hd3MuY29tJyksXG4gICAgICBkZXNjcmlwdGlvbjogYEV4ZWN1dGlvbiByb2xlIGZvciAke2FwcE5hbWV9IFNhZ2VNYWtlciBzZXJ2ZXJsZXNzIGVuZHBvaW50YCxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ0FtYXpvblNhZ2VNYWtlckZ1bGxBY2Nlc3MnKSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgUzMgcGVybWlzc2lvbnMgZm9yIG1vZGVsIGRhdGFcbiAgICB0aGlzLmV4ZWN1dGlvblJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIHNpZDogJ1MzTW9kZWxEYXRhQWNjZXNzJyxcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgJ3MzOkdldE9iamVjdCcsXG4gICAgICAgICAgJ3MzOkdldEJ1Y2tldExvY2F0aW9uJyxcbiAgICAgICAgICAnczM6TGlzdEJ1Y2tldCcsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgIG1vZGVsRGF0YVVybC5yZXBsYWNlKC9cXC9bXi9dKiQvLCAnLyonKSwgLy8gQnVja2V0ICsgcHJlZml4XG4gICAgICAgICAgbW9kZWxEYXRhVXJsLnJlcGxhY2UoL15zMzpcXC9cXC8oW14vXSspXFwvLiovLCAnYXJuOmF3czpzMzo6OiQxJyksIC8vIEJ1Y2tldCBBUk5cbiAgICAgICAgXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIEFkZCBFQ1IgcGVybWlzc2lvbnMgZm9yIGNvbnRhaW5lciBpbWFnZVxuICAgIHRoaXMuZXhlY3V0aW9uUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgc2lkOiAnRUNSQWNjZXNzJyxcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgJ2VjcjpCYXRjaENoZWNrTGF5ZXJBdmFpbGFiaWxpdHknLFxuICAgICAgICAgICdlY3I6R2V0RG93bmxvYWRVcmxGb3JMYXllcicsXG4gICAgICAgICAgJ2VjcjpCYXRjaEdldEltYWdlJyxcbiAgICAgICAgICAnZWNyOkdldEF1dGhvcml6YXRpb25Ub2tlbicsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogWycqJ10sIC8vIEVDUiBwZXJtaXNzaW9ucyByZXF1aXJlIHdpbGRjYXJkXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBBZGQgQ2xvdWRXYXRjaCBwZXJtaXNzaW9uc1xuICAgIHRoaXMuZXhlY3V0aW9uUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgc2lkOiAnQ2xvdWRXYXRjaEFjY2VzcycsXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICdsb2dzOkNyZWF0ZUxvZ0dyb3VwJyxcbiAgICAgICAgICAnbG9nczpDcmVhdGVMb2dTdHJlYW0nLFxuICAgICAgICAgICdsb2dzOlB1dExvZ0V2ZW50cycsXG4gICAgICAgICAgJ2xvZ3M6RGVzY3JpYmVMb2dTdHJlYW1zJyxcbiAgICAgICAgICAnY2xvdWR3YXRjaDpQdXRNZXRyaWNEYXRhJyxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbJyonXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIENyZWF0ZSBTYWdlTWFrZXIgbW9kZWxcbiAgICB0aGlzLm1vZGVsID0gbmV3IHNhZ2VtYWtlci5DZm5Nb2RlbCh0aGlzLCAnTW9kZWwnLCB7XG4gICAgICBtb2RlbE5hbWU6IG1vZGVsUmVzb3VyY2VOYW1lLFxuICAgICAgZXhlY3V0aW9uUm9sZUFybjogdGhpcy5leGVjdXRpb25Sb2xlLnJvbGVBcm4sXG4gICAgICBwcmltYXJ5Q29udGFpbmVyOiB7XG4gICAgICAgIGltYWdlOiBjb250YWluZXJJbWFnZSxcbiAgICAgICAgbW9kZWxEYXRhVXJsOiBtb2RlbERhdGFVcmwsXG4gICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgU0FHRU1BS0VSX1BST0dSQU06ICdpbmZlcmVuY2UucHknLFxuICAgICAgICAgIFNBR0VNQUtFUl9TVUJNSVRfRElSRUNUT1JZOiAnL29wdC9tbC9jb2RlJyxcbiAgICAgICAgICBTQUdFTUFLRVJfQ09OVEFJTkVSX0xPR19MRVZFTDogJzIwJyxcbiAgICAgICAgICBTQUdFTUFLRVJfUkVHSU9OOiBjZGsuU3RhY2sub2YodGhpcykucmVnaW9uLFxuICAgICAgICAgIC4uLm1vZGVsRW52aXJvbm1lbnQsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIGVuZHBvaW50IGNvbmZpZ3VyYXRpb24gZm9yIHNlcnZlcmxlc3NcbiAgICB0aGlzLmVuZHBvaW50Q29uZmlnID0gbmV3IHNhZ2VtYWtlci5DZm5FbmRwb2ludENvbmZpZyh0aGlzLCAnRW5kcG9pbnRDb25maWcnLCB7XG4gICAgICBlbmRwb2ludENvbmZpZ05hbWU6IGNvbmZpZ1Jlc291cmNlTmFtZSxcbiAgICAgIHByb2R1Y3Rpb25WYXJpYW50czogW1xuICAgICAgICB7XG4gICAgICAgICAgbW9kZWxOYW1lOiB0aGlzLm1vZGVsLmF0dHJNb2RlbE5hbWUsXG4gICAgICAgICAgdmFyaWFudE5hbWU6ICdwcmltYXJ5JyxcbiAgICAgICAgICBzZXJ2ZXJsZXNzQ29uZmlnOiB7XG4gICAgICAgICAgICBtYXhDb25jdXJyZW5jeTogbWF4Q29uY3VycmVuY3ksXG4gICAgICAgICAgICBtZW1vcnlTaXplSW5NYjogbWVtb3J5U2l6ZSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIEVuc3VyZSBtb2RlbCBpcyBjcmVhdGVkIGJlZm9yZSBlbmRwb2ludCBjb25maWdcbiAgICB0aGlzLmVuZHBvaW50Q29uZmlnLmFkZERlcGVuZGVuY3kodGhpcy5tb2RlbCk7XG5cbiAgICAvLyBDcmVhdGUgc2VydmVybGVzcyBlbmRwb2ludFxuICAgIHRoaXMuZW5kcG9pbnQgPSBuZXcgc2FnZW1ha2VyLkNmbkVuZHBvaW50KHRoaXMsICdFbmRwb2ludCcsIHtcbiAgICAgIGVuZHBvaW50TmFtZTogdGhpcy5lbmRwb2ludE5hbWUsXG4gICAgICBlbmRwb2ludENvbmZpZ05hbWU6IHRoaXMuZW5kcG9pbnRDb25maWcuYXR0ckVuZHBvaW50Q29uZmlnTmFtZSxcbiAgICB9KTtcblxuICAgIC8vIEVuc3VyZSBlbmRwb2ludCBjb25maWcgaXMgY3JlYXRlZCBiZWZvcmUgZW5kcG9pbnRcbiAgICB0aGlzLmVuZHBvaW50LmFkZERlcGVuZGVuY3kodGhpcy5lbmRwb2ludENvbmZpZyk7XG5cbiAgICAvLyBHcmFudCBpbnZva2UgcGVybWlzc2lvbnMgdG8gdGhlIExhbWJkYSBmdW5jdGlvblxuICAgIGludm9rZXJGdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIHNpZDogJ1NhZ2VNYWtlckludm9rZUVuZHBvaW50JyxcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbJ3NhZ2VtYWtlcjpJbnZva2VFbmRwb2ludCddLFxuICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICBgYXJuOmF3czpzYWdlbWFrZXI6JHtjZGsuU3RhY2sub2YodGhpcykucmVnaW9ufToke2Nkay5TdGFjay5vZih0aGlzKS5hY2NvdW50fTplbmRwb2ludC8ke3RoaXMuZW5kcG9pbnROYW1lfWAsXG4gICAgICAgIF0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBBZGQgZW5kcG9pbnQgbmFtZSB0byBMYW1iZGEgZW52aXJvbm1lbnRcbiAgICBpbnZva2VyRnVuY3Rpb24uYWRkRW52aXJvbm1lbnQoJ1NBR0VNQUtFUl9FTkRQT0lOVF9OQU1FJywgdGhpcy5lbmRwb2ludE5hbWUpO1xuXG4gICAgLy8gQ3JlYXRlIENsb3VkV2F0Y2ggYWxhcm0gZm9yIGVuZHBvaW50IGVycm9yc1xuICAgIHRoaXMuZXJyb3JBbGFybSA9IG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdFbmRwb2ludEVycm9yQWxhcm0nLCB7XG4gICAgICBhbGFybU5hbWU6IGAke2FwcE5hbWV9LXNhZ2VtYWtlci1lbmRwb2ludC1lcnJvcnNgLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogYE1vbml0b3IgZXJyb3JzIGluICR7YXBwTmFtZX0gU2FnZU1ha2VyIGVuZHBvaW50YCxcbiAgICAgIG1ldHJpYzogbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgbmFtZXNwYWNlOiAnQVdTL1NhZ2VNYWtlcicsXG4gICAgICAgIG1ldHJpY05hbWU6ICdNb2RlbExhdGVuY3knLFxuICAgICAgICBkaW1lbnNpb25zTWFwOiB7XG4gICAgICAgICAgRW5kcG9pbnROYW1lOiB0aGlzLmVuZHBvaW50TmFtZSxcbiAgICAgICAgICBWYXJpYW50TmFtZTogJ3ByaW1hcnknLFxuICAgICAgICB9LFxuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgICBzdGF0aXN0aWM6ICdBdmVyYWdlJyxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiAzMDAwMCwgLy8gMzAgc2Vjb25kc1xuICAgICAgY29tcGFyaXNvbk9wZXJhdG9yOiBjbG91ZHdhdGNoLkNvbXBhcmlzb25PcGVyYXRvci5HUkVBVEVSX1RIQU5fVEhSRVNIT0xELFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDIsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICB9KTtcblxuICAgIC8vIEFkZCBpbnZvY2F0aW9uIGVycm9yIGFsYXJtXG4gICAgY29uc3QgaW52b2NhdGlvbkVycm9yQWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnSW52b2NhdGlvbkVycm9yQWxhcm0nLCB7XG4gICAgICBhbGFybU5hbWU6IGAke2FwcE5hbWV9LXNhZ2VtYWtlci1pbnZvY2F0aW9uLWVycm9yc2AsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiBgTW9uaXRvciBpbnZvY2F0aW9uIGVycm9ycyBpbiAke2FwcE5hbWV9IFNhZ2VNYWtlciBlbmRwb2ludGAsXG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogJ0FXUy9TYWdlTWFrZXInLFxuICAgICAgICBtZXRyaWNOYW1lOiAnSW52b2NhdGlvbjRYWEVycm9ycycsXG4gICAgICAgIGRpbWVuc2lvbnNNYXA6IHtcbiAgICAgICAgICBFbmRwb2ludE5hbWU6IHRoaXMuZW5kcG9pbnROYW1lLFxuICAgICAgICAgIFZhcmlhbnROYW1lOiAncHJpbWFyeScsXG4gICAgICAgIH0sXG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICAgIHN0YXRpc3RpYzogJ1N1bScsXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogNSxcbiAgICAgIGNvbXBhcmlzb25PcGVyYXRvcjogY2xvdWR3YXRjaC5Db21wYXJpc29uT3BlcmF0b3IuR1JFQVRFUl9USEFOX1RIUkVTSE9MRCxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAxLFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgU05TIG5vdGlmaWNhdGlvbiBpZiB0b3BpYyBwcm92aWRlZFxuICAgIGlmIChlcnJvck5vdGlmaWNhdGlvblRvcGljQXJuKSB7XG4gICAgICBjb25zdCB0b3BpYyA9IHNucy5Ub3BpYy5mcm9tVG9waWNBcm4odGhpcywgJ0Vycm9yVG9waWMnLCBlcnJvck5vdGlmaWNhdGlvblRvcGljQXJuKTtcbiAgICAgIHRoaXMuZXJyb3JBbGFybS5hZGRBbGFybUFjdGlvbihuZXcgY2xvdWR3YXRjaEFjdGlvbnMuU25zQWN0aW9uKHRvcGljKSk7XG4gICAgICBpbnZvY2F0aW9uRXJyb3JBbGFybS5hZGRBbGFybUFjdGlvbihuZXcgY2xvdWR3YXRjaEFjdGlvbnMuU25zQWN0aW9uKHRvcGljKSk7XG4gICAgfVxuXG4gICAgLy8gQXBwbHkgY29uc2lzdGVudCB0YWdnaW5nXG4gICAgY2RrLlRhZ3Mub2YodGhpcykuYWRkKCdQcm9qZWN0JywgYXBwTmFtZSk7XG4gICAgY2RrLlRhZ3Mub2YodGhpcykuYWRkKCdNYW5hZ2VkQnknLCAnY2RrLWFpLWNvbnN0cnVjdHMnKTtcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ093bmVyJywgJ2pvaG5hdGhhbi1ob3JuZXInKTtcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ0NvbXBvbmVudCcsICdTZXJ2ZXJsZXNzTUxFbmRwb2ludCcpO1xuXG4gICAgLy8gT3V0cHV0IGltcG9ydGFudCB2YWx1ZXNcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnTW9kZWxOYW1lJywge1xuICAgICAgdmFsdWU6IHRoaXMubW9kZWwuYXR0ck1vZGVsTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnTmFtZSBvZiB0aGUgU2FnZU1ha2VyIG1vZGVsJyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke2Nkay5TdGFjay5vZih0aGlzKS5zdGFja05hbWV9LSR7aWR9LU1vZGVsTmFtZWAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRW5kcG9pbnROYW1lJywge1xuICAgICAgdmFsdWU6IHRoaXMuZW5kcG9pbnQuYXR0ckVuZHBvaW50TmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnTmFtZSBvZiB0aGUgU2FnZU1ha2VyIGVuZHBvaW50JyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke2Nkay5TdGFjay5vZih0aGlzKS5zdGFja05hbWV9LSR7aWR9LUVuZHBvaW50TmFtZWAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRW5kcG9pbnRBcm4nLCB7XG4gICAgICB2YWx1ZTogYGFybjphd3M6c2FnZW1ha2VyOiR7Y2RrLlN0YWNrLm9mKHRoaXMpLnJlZ2lvbn06JHtjZGsuU3RhY2sub2YodGhpcykuYWNjb3VudH06ZW5kcG9pbnQvJHt0aGlzLmVuZHBvaW50TmFtZX1gLFxuICAgICAgZGVzY3JpcHRpb246ICdBUk4gb2YgdGhlIFNhZ2VNYWtlciBlbmRwb2ludCcsXG4gICAgICBleHBvcnROYW1lOiBgJHtjZGsuU3RhY2sub2YodGhpcykuc3RhY2tOYW1lfS0ke2lkfS1FbmRwb2ludEFybmAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRXhlY3V0aW9uUm9sZUFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmV4ZWN1dGlvblJvbGUucm9sZUFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVJOIG9mIHRoZSBTYWdlTWFrZXIgZXhlY3V0aW9uIHJvbGUnLFxuICAgICAgZXhwb3J0TmFtZTogYCR7Y2RrLlN0YWNrLm9mKHRoaXMpLnN0YWNrTmFtZX0tJHtpZH0tRXhlY3V0aW9uUm9sZUFybmAsXG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogR3JhbnQgaW52b2tlIHBlcm1pc3Npb25zIHRvIGFuIGFkZGl0aW9uYWwgTGFtYmRhIGZ1bmN0aW9uXG4gICAqIEBwYXJhbSBncmFudGVlIFRoZSBMYW1iZGEgZnVuY3Rpb24gdG8gZ3JhbnQgcGVybWlzc2lvbnMgdG9cbiAgICovXG4gIHB1YmxpYyBncmFudEludm9rZShncmFudGVlOiBsYW1iZGEuRnVuY3Rpb24pOiB2b2lkIHtcbiAgICBncmFudGVlLmFkZFRvUm9sZVBvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgc2lkOiAnU2FnZU1ha2VySW52b2tlRW5kcG9pbnQnLFxuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFsnc2FnZW1ha2VyOkludm9rZUVuZHBvaW50J10sXG4gICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgIGBhcm46YXdzOnNhZ2VtYWtlcjoke2Nkay5TdGFjay5vZih0aGlzKS5yZWdpb259OiR7Y2RrLlN0YWNrLm9mKHRoaXMpLmFjY291bnR9OmVuZHBvaW50LyR7dGhpcy5lbmRwb2ludE5hbWV9YCxcbiAgICAgICAgXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIGdyYW50ZWUuYWRkRW52aXJvbm1lbnQoJ1NBR0VNQUtFUl9FTkRQT0lOVF9OQU1FJywgdGhpcy5lbmRwb2ludE5hbWUpO1xuICB9XG5cbiAgLyoqXG4gICAqIEFkZCBhIGN1c3RvbSBDbG91ZFdhdGNoIGFsYXJtXG4gICAqIEBwYXJhbSBhbGFybU5hbWUgTmFtZSBmb3IgdGhlIGFsYXJtXG4gICAqIEBwYXJhbSBtZXRyaWNOYW1lIFNhZ2VNYWtlciBtZXRyaWMgbmFtZVxuICAgKiBAcGFyYW0gdGhyZXNob2xkIEFsYXJtIHRocmVzaG9sZFxuICAgKiBAcGFyYW0gYXBwTmFtZSBBcHBsaWNhdGlvbiBuYW1lIGZvciBhbGFybSBuYW1pbmdcbiAgICogQHBhcmFtIGNvbXBhcmlzb25PcGVyYXRvciBDb21wYXJpc29uIG9wZXJhdG9yXG4gICAqIEByZXR1cm5zIFRoZSBjcmVhdGVkIGFsYXJtXG4gICAqL1xuICBwdWJsaWMgYWRkQ3VzdG9tQWxhcm0oXG4gICAgYWxhcm1OYW1lOiBzdHJpbmcsXG4gICAgbWV0cmljTmFtZTogc3RyaW5nLFxuICAgIHRocmVzaG9sZDogbnVtYmVyLFxuICAgIGFwcE5hbWU6IHN0cmluZyxcbiAgICBjb21wYXJpc29uT3BlcmF0b3I6IGNsb3Vkd2F0Y2guQ29tcGFyaXNvbk9wZXJhdG9yID0gY2xvdWR3YXRjaC5Db21wYXJpc29uT3BlcmF0b3IuR1JFQVRFUl9USEFOX1RIUkVTSE9MRFxuICApOiBjbG91ZHdhdGNoLkFsYXJtIHtcbiAgICByZXR1cm4gbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgYWxhcm1OYW1lLCB7XG4gICAgICBhbGFybU5hbWU6IGAke2FwcE5hbWV9LSR7YWxhcm1OYW1lfWAsXG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogJ0FXUy9TYWdlTWFrZXInLFxuICAgICAgICBtZXRyaWNOYW1lOiBtZXRyaWNOYW1lLFxuICAgICAgICBkaW1lbnNpb25zTWFwOiB7XG4gICAgICAgICAgRW5kcG9pbnROYW1lOiB0aGlzLmVuZHBvaW50TmFtZSxcbiAgICAgICAgICBWYXJpYW50TmFtZTogJ3ByaW1hcnknLFxuICAgICAgICB9LFxuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgICBzdGF0aXN0aWM6ICdBdmVyYWdlJyxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiB0aHJlc2hvbGQsXG4gICAgICBjb21wYXJpc29uT3BlcmF0b3I6IGNvbXBhcmlzb25PcGVyYXRvcixcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAyLFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgfSk7XG4gIH1cbn0iXX0=