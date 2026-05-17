import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elasticloadbalancingv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';
/**
 * Properties for StreamlitDashboard construct
 */
export interface StreamlitDashboardProps {
    /**
     * Application name for consistent naming and tagging
     */
    readonly appName: string;
    /**
     * Path to the Dockerfile for the Streamlit application
     * Should be relative to the CDK app root or absolute
     */
    readonly dockerfilePath: string;
    /**
     * Environment variables for the container
     * @default {}
     */
    readonly envVars?: {
        [key: string]: string;
    };
    /**
     * CPU units for the Fargate task (256, 512, 1024, 2048, 4096)
     * @default 256
     */
    readonly cpu?: number;
    /**
     * Memory for the Fargate task in MB
     * @default 512
     */
    readonly memory?: number;
    /**
     * Port that the Streamlit app runs on
     * @default 8501
     */
    readonly port?: number;
    /**
     * VPC to deploy the service in
     * If not provided, a new VPC will be created
     * @default undefined
     */
    readonly vpc?: ec2.IVpc;
    /**
     * Custom domain name for the dashboard
     * If provided, creates HTTPS listener with ACM certificate
     * @default undefined
     */
    readonly domainName?: string;
    /**
     * Route 53 hosted zone for custom domain
     * Required if domainName is provided
     * @default undefined
     */
    readonly hostedZone?: route53.IHostedZone;
    /**
     * Minimum number of tasks to run
     * @default 1
     */
    readonly minCapacity?: number;
    /**
     * Maximum number of tasks to run
     * @default 3
     */
    readonly maxCapacity?: number;
    /**
     * Health check path for the load balancer
     * @default '/'
     */
    readonly healthCheckPath?: string;
    /**
     * Enable auto-scaling based on CPU utilization
     * @default true
     */
    readonly enableAutoScaling?: boolean;
    /**
     * Target CPU utilization percentage for auto-scaling
     * @default 70
     */
    readonly cpuTargetUtilization?: number;
}
/**
 * A construct that deploys a Streamlit dashboard using ECS Fargate with
 * Application Load Balancer, auto-scaling, monitoring, and optional custom domain.
 *
 * Features:
 * - ECS Fargate cluster for serverless container deployment
 * - Application Load Balancer with health checks
 * - Auto-scaling based on CPU utilization
 * - CloudWatch logging and monitoring
 * - Optional HTTPS with custom domain and ACM certificate
 * - IAM task role with DynamoDB read permissions
 * - Container image built from provided Dockerfile
 *
 * @example
 * ```typescript
 * new StreamlitDashboard(this, 'Dashboard', {
 *   appName: 'MyApp',
 *   dockerfilePath: './streamlit-app',
 *   envVars: {
 *     'API_BASE_URL': 'https://api.myapp.com',
 *     'ENVIRONMENT': 'production'
 *   },
 *   cpu: 512,
 *   memory: 1024,
 *   domainName: 'dashboard.myapp.com',
 *   hostedZone: myHostedZone,
 *   minCapacity: 2,
 *   maxCapacity: 10
 * });
 * ```
 */
export declare class StreamlitDashboard extends Construct {
    /**
     * ECS cluster running the Streamlit service
     */
    readonly cluster: ecs.Cluster;
    /**
     * Fargate service running the Streamlit containers
     */
    readonly service: ecs.FargateService;
    /**
     * Application Load Balancer for the service
     */
    readonly loadBalancer: elasticloadbalancingv2.ApplicationLoadBalancer;
    /**
     * ECS task definition
     */
    readonly taskDefinition: ecs.FargateTaskDefinition;
    /**
     * IAM task role for the containers
     */
    readonly taskRole: iam.Role;
    /**
     * CloudWatch log group for container logs
     */
    readonly logGroup: logs.LogGroup;
    /**
     * VPC used for the deployment
     */
    readonly vpc: ec2.IVpc;
    /**
     * Target group for the load balancer
     */
    readonly targetGroup: elasticloadbalancingv2.ApplicationTargetGroup;
    /**
     * The URL to access the dashboard
     */
    readonly dashboardUrl: string;
    constructor(scope: Construct, id: string, props: StreamlitDashboardProps);
    /**
     * Create CloudWatch monitoring for the dashboard
     */
    private createMonitoring;
    /**
     * Grant DynamoDB table permissions to the task role
     * @param table The DynamoDB table to grant access to
     * @param actions The DynamoDB actions to allow
     */
    grantDynamoDBAccess(table: any, actions?: string[]): void;
    /**
     * Grant S3 bucket permissions to the task role
     * @param bucketArn The S3 bucket ARN to grant access to
     * @param actions The S3 actions to allow
     */
    grantS3Access(bucketArn: string, actions?: string[]): void;
    /**
     * Update the desired count of the service
     * @param count The desired number of tasks
     */
    updateDesiredCount(count: number): void;
}
