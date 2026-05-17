"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreamlitDashboard = void 0;
const ecs = require("aws-cdk-lib/aws-ecs");
const ec2 = require("aws-cdk-lib/aws-ec2");
const elasticloadbalancingv2 = require("aws-cdk-lib/aws-elasticloadbalancingv2");
const logs = require("aws-cdk-lib/aws-logs");
const iam = require("aws-cdk-lib/aws-iam");
const certificatemanager = require("aws-cdk-lib/aws-certificatemanager");
const route53 = require("aws-cdk-lib/aws-route53");
const route53targets = require("aws-cdk-lib/aws-route53-targets");
const cloudwatch = require("aws-cdk-lib/aws-cloudwatch");
const cdk = require("aws-cdk-lib");
const constructs_1 = require("constructs");
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
class StreamlitDashboard extends constructs_1.Construct {
    /**
     * ECS cluster running the Streamlit service
     */
    cluster;
    /**
     * Fargate service running the Streamlit containers
     */
    service;
    /**
     * Application Load Balancer for the service
     */
    loadBalancer;
    /**
     * ECS task definition
     */
    taskDefinition;
    /**
     * IAM task role for the containers
     */
    taskRole;
    /**
     * CloudWatch log group for container logs
     */
    logGroup;
    /**
     * VPC used for the deployment
     */
    vpc;
    /**
     * Target group for the load balancer
     */
    targetGroup;
    /**
     * The URL to access the dashboard
     */
    dashboardUrl;
    constructor(scope, id, props) {
        super(scope, id);
        const { appName, dockerfilePath, envVars = {}, cpu = 256, memory = 512, port = 8501, vpc, domainName, hostedZone, minCapacity = 1, maxCapacity = 3, healthCheckPath = '/', enableAutoScaling = true, cpuTargetUtilization = 70, } = props;
        // Use provided VPC or create new one
        this.vpc = vpc || new ec2.Vpc(this, 'VPC', {
            maxAzs: 2,
            natGateways: 1, // Cost optimization
            subnetConfiguration: [
                {
                    cidrMask: 24,
                    name: 'Public',
                    subnetType: ec2.SubnetType.PUBLIC,
                },
                {
                    cidrMask: 24,
                    name: 'Private',
                    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                },
            ],
        });
        // Create ECS cluster
        this.cluster = new ecs.Cluster(this, 'Cluster', {
            clusterName: `${appName}-streamlit-cluster`,
            vpc: this.vpc,
            containerInsights: true,
        });
        // Create CloudWatch log group
        this.logGroup = new logs.LogGroup(this, 'LogGroup', {
            logGroupName: `/ecs/${appName}-streamlit`,
            retention: logs.RetentionDays.ONE_MONTH,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
        // Create IAM task role
        this.taskRole = new iam.Role(this, 'TaskRole', {
            assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
            description: `Task role for ${appName} Streamlit dashboard`,
        });
        // Add DynamoDB read permissions (common for Streamlit dashboards)
        this.taskRole.addToPolicy(new iam.PolicyStatement({
            sid: 'DynamoDBReadAccess',
            effect: iam.Effect.ALLOW,
            actions: [
                'dynamodb:GetItem',
                'dynamodb:Query',
                'dynamodb:Scan',
                'dynamodb:BatchGetItem',
                'dynamodb:DescribeTable',
            ],
            resources: ['*'], // Can be restricted to specific tables if needed
        }));
        // Add CloudWatch metrics permissions
        this.taskRole.addToPolicy(new iam.PolicyStatement({
            sid: 'CloudWatchMetrics',
            effect: iam.Effect.ALLOW,
            actions: [
                'cloudwatch:GetMetricStatistics',
                'cloudwatch:ListMetrics',
                'cloudwatch:GetMetricData',
            ],
            resources: ['*'],
        }));
        // Create task definition
        this.taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
            family: `${appName}-streamlit`,
            cpu: cpu,
            memoryLimitMiB: memory,
            taskRole: this.taskRole,
        });
        // Create container from Dockerfile
        const container = this.taskDefinition.addContainer('StreamlitContainer', {
            containerName: 'streamlit',
            image: ecs.ContainerImage.fromAsset(dockerfilePath),
            environment: {
                PORT: port.toString(),
                ...envVars,
            },
            logging: ecs.LogDrivers.awsLogs({
                streamPrefix: 'streamlit',
                logGroup: this.logGroup,
            }),
            essential: true,
        });
        // Add port mapping
        container.addPortMappings({
            containerPort: port,
            hostPort: port,
            protocol: ecs.Protocol.TCP,
        });
        // Create Application Load Balancer
        this.loadBalancer = new elasticloadbalancingv2.ApplicationLoadBalancer(this, 'LoadBalancer', {
            vpc: this.vpc,
            internetFacing: true,
            loadBalancerName: `${appName}-streamlit-alb`,
        });
        // Create target group
        this.targetGroup = new elasticloadbalancingv2.ApplicationTargetGroup(this, 'TargetGroup', {
            vpc: this.vpc,
            port: port,
            protocol: elasticloadbalancingv2.ApplicationProtocol.HTTP,
            targetType: elasticloadbalancingv2.TargetType.IP,
            healthCheck: {
                enabled: true,
                healthyHttpCodes: '200',
                path: healthCheckPath,
                interval: cdk.Duration.seconds(30),
                timeout: cdk.Duration.seconds(10),
                healthyThresholdCount: 2,
                unhealthyThresholdCount: 3,
            },
        });
        // Create Fargate service
        this.service = new ecs.FargateService(this, 'Service', {
            cluster: this.cluster,
            taskDefinition: this.taskDefinition,
            serviceName: `${appName}-streamlit-service`,
            desiredCount: minCapacity,
            assignPublicIp: false,
            enableExecuteCommand: true, // For debugging
            platformVersion: ecs.FargatePlatformVersion.LATEST,
        });
        // Attach service to target group
        this.service.attachToApplicationTargetGroup(this.targetGroup);
        // Configure auto-scaling
        if (enableAutoScaling) {
            const scalableTarget = this.service.autoScaleTaskCount({
                minCapacity: minCapacity,
                maxCapacity: maxCapacity,
            });
            scalableTarget.scaleOnCpuUtilization('CpuScaling', {
                targetUtilizationPercent: cpuTargetUtilization,
                scaleInCooldown: cdk.Duration.minutes(10),
                scaleOutCooldown: cdk.Duration.minutes(5),
            });
        }
        // Configure HTTPS listener if domain provided
        if (domainName && hostedZone) {
            // Create ACM certificate
            const certificate = new certificatemanager.Certificate(this, 'Certificate', {
                domainName: domainName,
                validation: certificatemanager.CertificateValidation.fromDns(hostedZone),
            });
            // Create HTTPS listener
            const httpsListener = this.loadBalancer.addListener('HttpsListener', {
                port: 443,
                protocol: elasticloadbalancingv2.ApplicationProtocol.HTTPS,
                certificates: [certificate],
                defaultTargetGroups: [this.targetGroup],
            });
            // Redirect HTTP to HTTPS
            this.loadBalancer.addListener('HttpListener', {
                port: 80,
                protocol: elasticloadbalancingv2.ApplicationProtocol.HTTP,
                defaultAction: elasticloadbalancingv2.ListenerAction.redirect({
                    protocol: 'HTTPS',
                    port: '443',
                    permanent: true,
                }),
            });
            // Create DNS record
            new route53.ARecord(this, 'AliasRecord', {
                zone: hostedZone,
                recordName: domainName,
                target: route53.RecordTarget.fromAlias(new route53targets.LoadBalancerTarget(this.loadBalancer)),
            });
            this.dashboardUrl = `https://${domainName}`;
        }
        else {
            // Create HTTP listener
            this.loadBalancer.addListener('HttpListener', {
                port: 80,
                protocol: elasticloadbalancingv2.ApplicationProtocol.HTTP,
                defaultTargetGroups: [this.targetGroup],
            });
            this.dashboardUrl = `http://${this.loadBalancer.loadBalancerDnsName}`;
        }
        // Create monitoring
        this.createMonitoring(appName);
        // Apply consistent tagging
        cdk.Tags.of(this).add('Project', appName);
        cdk.Tags.of(this).add('ManagedBy', 'cdk-ai-constructs');
        cdk.Tags.of(this).add('Owner', 'johnathan-horner');
        cdk.Tags.of(this).add('Component', 'StreamlitDashboard');
        // Output important values
        new cdk.CfnOutput(this, 'DashboardUrl', {
            value: this.dashboardUrl,
            description: 'URL to access the Streamlit dashboard',
            exportName: `${cdk.Stack.of(this).stackName}-${id}-DashboardUrl`,
        });
        new cdk.CfnOutput(this, 'LoadBalancerDnsName', {
            value: this.loadBalancer.loadBalancerDnsName,
            description: 'DNS name of the Application Load Balancer',
            exportName: `${cdk.Stack.of(this).stackName}-${id}-LoadBalancerDnsName`,
        });
        new cdk.CfnOutput(this, 'ClusterName', {
            value: this.cluster.clusterName,
            description: 'Name of the ECS cluster',
            exportName: `${cdk.Stack.of(this).stackName}-${id}-ClusterName`,
        });
        new cdk.CfnOutput(this, 'ServiceName', {
            value: this.service.serviceName,
            description: 'Name of the ECS service',
            exportName: `${cdk.Stack.of(this).stackName}-${id}-ServiceName`,
        });
        new cdk.CfnOutput(this, 'LogGroupName', {
            value: this.logGroup.logGroupName,
            description: 'CloudWatch log group for container logs',
            exportName: `${cdk.Stack.of(this).stackName}-${id}-LogGroupName`,
        });
    }
    /**
     * Create CloudWatch monitoring for the dashboard
     */
    createMonitoring(appName) {
        // CPU utilization alarm
        new cloudwatch.Alarm(this, 'HighCpuAlarm', {
            alarmName: `${appName}-streamlit-high-cpu`,
            alarmDescription: `High CPU utilization for ${appName} Streamlit dashboard`,
            metric: this.service.metricCpuUtilization({
                period: cdk.Duration.minutes(5),
                statistic: 'Average',
            }),
            threshold: 80,
            evaluationPeriods: 3,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
        // Memory utilization alarm
        new cloudwatch.Alarm(this, 'HighMemoryAlarm', {
            alarmName: `${appName}-streamlit-high-memory`,
            alarmDescription: `High memory utilization for ${appName} Streamlit dashboard`,
            metric: this.service.metricMemoryUtilization({
                period: cdk.Duration.minutes(5),
                statistic: 'Average',
            }),
            threshold: 80,
            evaluationPeriods: 3,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
        // Target group unhealthy hosts alarm
        new cloudwatch.Alarm(this, 'UnhealthyHostsAlarm', {
            alarmName: `${appName}-streamlit-unhealthy-hosts`,
            alarmDescription: `Unhealthy hosts for ${appName} Streamlit dashboard`,
            metric: this.targetGroup.metricUnhealthyHostCount({
                period: cdk.Duration.minutes(5),
                statistic: 'Maximum',
            }),
            threshold: 0,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
            evaluationPeriods: 2,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
        // Load balancer response time alarm
        new cloudwatch.Alarm(this, 'HighResponseTimeAlarm', {
            alarmName: `${appName}-streamlit-high-response-time`,
            alarmDescription: `High response time for ${appName} Streamlit dashboard`,
            metric: this.targetGroup.metricTargetResponseTime({
                period: cdk.Duration.minutes(5),
                statistic: 'Average',
            }),
            threshold: 5, // 5 seconds
            evaluationPeriods: 3,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
    }
    /**
     * Grant DynamoDB table permissions to the task role
     * @param table The DynamoDB table to grant access to
     * @param actions The DynamoDB actions to allow
     */
    grantDynamoDBAccess(table, actions = ['dynamodb:GetItem', 'dynamodb:Query', 'dynamodb:Scan']) {
        this.taskRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: actions,
            resources: [table.tableArn, `${table.tableArn}/index/*`],
        }));
    }
    /**
     * Grant S3 bucket permissions to the task role
     * @param bucketArn The S3 bucket ARN to grant access to
     * @param actions The S3 actions to allow
     */
    grantS3Access(bucketArn, actions = ['s3:GetObject', 's3:ListBucket']) {
        this.taskRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: actions,
            resources: [bucketArn, `${bucketArn}/*`],
        }));
    }
    /**
     * Update the desired count of the service
     * @param count The desired number of tasks
     */
    updateDesiredCount(count) {
        const cfnService = this.service.node.defaultChild;
        cfnService.desiredCount = count;
    }
}
exports.StreamlitDashboard = StreamlitDashboard;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RyZWFtbGl0LWRhc2hib2FyZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2NvbnN0cnVjdHMvc3RyZWFtbGl0LWRhc2hib2FyZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSwyQ0FBMkM7QUFDM0MsMkNBQTJDO0FBQzNDLGlGQUFpRjtBQUNqRiw2Q0FBNkM7QUFDN0MsMkNBQTJDO0FBQzNDLHlFQUF5RTtBQUN6RSxtREFBbUQ7QUFDbkQsa0VBQWtFO0FBQ2xFLHlEQUF5RDtBQUN6RCxtQ0FBbUM7QUFDbkMsMkNBQXVDO0FBNkZ2Qzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBOEJHO0FBQ0gsTUFBYSxrQkFBbUIsU0FBUSxzQkFBUztJQUMvQzs7T0FFRztJQUNhLE9BQU8sQ0FBYztJQUVyQzs7T0FFRztJQUNhLE9BQU8sQ0FBcUI7SUFFNUM7O09BRUc7SUFDYSxZQUFZLENBQWlEO0lBRTdFOztPQUVHO0lBQ2EsY0FBYyxDQUE0QjtJQUUxRDs7T0FFRztJQUNhLFFBQVEsQ0FBVztJQUVuQzs7T0FFRztJQUNhLFFBQVEsQ0FBZ0I7SUFFeEM7O09BRUc7SUFDYSxHQUFHLENBQVc7SUFFOUI7O09BRUc7SUFDYSxXQUFXLENBQWdEO0lBRTNFOztPQUVHO0lBQ2EsWUFBWSxDQUFTO0lBRXJDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBOEI7UUFDdEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixNQUFNLEVBQ0osT0FBTyxFQUNQLGNBQWMsRUFDZCxPQUFPLEdBQUcsRUFBRSxFQUNaLEdBQUcsR0FBRyxHQUFHLEVBQ1QsTUFBTSxHQUFHLEdBQUcsRUFDWixJQUFJLEdBQUcsSUFBSSxFQUNYLEdBQUcsRUFDSCxVQUFVLEVBQ1YsVUFBVSxFQUNWLFdBQVcsR0FBRyxDQUFDLEVBQ2YsV0FBVyxHQUFHLENBQUMsRUFDZixlQUFlLEdBQUcsR0FBRyxFQUNyQixpQkFBaUIsR0FBRyxJ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Ozs7T0FJRztJQUNJLG1CQUFtQixDQUFDLEtBQVUsRUFBRSxVQUFvQixDQUFDLGtCQUFrQixFQUFFLGdCQUFnQixFQUFFLGVBQWUsQ0FBQztRQUNoSCxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FDdkIsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO1lBQ3RCLE1BQU0sRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUs7WUFDeEIsT0FBTyxFQUFFLE9BQU87WUFDaEIsU0FBUyxFQUFFLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxHQUFHLEtBQUssQ0FBQyxRQUFRLFVBQVUsQ0FBQztTQUN6RCxDQUFDLENBQ0gsQ0FBQztJQUNKLENBQUM7SUFFRDs7OztPQUlHO0lBQ0ksYUFBYSxDQUFDLFNBQWlCLEVBQUUsVUFBb0IsQ0FBQyxjQUFjLEVBQUUsZUFBZSxDQUFDO1FBQzNGLElBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUN2QixJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUM7WUFDdEIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSztZQUN4QixPQUFPLEVBQUUsT0FBTztZQUNoQixTQUFTLEVBQUUsQ0FBQyxTQUFTLEVBQUUsR0FBRyxTQUFTLElBQUksQ0FBQztTQUN6QyxDQUFDLENBQ0gsQ0FBQztJQUNKLENBQUM7SUFFRDs7O09BR0c7SUFDSSxrQkFBa0IsQ0FBQyxLQUFhO1FBQ3JDLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFlBQThCLENBQUM7UUFDcEUsVUFBVSxDQUFDLFlBQVksR0FBRyxLQUFLLENBQUM7SUFDbEMsQ0FBQztDQUNGO0FBalpELGdEQWlaQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGVjcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWNzJztcbmltcG9ydCAqIGFzIGVjMiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWMyJztcbmltcG9ydCAqIGFzIGVsYXN0aWNsb2FkYmFsYW5jaW5ndjIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVsYXN0aWNsb2FkYmFsYW5jaW5ndjInO1xuaW1wb3J0ICogYXMgbG9ncyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbG9ncyc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBjZXJ0aWZpY2F0ZW1hbmFnZXIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNlcnRpZmljYXRlbWFuYWdlcic7XG5pbXBvcnQgKiBhcyByb3V0ZTUzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1yb3V0ZTUzJztcbmltcG9ydCAqIGFzIHJvdXRlNTN0YXJnZXRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1yb3V0ZTUzLXRhcmdldHMnO1xuaW1wb3J0ICogYXMgY2xvdWR3YXRjaCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWR3YXRjaCc7XG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5cbi8qKlxuICogUHJvcGVydGllcyBmb3IgU3RyZWFtbGl0RGFzaGJvYXJkIGNvbnN0cnVjdFxuICovXG5leHBvcnQgaW50ZXJmYWNlIFN0cmVhbWxpdERhc2hib2FyZFByb3BzIHtcbiAgLyoqXG4gICAqIEFwcGxpY2F0aW9uIG5hbWUgZm9yIGNvbnNpc3RlbnQgbmFtaW5nIGFuZCB0YWdnaW5nXG4gICAqL1xuICByZWFkb25seSBhcHBOYW1lOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFBhdGggdG8gdGhlIERvY2tlcmZpbGUgZm9yIHRoZSBTdHJlYW1saXQgYXBwbGljYXRpb25cbiAgICogU2hvdWxkIGJlIHJlbGF0aXZlIHRvIHRoZSBDREsgYXBwIHJvb3Qgb3IgYWJzb2x1dGVcbiAgICovXG4gIHJlYWRvbmx5IGRvY2tlcmZpbGVQYXRoOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEVudmlyb25tZW50IHZhcmlhYmxlcyBmb3IgdGhlIGNvbnRhaW5lclxuICAgKiBAZGVmYXVsdCB7fVxuICAgKi9cbiAgcmVhZG9ubHkgZW52VmFycz86IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH07XG5cbiAgLyoqXG4gICAqIENQVSB1bml0cyBmb3IgdGhlIEZhcmdhdGUgdGFzayAoMjU2LCA1MTIsIDEwMjQsIDIwNDgsIDQwOTYpXG4gICAqIEBkZWZhdWx0IDI1NlxuICAgKi9cbiAgcmVhZG9ubHkgY3B1PzogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBNZW1vcnkgZm9yIHRoZSBGYXJnYXRlIHRhc2sgaW4gTUJcbiAgICogQGRlZmF1bHQgNTEyXG4gICAqL1xuICByZWFkb25seSBtZW1vcnk/OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIFBvcnQgdGhhdCB0aGUgU3RyZWFtbGl0IGFwcCBydW5zIG9uXG4gICAqIEBkZWZhdWx0IDg1MDFcbiAgICovXG4gIHJlYWRvbmx5IHBvcnQ/OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIFZQQyB0byBkZXBsb3kgdGhlIHNlcnZpY2UgaW5cbiAgICogSWYgbm90IHByb3ZpZGVkLCBhIG5ldyBWUEMgd2lsbCBiZSBjcmVhdGVkXG4gICAqIEBkZWZhdWx0IHVuZGVmaW5lZFxuICAgKi9cbiAgcmVhZG9ubHkgdnBjPzogZWMyLklWcGM7XG5cbiAgLyoqXG4gICAqIEN1c3RvbSBkb21haW4gbmFtZSBmb3IgdGhlIGRhc2hib2FyZFxuICAgKiBJZiBwcm92aWRlZCwgY3JlYXRlcyBIVFRQUyBsaXN0ZW5lciB3aXRoIEFDTSBjZXJ0aWZpY2F0ZVxuICAgKiBAZGVmYXVsdCB1bmRlZmluZWRcbiAgICovXG4gIHJlYWRvbmx5IGRvbWFpbk5hbWU/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFJvdXRlIDUzIGhvc3RlZCB6b25lIGZvciBjdXN0b20gZG9tYWluXG4gICAqIFJlcXVpcmVkIGlmIGRvbWFpbk5hbWUgaXMgcHJvdmlkZWRcbiAgICogQGRlZmF1bHQgdW5kZWZpbmVkXG4gICAqL1xuICByZWFkb25seSBob3N0ZWRab25lPzogcm91dGU1My5JSG9zdGVkWm9uZTtcblxuICAvKipcbiAgICogTWluaW11bSBudW1iZXIgb2YgdGFza3MgdG8gcnVuXG4gICAqIEBkZWZhdWx0IDFcbiAgICovXG4gIHJlYWRvbmx5IG1pbkNhcGFjaXR5PzogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBNYXhpbXVtIG51bWJlciBvZiB0YXNrcyB0byBydW5cbiAgICogQGRlZmF1bHQgM1xuICAgKi9cbiAgcmVhZG9ubHkgbWF4Q2FwYWNpdHk/OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEhlYWx0aCBjaGVjayBwYXRoIGZvciB0aGUgbG9hZCBiYWxhbmNlclxuICAgKiBAZGVmYXVsdCAnLydcbiAgICovXG4gIHJlYWRvbmx5IGhlYWx0aENoZWNrUGF0aD86IHN0cmluZztcblxuICAvKipcbiAgICogRW5hYmxlIGF1dG8tc2NhbGluZyBiYXNlZCBvbiBDUFUgdXRpbGl6YXRpb25cbiAgICogQGRlZmF1bHQgdHJ1ZVxuICAgKi9cbiAgcmVhZG9ubHkgZW5hYmxlQXV0b1NjYWxpbmc/OiBib29sZWFuO1xuXG4gIC8qKlxuICAgKiBUYXJnZXQgQ1BVIHV0aWxpemF0aW9uIHBlcmNlbnRhZ2UgZm9yIGF1dG8tc2NhbGluZ1xuICAgKiBAZGVmYXVsdCA3MFxuICAgKi9cbiAgcmVhZG9ubHkgY3B1VGFyZ2V0VXRpbGl6YXRpb24/OiBudW1iZXI7XG59XG5cbi8qKlxuICogQSBjb25zdHJ1Y3QgdGhhdCBkZXBsb3lzIGEgU3RyZWFtbGl0IGRhc2hib2FyZCB1c2luZyBFQ1MgRmFyZ2F0ZSB3aXRoXG4gKiBBcHBsaWNhdGlvbiBMb2FkIEJhbGFuY2VyLCBhdXRvLXNjYWxpbmcsIG1vbml0b3JpbmcsIGFuZCBvcHRpb25hbCBjdXN0b20gZG9tYWluLlxuICpcbiAqIEZlYXR1cmVzOlxuICogLSBFQ1MgRmFyZ2F0ZSBjbHVzdGVyIGZvciBzZXJ2ZXJsZXNzIGNvbnRhaW5lciBkZXBsb3ltZW50XG4gKiAtIEFwcGxpY2F0aW9uIExvYWQgQmFsYW5jZXIgd2l0aCBoZWFsdGggY2hlY2tzXG4gKiAtIEF1dG8tc2NhbGluZyBiYXNlZCBvbiBDUFUgdXRpbGl6YXRpb25cbiAqIC0gQ2xvdWRXYXRjaCBsb2dnaW5nIGFuZCBtb25pdG9yaW5nXG4gKiAtIE9wdGlvbmFsIEhUVFBTIHdpdGggY3VzdG9tIGRvbWFpbiBhbmQgQUNNIGNlcnRpZmljYXRlXG4gKiAtIElBTSB0YXNrIHJvbGUgd2l0aCBEeW5hbW9EQiByZWFkIHBlcm1pc3Npb25zXG4gKiAtIENvbnRhaW5lciBpbWFnZSBidWlsdCBmcm9tIHByb3ZpZGVkIERvY2tlcmZpbGVcbiAqXG4gKiBAZXhhbXBsZVxuICogYGBgdHlwZXNjcmlwdFxuICogbmV3IFN0cmVhbWxpdERhc2hib2FyZCh0aGlzLCAnRGFzaGJvYXJkJywge1xuICogICBhcHBOYW1lOiAnTXlBcHAnLFxuICogICBkb2NrZXJmaWxlUGF0aDogJy4vc3RyZWFtbGl0LWFwcCcsXG4gKiAgIGVudlZhcnM6IHtcbiAqICAgICAnQVBJX0JBU0VfVVJMJzogJ2h0dHBzOi8vYXBpLm15YXBwLmNvbScsXG4gKiAgICAgJ0VOVklST05NRU5UJzogJ3Byb2R1Y3Rpb24nXG4gKiAgIH0sXG4gKiAgIGNwdTogNTEyLFxuICogICBtZW1vcnk6IDEwMjQsXG4gKiAgIGRvbWFpbk5hbWU6ICdkYXNoYm9hcmQubXlhcHAuY29tJyxcbiAqICAgaG9zdGVkWm9uZTogbXlIb3N0ZWRab25lLFxuICogICBtaW5DYXBhY2l0eTogMixcbiAqICAgbWF4Q2FwYWNpdHk6IDEwXG4gKiB9KTtcbiAqIGBgYFxuICovXG5leHBvcnQgY2xhc3MgU3RyZWFtbGl0RGFzaGJvYXJkIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgLyoqXG4gICAqIEVDUyBjbHVzdGVyIHJ1bm5pbmcgdGhlIFN0cmVhbWxpdCBzZXJ2aWNlXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgY2x1c3RlcjogZWNzLkNsdXN0ZXI7XG5cbiAgLyoqXG4gICAqIEZhcmdhdGUgc2VydmljZSBydW5uaW5nIHRoZSBTdHJlYW1saXQgY29udGFpbmVyc1xuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IHNlcnZpY2U6IGVjcy5GYXJnYXRlU2VydmljZTtcblxuICAvKipcbiAgICogQXBwbGljYXRpb24gTG9hZCBCYWxhbmNlciBmb3IgdGhlIHNlcnZpY2VcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBsb2FkQmFsYW5jZXI6IGVsYXN0aWNsb2FkYmFsYW5jaW5ndjIuQXBwbGljYXRpb25Mb2FkQmFsYW5jZXI7XG5cbiAgLyoqXG4gICAqIEVDUyB0YXNrIGRlZmluaXRpb25cbiAgICovXG4gIHB1YmxpYyByZWFkb25seSB0YXNrRGVmaW5pdGlvbjogZWNzLkZhcmdhdGVUYXNrRGVmaW5pdGlvbjtcblxuICAvKipcbiAgICogSUFNIHRhc2sgcm9sZSBmb3IgdGhlIGNvbnRhaW5lcnNcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSB0YXNrUm9sZTogaWFtLlJvbGU7XG5cbiAgLyoqXG4gICAqIENsb3VkV2F0Y2ggbG9nIGdyb3VwIGZvciBjb250YWluZXIgbG9nc1xuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGxvZ0dyb3VwOiBsb2dzLkxvZ0dyb3VwO1xuXG4gIC8qKlxuICAgKiBWUEMgdXNlZCBmb3IgdGhlIGRlcGxveW1lbnRcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSB2cGM6IGVjMi5JVnBjO1xuXG4gIC8qKlxuICAgKiBUYXJnZXQgZ3JvdXAgZm9yIHRoZSBsb2FkIGJhbGFuY2VyXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgdGFyZ2V0R3JvdXA6IGVsYXN0aWNsb2FkYmFsYW5jaW5ndjIuQXBwbGljYXRpb25UYXJnZXRHcm91cDtcblxuICAvKipcbiAgICogVGhlIFVSTCB0byBhY2Nlc3MgdGhlIGRhc2hib2FyZFxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGRhc2hib2FyZFVybDogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBTdHJlYW1saXREYXNoYm9hcmRQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICBjb25zdCB7XG4gICAgICBhcHBOYW1lLFxuICAgICAgZG9ja2VyZmlsZVBhdGgsXG4gICAgICBlbnZWYXJzID0ge30sXG4gICAgICBjcHUgPSAyNTYsXG4gICAgICBtZW1vcnkgPSA1MTIsXG4gICAgICBwb3J0ID0gODUwMSxcbiAgICAgIHZwYyxcbiAgICAgIGRvbWFpbk5hbWUsXG4gICAgICBob3N0ZWRab25lLFxuICAgICAgbWluQ2FwYWNpdHkgPSAxLFxuICAgICAgbWF4Q2FwYWNpdHkgPSAzLFxuICAgICAgaGVhbHRoQ2hlY2tQYXRoID0gJy8nLFxuICAgICAgZW5hYmxlQXV0b1NjYWxpbmcgPSB0cnVlLFxuICAgICAgY3B1VGFyZ2V0VXRpbGl6YXRpb24gPSA3MCxcbiAgICB9ID0gcHJvcHM7XG5cbiAgICAvLyBVc2UgcHJvdmlkZWQgVlBDIG9yIGNyZWF0ZSBuZXcgb25lXG4gICAgdGhpcy52cGMgPSB2cGMgfHwgbmV3IGVjMi5WcGModGhpcywgJ1ZQQycsIHtcbiAgICAgIG1heEF6czogMixcbiAgICAgIG5hdEdhdGV3YXlzOiAxLCAvLyBDb3N0IG9wdGltaXphdGlvblxuICAgICAgc3VibmV0Q29uZmlndXJhdGlvbjogW1xuICAgICAgICB7XG4gICAgICAgICAgY2lkck1hc2s6IDI0LFxuICAgICAgICAgIG5hbWU6ICdQdWJsaWMnLFxuICAgICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBVQkxJQyxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGNpZHJNYXNrOiAyNCxcbiAgICAgICAgICBuYW1lOiAnUHJpdmF0ZScsXG4gICAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFJJVkFURV9XSVRIX0VHUkVTUyxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgRUNTIGNsdXN0ZXJcbiAgICB0aGlzLmNsdXN0ZXIgPSBuZXcgZWNzLkNsdXN0ZXIodGhpcywgJ0NsdXN0ZXInLCB7XG4gICAgICBjbHVzdGVyTmFtZTogYCR7YXBwTmFtZX0tc3RyZWFtbGl0LWNsdXN0ZXJgLFxuICAgICAgdnBjOiB0aGlzLnZwYyxcbiAgICAgIGNvbnRhaW5lckluc2lnaHRzOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIENsb3VkV2F0Y2ggbG9nIGdyb3VwXG4gICAgdGhpcy5sb2dHcm91cCA9IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdMb2dHcm91cCcsIHtcbiAgICAgIGxvZ0dyb3VwTmFtZTogYC9lY3MvJHthcHBOYW1lfS1zdHJlYW1saXRgLFxuICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX01PTlRILFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBJQU0gdGFzayByb2xlXG4gICAgdGhpcy50YXNrUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnVGFza1JvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnZWNzLXRhc2tzLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIGRlc2NyaXB0aW9uOiBgVGFzayByb2xlIGZvciAke2FwcE5hbWV9IFN0cmVhbWxpdCBkYXNoYm9hcmRgLFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIER5bmFtb0RCIHJlYWQgcGVybWlzc2lvbnMgKGNvbW1vbiBmb3IgU3RyZWFtbGl0IGRhc2hib2FyZHMpXG4gICAgdGhpcy50YXNrUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgc2lkOiAnRHluYW1vREJSZWFkQWNjZXNzJyxcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgJ2R5bmFtb2RiOkdldEl0ZW0nLFxuICAgICAgICAgICdkeW5hbW9kYjpRdWVyeScsXG4gICAgICAgICAgJ2R5bmFtb2RiOlNjYW4nLFxuICAgICAgICAgICdkeW5hbW9kYjpCYXRjaEdldEl0ZW0nLFxuICAgICAgICAgICdkeW5hbW9kYjpEZXNjcmliZVRhYmxlJyxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbJyonXSwgLy8gQ2FuIGJlIHJlc3RyaWN0ZWQgdG8gc3BlY2lmaWMgdGFibGVzIGlmIG5lZWRlZFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gQWRkIENsb3VkV2F0Y2ggbWV0cmljcyBwZXJtaXNzaW9uc1xuICAgIHRoaXMudGFza1JvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIHNpZDogJ0Nsb3VkV2F0Y2hNZXRyaWNzJyxcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgJ2Nsb3Vkd2F0Y2g6R2V0TWV0cmljU3RhdGlzdGljcycsXG4gICAgICAgICAgJ2Nsb3Vkd2F0Y2g6TGlzdE1ldHJpY3MnLFxuICAgICAgICAgICdjbG91ZHdhdGNoOkdldE1ldHJpY0RhdGEnLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFsnKiddLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gQ3JlYXRlIHRhc2sgZGVmaW5pdGlvblxuICAgIHRoaXMudGFza0RlZmluaXRpb24gPSBuZXcgZWNzLkZhcmdhdGVUYXNrRGVmaW5pdGlvbih0aGlzLCAnVGFza0RlZmluaXRpb24nLCB7XG4gICAgICBmYW1pbHk6IGAke2FwcE5hbWV9LXN0cmVhbWxpdGAsXG4gICAgICBjcHU6IGNwdSxcbiAgICAgIG1lbW9yeUxpbWl0TWlCOiBtZW1vcnksXG4gICAgICB0YXNrUm9sZTogdGhpcy50YXNrUm9sZSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBjb250YWluZXIgZnJvbSBEb2NrZXJmaWxlXG4gICAgY29uc3QgY29udGFpbmVyID0gdGhpcy50YXNrRGVmaW5pdGlvbi5hZGRDb250YWluZXIoJ1N0cmVhbWxpdENvbnRhaW5lcicsIHtcbiAgICAgIGNvbnRhaW5lck5hbWU6ICdzdHJlYW1saXQnLFxuICAgICAgaW1hZ2U6IGVjcy5Db250YWluZXJJbWFnZS5mcm9tQXNzZXQoZG9ja2VyZmlsZVBhdGgpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUE9SVDogcG9ydC50b1N0cmluZygpLFxuICAgICAgICAuLi5lbnZWYXJzLFxuICAgICAgfSxcbiAgICAgIGxvZ2dpbmc6IGVjcy5Mb2dEcml2ZXJzLmF3c0xvZ3Moe1xuICAgICAgICBzdHJlYW1QcmVmaXg6ICdzdHJlYW1saXQnLFxuICAgICAgICBsb2dHcm91cDogdGhpcy5sb2dHcm91cCxcbiAgICAgIH0pLFxuICAgICAgZXNzZW50aWFsOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIHBvcnQgbWFwcGluZ1xuICAgIGNvbnRhaW5lci5hZGRQb3J0TWFwcGluZ3Moe1xuICAgICAgY29udGFpbmVyUG9ydDogcG9ydCxcbiAgICAgIGhvc3RQb3J0OiBwb3J0LFxuICAgICAgcHJvdG9jb2w6IGVjcy5Qcm90b2NvbC5UQ1AsXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgQXBwbGljYXRpb24gTG9hZCBCYWxhbmNlclxuICAgIHRoaXMubG9hZEJhbGFuY2VyID0gbmV3IGVsYXN0aWNsb2FkYmFsYW5jaW5ndjIuQXBwbGljYXRpb25Mb2FkQmFsYW5jZXIodGhpcywgJ0xvYWRCYWxhbmNlcicsIHtcbiAgICAgIHZwYzogdGhpcy52cGMsXG4gICAgICBpbnRlcm5ldEZhY2luZzogdHJ1ZSxcbiAgICAgIGxvYWRCYWxhbmNlck5hbWU6IGAke2FwcE5hbWV9LXN0cmVhbWxpdC1hbGJgLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHRhcmdldCBncm91cFxuICAgIHRoaXMudGFyZ2V0R3JvdXAgPSBuZXcgZWxhc3RpY2xvYWRiYWxhbmNpbmd2Mi5BcHBsaWNhdGlvblRhcmdldEdyb3VwKHRoaXMsICdUYXJnZXRHcm91cCcsIHtcbiAgICAgIHZwYzogdGhpcy52cGMsXG4gICAgICBwb3J0OiBwb3J0LFxuICAgICAgcHJvdG9jb2w6IGVsYXN0aWNsb2FkYmFsYW5jaW5ndjIuQXBwbGljYXRpb25Qcm90b2NvbC5IVFRQLFxuICAgICAgdGFyZ2V0VHlwZTogZWxhc3RpY2xvYWRiYWxhbmNpbmd2Mi5UYXJnZXRUeXBlLklQLFxuICAgICAgaGVhbHRoQ2hlY2s6IHtcbiAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgaGVhbHRoeUh0dHBDb2RlczogJzIwMCcsXG4gICAgICAgIHBhdGg6IGhlYWx0aENoZWNrUGF0aCxcbiAgICAgICAgaW50ZXJ2YWw6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTApLFxuICAgICAgICBoZWFsdGh5VGhyZXNob2xkQ291bnQ6IDIsXG4gICAgICAgIHVuaGVhbHRoeVRocmVzaG9sZENvdW50OiAzLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBGYXJnYXRlIHNlcnZpY2VcbiAgICB0aGlzLnNlcnZpY2UgPSBuZXcgZWNzLkZhcmdhdGVTZXJ2aWNlKHRoaXMsICdTZXJ2aWNlJywge1xuICAgICAgY2x1c3RlcjogdGhpcy5jbHVzdGVyLFxuICAgICAgdGFza0RlZmluaXRpb246IHRoaXMudGFza0RlZmluaXRpb24sXG4gICAgICBzZXJ2aWNlTmFtZTogYCR7YXBwTmFtZX0tc3RyZWFtbGl0LXNlcnZpY2VgLFxuICAgICAgZGVzaXJlZENvdW50OiBtaW5DYXBhY2l0eSxcbiAgICAgIGFzc2lnblB1YmxpY0lwOiBmYWxzZSxcbiAgICAgIGVuYWJsZUV4ZWN1dGVDb21tYW5kOiB0cnVlLCAvLyBGb3IgZGVidWdnaW5nXG4gICAgICBwbGF0Zm9ybVZlcnNpb246IGVjcy5GYXJnYXRlUGxhdGZvcm1WZXJzaW9uLkxBVEVTVCxcbiAgICB9KTtcblxuICAgIC8vIEF0dGFjaCBzZXJ2aWNlIHRvIHRhcmdldCBncm91cFxuICAgIHRoaXMuc2VydmljZS5hdHRhY2hUb0FwcGxpY2F0aW9uVGFyZ2V0R3JvdXAodGhpcy50YXJnZXRHcm91cCk7XG5cbiAgICAvLyBDb25maWd1cmUgYXV0by1zY2FsaW5nXG4gICAgaWYgKGVuYWJsZUF1dG9TY2FsaW5nKSB7XG4gICAgICBjb25zdCBzY2FsYWJsZVRhcmdldCA9IHRoaXMuc2VydmljZS5hdXRvU2NhbGVUYXNrQ291bnQoe1xuICAgICAgICBtaW5DYXBhY2l0eTogbWluQ2FwYWNpdHksXG4gICAgICAgIG1heENhcGFjaXR5OiBtYXhDYXBhY2l0eSxcbiAgICAgIH0pO1xuXG4gICAgICBzY2FsYWJsZVRhcmdldC5zY2FsZU9uQ3B1VXRpbGl6YXRpb24oJ0NwdVNjYWxpbmcnLCB7XG4gICAgICAgIHRhcmdldFV0aWxpemF0aW9uUGVyY2VudDogY3B1VGFyZ2V0VXRpbGl6YXRpb24sXG4gICAgICAgIHNjYWxlSW5Db29sZG93bjogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMTApLFxuICAgICAgICBzY2FsZU91dENvb2xkb3duOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIENvbmZpZ3VyZSBIVFRQUyBsaXN0ZW5lciBpZiBkb21haW4gcHJvdmlkZWRcbiAgICBpZiAoZG9tYWluTmFtZSAmJiBob3N0ZWRab25lKSB7XG4gICAgICAvLyBDcmVhdGUgQUNNIGNlcnRpZmljYXRlXG4gICAgICBjb25zdCBjZXJ0aWZpY2F0ZSA9IG5ldyBjZXJ0aWZpY2F0ZW1hbmFnZXIuQ2VydGlmaWNhdGUodGhpcywgJ0NlcnRpZmljYXRlJywge1xuICAgICAgICBkb21haW5OYW1lOiBkb21haW5OYW1lLFxuICAgICAgICB2YWxpZGF0aW9uOiBjZXJ0aWZpY2F0ZW1hbmFnZXIuQ2VydGlmaWNhdGVWYWxpZGF0aW9uLmZyb21EbnMoaG9zdGVkWm9uZSksXG4gICAgICB9KTtcblxuICAgICAgLy8gQ3JlYXRlIEhUVFBTIGxpc3RlbmVyXG4gICAgICBjb25zdCBodHRwc0xpc3RlbmVyID0gdGhpcy5sb2FkQmFsYW5jZXIuYWRkTGlzdGVuZXIoJ0h0dHBzTGlzdGVuZXInLCB7XG4gICAgICAgIHBvcnQ6IDQ0MyxcbiAgICAgICAgcHJvdG9jb2w6IGVsYXN0aWNsb2FkYmFsYW5jaW5ndjIuQXBwbGljYXRpb25Qcm90b2NvbC5IVFRQUyxcbiAgICAgICAgY2VydGlmaWNhdGVzOiBbY2VydGlmaWNhdGVdLFxuICAgICAgICBkZWZhdWx0VGFyZ2V0R3JvdXBzOiBbdGhpcy50YXJnZXRHcm91cF0sXG4gICAgICB9KTtcblxuICAgICAgLy8gUmVkaXJlY3QgSFRUUCB0byBIVFRQU1xuICAgICAgdGhpcy5sb2FkQmFsYW5jZXIuYWRkTGlzdGVuZXIoJ0h0dHBMaXN0ZW5lcicsIHtcbiAgICAgICAgcG9ydDogODAsXG4gICAgICAgIHByb3RvY29sOiBlbGFzdGljbG9hZGJhbGFuY2luZ3YyLkFwcGxpY2F0aW9uUHJvdG9jb2wuSFRUUCxcbiAgICAgICAgZGVmYXVsdEFjdGlvbjogZWxhc3RpY2xvYWRiYWxhbmNpbmd2Mi5MaXN0ZW5lckFjdGlvbi5yZWRpcmVjdCh7XG4gICAgICAgICAgcHJvdG9jb2w6ICdIVFRQUycsXG4gICAgICAgICAgcG9ydDogJzQ0MycsXG4gICAgICAgICAgcGVybWFuZW50OiB0cnVlLFxuICAgICAgICB9KSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBDcmVhdGUgRE5TIHJlY29yZFxuICAgICAgbmV3IHJvdXRlNTMuQVJlY29yZCh0aGlzLCAnQWxpYXNSZWNvcmQnLCB7XG4gICAgICAgIHpvbmU6IGhvc3RlZFpvbmUsXG4gICAgICAgIHJlY29yZE5hbWU6IGRvbWFpbk5hbWUsXG4gICAgICAgIHRhcmdldDogcm91dGU1My5SZWNvcmRUYXJnZXQuZnJvbUFsaWFzKFxuICAgICAgICAgIG5ldyByb3V0ZTUzdGFyZ2V0cy5Mb2FkQmFsYW5jZXJUYXJnZXQodGhpcy5sb2FkQmFsYW5jZXIpXG4gICAgICAgICksXG4gICAgICB9KTtcblxuICAgICAgdGhpcy5kYXNoYm9hcmRVcmwgPSBgaHR0cHM6Ly8ke2RvbWFpbk5hbWV9YDtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gQ3JlYXRlIEhUVFAgbGlzdGVuZXJcbiAgICAgIHRoaXMubG9hZEJhbGFuY2VyLmFkZExpc3RlbmVyKCdIdHRwTGlzdGVuZXInLCB7XG4gICAgICAgIHBvcnQ6IDgwLFxuICAgICAgICBwcm90b2NvbDogZWxhc3RpY2xvYWRiYWxhbmNpbmd2Mi5BcHBsaWNhdGlvblByb3RvY29sLkhUVFAsXG4gICAgICAgIGRlZmF1bHRUYXJnZXRHcm91cHM6IFt0aGlzLnRhcmdldEdyb3VwXSxcbiAgICAgIH0pO1xuXG4gICAgICB0aGlzLmRhc2hib2FyZFVybCA9IGBodHRwOi8vJHt0aGlzLmxvYWRCYWxhbmNlci5sb2FkQmFsYW5jZXJEbnNOYW1lfWA7XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIG1vbml0b3JpbmdcbiAgICB0aGlzLmNyZWF0ZU1vbml0b3JpbmcoYXBwTmFtZSk7XG5cbiAgICAvLyBBcHBseSBjb25zaXN0ZW50IHRhZ2dpbmdcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ1Byb2plY3QnLCBhcHBOYW1lKTtcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ01hbmFnZWRCeScsICdjZGstYWktY29uc3RydWN0cycpO1xuICAgIGNkay5UYWdzLm9mKHRoaXMpLmFkZCgnT3duZXInLCAnam9obmF0aGFuLWhvcm5lcicpO1xuICAgIGNkay5UYWdzLm9mKHRoaXMpLmFkZCgnQ29tcG9uZW50JywgJ1N0cmVhbWxpdERhc2hib2FyZCcpO1xuXG4gICAgLy8gT3V0cHV0IGltcG9ydGFudCB2YWx1ZXNcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRGFzaGJvYXJkVXJsJywge1xuICAgICAgdmFsdWU6IHRoaXMuZGFzaGJvYXJkVXJsLFxuICAgICAgZGVzY3JpcHRpb246ICdVUkwgdG8gYWNjZXNzIHRoZSBTdHJlYW1saXQgZGFzaGJvYXJkJyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke2Nkay5TdGFjay5vZih0aGlzKS5zdGFja05hbWV9LSR7aWR9LURhc2hib2FyZFVybGAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnTG9hZEJhbGFuY2VyRG5zTmFtZScsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmxvYWRCYWxhbmNlci5sb2FkQmFsYW5jZXJEbnNOYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdETlMgbmFtZSBvZiB0aGUgQXBwbGljYXRpb24gTG9hZCBCYWxhbmNlcicsXG4gICAgICBleHBvcnROYW1lOiBgJHtjZGsuU3RhY2sub2YodGhpcykuc3RhY2tOYW1lfS0ke2lkfS1Mb2FkQmFsYW5jZXJEbnNOYW1lYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDbHVzdGVyTmFtZScsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmNsdXN0ZXIuY2x1c3Rlck5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ05hbWUgb2YgdGhlIEVDUyBjbHVzdGVyJyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke2Nkay5TdGFjay5vZih0aGlzKS5zdGFja05hbWV9LSR7aWR9LUNsdXN0ZXJOYW1lYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdTZXJ2aWNlTmFtZScsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnNlcnZpY2Uuc2VydmljZU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ05hbWUgb2YgdGhlIEVDUyBzZXJ2aWNlJyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke2Nkay5TdGFjay5vZih0aGlzKS5zdGFja05hbWV9LSR7aWR9LVNlcnZpY2VOYW1lYCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdMb2dHcm91cE5hbWUnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5sb2dHcm91cC5sb2dHcm91cE5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0Nsb3VkV2F0Y2ggbG9nIGdyb3VwIGZvciBjb250YWluZXIgbG9ncycsXG4gICAgICBleHBvcnROYW1lOiBgJHtjZGsuU3RhY2sub2YodGhpcykuc3RhY2tOYW1lfS0ke2lkfS1Mb2dHcm91cE5hbWVgLFxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBDbG91ZFdhdGNoIG1vbml0b3JpbmcgZm9yIHRoZSBkYXNoYm9hcmRcbiAgICovXG4gIHByaXZhdGUgY3JlYXRlTW9uaXRvcmluZyhhcHBOYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAvLyBDUFUgdXRpbGl6YXRpb24gYWxhcm1cbiAgICBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnSGlnaENwdUFsYXJtJywge1xuICAgICAgYWxhcm1OYW1lOiBgJHthcHBOYW1lfS1zdHJlYW1saXQtaGlnaC1jcHVgLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogYEhpZ2ggQ1BVIHV0aWxpemF0aW9uIGZvciAke2FwcE5hbWV9IFN0cmVhbWxpdCBkYXNoYm9hcmRgLFxuICAgICAgbWV0cmljOiB0aGlzLnNlcnZpY2UubWV0cmljQ3B1VXRpbGl6YXRpb24oe1xuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgICBzdGF0aXN0aWM6ICdBdmVyYWdlJyxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiA4MCxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAzLFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgfSk7XG5cbiAgICAvLyBNZW1vcnkgdXRpbGl6YXRpb24gYWxhcm1cbiAgICBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnSGlnaE1lbW9yeUFsYXJtJywge1xuICAgICAgYWxhcm1OYW1lOiBgJHthcHBOYW1lfS1zdHJlYW1saXQtaGlnaC1tZW1vcnlgLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogYEhpZ2ggbWVtb3J5IHV0aWxpemF0aW9uIGZvciAke2FwcE5hbWV9IFN0cmVhbWxpdCBkYXNoYm9hcmRgLFxuICAgICAgbWV0cmljOiB0aGlzLnNlcnZpY2UubWV0cmljTWVtb3J5VXRpbGl6YXRpb24oe1xuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgICBzdGF0aXN0aWM6ICdBdmVyYWdlJyxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiA4MCxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAzLFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgfSk7XG5cbiAgICAvLyBUYXJnZXQgZ3JvdXAgdW5oZWFsdGh5IGhvc3RzIGFsYXJtXG4gICAgbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgJ1VuaGVhbHRoeUhvc3RzQWxhcm0nLCB7XG4gICAgICBhbGFybU5hbWU6IGAke2FwcE5hbWV9LXN0cmVhbWxpdC11bmhlYWx0aHktaG9zdHNgLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogYFVuaGVhbHRoeSBob3N0cyBmb3IgJHthcHBOYW1lfSBTdHJlYW1saXQgZGFzaGJvYXJkYCxcbiAgICAgIG1ldHJpYzogdGhpcy50YXJnZXRHcm91cC5tZXRyaWNVbmhlYWx0aHlIb3N0Q291bnQoe1xuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgICBzdGF0aXN0aWM6ICdNYXhpbXVtJyxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiAwLFxuICAgICAgY29tcGFyaXNvbk9wZXJhdG9yOiBjbG91ZHdhdGNoLkNvbXBhcmlzb25PcGVyYXRvci5HUkVBVEVSX1RIQU5fVEhSRVNIT0xELFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDIsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICB9KTtcblxuICAgIC8vIExvYWQgYmFsYW5jZXIgcmVzcG9uc2UgdGltZSBhbGFybVxuICAgIG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdIaWdoUmVzcG9uc2VUaW1lQWxhcm0nLCB7XG4gICAgICBhbGFybU5hbWU6IGAke2FwcE5hbWV9LXN0cmVhbWxpdC1oaWdoLXJlc3BvbnNlLXRpbWVgLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogYEhpZ2ggcmVzcG9uc2UgdGltZSBmb3IgJHthcHBOYW1lfSBTdHJlYW1saXQgZGFzaGJvYXJkYCxcbiAgICAgIG1ldHJpYzogdGhpcy50YXJnZXRHcm91cC5tZXRyaWNUYXJnZXRSZXNwb25zZVRpbWUoe1xuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgICBzdGF0aXN0aWM6ICdBdmVyYWdlJyxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiA1LCAvLyA1IHNlY29uZHNcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAzLFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogR3JhbnQgRHluYW1vREIgdGFibGUgcGVybWlzc2lvbnMgdG8gdGhlIHRhc2sgcm9sZVxuICAgKiBAcGFyYW0gdGFibGUgVGhlIER5bmFtb0RCIHRhYmxlIHRvIGdyYW50IGFjY2VzcyB0b1xuICAgKiBAcGFyYW0gYWN0aW9ucyBUaGUgRHluYW1vREIgYWN0aW9ucyB0byBhbGxvd1xuICAgKi9cbiAgcHVibGljIGdyYW50RHluYW1vREJBY2Nlc3ModGFibGU6IGFueSwgYWN0aW9uczogc3RyaW5nW10gPSBbJ2R5bmFtb2RiOkdldEl0ZW0nLCAnZHluYW1vZGI6UXVlcnknLCAnZHluYW1vZGI6U2NhbiddKTogdm9pZCB7XG4gICAgdGhpcy50YXNrUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBhY3Rpb25zLFxuICAgICAgICByZXNvdXJjZXM6IFt0YWJsZS50YWJsZUFybiwgYCR7dGFibGUudGFibGVBcm59L2luZGV4LypgXSxcbiAgICAgIH0pXG4gICAgKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHcmFudCBTMyBidWNrZXQgcGVybWlzc2lvbnMgdG8gdGhlIHRhc2sgcm9sZVxuICAgKiBAcGFyYW0gYnVja2V0QXJuIFRoZSBTMyBidWNrZXQgQVJOIHRvIGdyYW50IGFjY2VzcyB0b1xuICAgKiBAcGFyYW0gYWN0aW9ucyBUaGUgUzMgYWN0aW9ucyB0byBhbGxvd1xuICAgKi9cbiAgcHVibGljIGdyYW50UzNBY2Nlc3MoYnVja2V0QXJuOiBzdHJpbmcsIGFjdGlvbnM6IHN0cmluZ1tdID0gWydzMzpHZXRPYmplY3QnLCAnczM6TGlzdEJ1Y2tldCddKTogdm9pZCB7XG4gICAgdGhpcy50YXNrUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBhY3Rpb25zLFxuICAgICAgICByZXNvdXJjZXM6IFtidWNrZXRBcm4sIGAke2J1Y2tldEFybn0vKmBdLFxuICAgICAgfSlcbiAgICApO1xuICB9XG5cbiAgLyoqXG4gICAqIFVwZGF0ZSB0aGUgZGVzaXJlZCBjb3VudCBvZiB0aGUgc2VydmljZVxuICAgKiBAcGFyYW0gY291bnQgVGhlIGRlc2lyZWQgbnVtYmVyIG9mIHRhc2tzXG4gICAqL1xuICBwdWJsaWMgdXBkYXRlRGVzaXJlZENvdW50KGNvdW50OiBudW1iZXIpOiB2b2lkIHtcbiAgICBjb25zdCBjZm5TZXJ2aWNlID0gdGhpcy5zZXJ2aWNlLm5vZGUuZGVmYXVsdENoaWxkIGFzIGVjcy5DZm5TZXJ2aWNlO1xuICAgIGNmblNlcnZpY2UuZGVzaXJlZENvdW50ID0gY291bnQ7XG4gIH1cbn0iXX0=