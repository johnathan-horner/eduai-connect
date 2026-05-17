import * as sagemaker from 'aws-cdk-lib/aws-sagemaker';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';
/**
 * Properties for ServerlessMLEndpoint construct
 */
export interface ServerlessMLEndpointProps {
    /**
     * S3 URI pointing to the model.tar.gz file
     * @example "s3://my-bucket/models/my-model/model.tar.gz"
     */
    readonly modelDataUrl: string;
    /**
     * SageMaker container image URI for model inference
     * @example "763104351884.dkr.ecr.us-east-1.amazonaws.com/pytorch-inference:1.12.0-gpu-py38-cu113-ubuntu20.04-sagemaker"
     */
    readonly containerImage: string;
    /**
     * Memory allocation for the serverless endpoint in MB
     * @default 2048
     */
    readonly memorySize?: number;
    /**
     * Maximum concurrent invocations
     * @default 5
     */
    readonly maxConcurrency?: number;
    /**
     * Lambda function that will invoke this endpoint
     * This function will be granted invoke permissions
     */
    readonly invokerFunction: lambda.Function;
    /**
     * Application name for consistent tagging and naming
     */
    readonly appName: string;
    /**
     * Model name for the SageMaker model
     * If not provided, will be generated from appName
     * @default undefined
     */
    readonly modelName?: string;
    /**
     * Endpoint configuration name
     * If not provided, will be generated from appName
     * @default undefined
     */
    readonly endpointConfigName?: string;
    /**
     * Endpoint name
     * If not provided, will be generated from appName
     * @default undefined
     */
    readonly endpointName?: string;
    /**
     * SNS topic ARN for error notifications
     * @default undefined
     */
    readonly errorNotificationTopicArn?: string;
    /**
     * Environment variables to pass to the model container
     * @default {}
     */
    readonly modelEnvironment?: {
        [key: string]: string;
    };
}
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
export declare class ServerlessMLEndpoint extends Construct {
    /**
     * SageMaker model resource
     */
    readonly model: sagemaker.CfnModel;
    /**
     * SageMaker endpoint configuration
     */
    readonly endpointConfig: sagemaker.CfnEndpointConfig;
    /**
     * SageMaker serverless endpoint
     */
    readonly endpoint: sagemaker.CfnEndpoint;
    /**
     * IAM role for SageMaker execution
     */
    readonly executionRole: iam.Role;
    /**
     * CloudWatch alarm for endpoint errors
     */
    readonly errorAlarm: cloudwatch.Alarm;
    /**
     * The name of the created endpoint
     */
    readonly endpointName: string;
    constructor(scope: Construct, id: string, props: ServerlessMLEndpointProps);
    /**
     * Grant invoke permissions to an additional Lambda function
     * @param grantee The Lambda function to grant permissions to
     */
    grantInvoke(grantee: lambda.Function): void;
    /**
     * Add a custom CloudWatch alarm
     * @param alarmName Name for the alarm
     * @param metricName SageMaker metric name
     * @param threshold Alarm threshold
     * @param appName Application name for alarm naming
     * @param comparisonOperator Comparison operator
     * @returns The created alarm
     */
    addCustomAlarm(alarmName: string, metricName: string, threshold: number, appName: string, comparisonOperator?: cloudwatch.ComparisonOperator): cloudwatch.Alarm;
}
