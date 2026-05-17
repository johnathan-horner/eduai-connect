"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.APIGatewayLambda = void 0;
const apigateway = require("aws-cdk-lib/aws-apigateway");
const logs = require("aws-cdk-lib/aws-logs");
const cloudwatch = require("aws-cdk-lib/aws-cloudwatch");
const iam = require("aws-cdk-lib/aws-iam");
const cdk = require("aws-cdk-lib");
const constructs_1 = require("constructs");
/**
 * A construct that creates an API Gateway REST API with Lambda integrations,
 * optional Cognito authorization, CORS support, throttling, and monitoring.
 *
 * Features:
 * - REST API with configurable routes and methods
 * - Lambda function integrations with proper permissions
 * - Optional Cognito User Pool authorization
 * - CORS configuration for web clients
 * - Request throttling with usage plans
 * - CloudWatch access logging and monitoring
 * - Error handling with proper HTTP status codes
 *
 * @example
 * ```typescript
 * const getUsersFunction = new lambda.Function(this, 'GetUsers', {
 *   runtime: lambda.Runtime.PYTHON_3_11,
 *   handler: 'index.get_users',
 *   code: lambda.Code.fromAsset('lambda'),
 * });
 *
 * const createUserFunction = new lambda.Function(this, 'CreateUser', {
 *   runtime: lambda.Runtime.PYTHON_3_11,
 *   handler: 'index.create_user',
 *   code: lambda.Code.fromAsset('lambda'),
 * });
 *
 * new APIGatewayLambda(this, 'API', {
 *   appName: 'MyApp',
 *   apiName: 'user-management-api',
 *   routes: [
 *     { method: 'GET', path: '/users', handler: getUsersFunction },
 *     { method: 'POST', path: '/users', handler: createUserFunction },
 *     { method: 'GET', path: '/users/{id}', handler: getUserFunction }
 *   ],
 *   cognitoAuthorizer: userPool,
 *   corsOrigins: ['https://myapp.com'],
 *   throttle: { rateLimit: 100, burstLimit: 200 }
 * });
 * ```
 */
class APIGatewayLambda extends constructs_1.Construct {
    /**
     * The API Gateway REST API
     */
    api;
    /**
     * Cognito authorizer (if created)
     */
    authorizer;
    /**
     * Usage plan for throttling (if created)
     */
    usagePlan;
    /**
     * API key for usage plan (if created)
     */
    apiKey;
    /**
     * CloudWatch log group for API access logs
     */
    accessLogGroup;
    /**
     * Map of created resources for programmatic access
     */
    resources = new Map();
    constructor(scope, id, props) {
        super(scope, id);
        const { apiName, routes, cognitoAuthorizer, corsOrigins = ['*'], throttle, appName, enableAccessLogs = true, logRetentionDays = 30, stageName = 'prod', domainName, } = props;
        // Create CloudWatch log group for access logs
        if (enableAccessLogs) {
            this.accessLogGroup = new logs.LogGroup(this, 'AccessLogGroup', {
                logGroupName: `/aws/apigateway/${apiName}`,
                retention: logRetentionDays === 30 ? logs.RetentionDays.ONE_MONTH :
                    logRetentionDays === 7 ? logs.RetentionDays.ONE_WEEK :
                        logs.RetentionDays.ONE_MONTH,
                removalPolicy: cdk.RemovalPolicy.DESTROY,
            });
        }
        // Create API Gateway
        this.api = new apigateway.RestApi(this, 'API', {
            restApiName: apiName,
            description: `REST API for ${appName}`,
            defaultCorsPreflightOptions: {
                allowOrigins: corsOrigins,
                allowMethods: apigateway.Cors.ALL_METHODS,
                allowHeaders: [
                    'Content-Type',
                    'Authorization',
                    'X-Amz-Date',
                    'X-Api-Key',
                    'X-Amz-Security-Token',
                ],
                allowCredentials: true,
            },
            deployOptions: {
                stageName: stageName,
                accessLogDestination: this.accessLogGroup
                    ? new apigateway.LogGroupLogDestination(this.accessLogGroup)
                    : undefined,
                accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields({
                    caller: true,
                    httpMethod: true,
                    ip: true,
                    protocol: true,
                    requestTime: true,
                    resourcePath: true,
                    responseLength: true,
                    status: true,
                    user: true,
                }),
                loggingLevel: apigateway.MethodLoggingLevel.INFO,
                dataTraceEnabled: false,
                metricsEnabled: true,
                throttlingRateLimit: throttle?.rateLimit,
                throttlingBurstLimit: throttle?.burstLimit,
            },
            endpointConfiguration: {
                types: [apigateway.EndpointType.REGIONAL],
            },
        });
        // Create Cognito authorizer if provided
        if (cognitoAuthorizer) {
            this.authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
                cognitoUserPools: [cognitoAuthorizer],
                authorizerName: `${apiName}-authorizer`,
                identitySource: 'method.request.header.Authorization',
            });
        }
        // Create resources and methods
        this.createRoutesAndMethods(routes, props);
        // Create usage plan and API key if throttling is enabled
        if (throttle) {
            this.usagePlan = new apigateway.UsagePlan(this, 'UsagePlan', {
                name: `${apiName}-usage-plan`,
                description: `Usage plan for ${apiName}`,
                throttle: {
                    rateLimit: throttle.rateLimit,
                    burstLimit: throttle.burstLimit,
                },
                apiStages: [
                    {
                        api: this.api,
                        stage: this.api.deploymentStage,
                    },
                ],
            });
            this.apiKey = new apigateway.ApiKey(this, 'ApiKey', {
                apiKeyName: `${apiName}-key`,
                description: `API key for ${apiName}`,
            });
            this.usagePlan.addApiKey(this.apiKey);
        }
        // Create monitoring
        this.createMonitoring(appName);
        // Apply consistent tagging
        cdk.Tags.of(this).add('Project', appName);
        cdk.Tags.of(this).add('ManagedBy', 'cdk-ai-constructs');
        cdk.Tags.of(this).add('Owner', 'johnathan-horner');
        cdk.Tags.of(this).add('Component', 'APIGateway');
        // Output important values
        new cdk.CfnOutput(this, 'ApiUrl', {
            value: this.api.url,
            description: 'API Gateway endpoint URL',
            exportName: `${cdk.Stack.of(this).stackName}-${id}-ApiUrl`,
        });
        new cdk.CfnOutput(this, 'ApiId', {
            value: this.api.restApiId,
            description: 'API Gateway REST API ID',
            exportName: `${cdk.Stack.of(this).stackName}-${id}-ApiId`,
        });
        if (this.apiKey) {
            new cdk.CfnOutput(this, 'ApiKeyId', {
                value: this.apiKey.keyId,
                description: 'API Key ID for throttled requests',
                exportName: `${cdk.Stack.of(this).stackName}-${id}-ApiKeyId`,
            });
        }
        if (this.accessLogGroup) {
            new cdk.CfnOutput(this, 'AccessLogGroupName', {
                value: this.accessLogGroup.logGroupName,
                description: 'CloudWatch log group for API access logs',
                exportName: `${cdk.Stack.of(this).stackName}-${id}-AccessLogGroupName`,
            });
        }
        new cdk.CfnOutput(this, 'RoutesSummary', {
            value: JSON.stringify(routes.map(route => ({
                method: route.method,
                path: route.path,
                function: route.handler.functionName,
            }))),
            description: 'Summary of API routes and their handlers',
            exportName: `${cdk.Stack.of(this).stackName}-${id}-RoutesSummary`,
        });
    }
    /**
     * Create API Gateway resources and methods for all routes
     */
    createRoutesAndMethods(routes, props) {
        // Group routes by path to avoid duplicate resource creation
        const pathRoutes = new Map();
        routes.forEach(route => {
            if (!pathRoutes.has(route.path)) {
                pathRoutes.set(route.path, []);
            }
            pathRoutes.get(route.path).push(route);
        });
        // Create resources and methods
        pathRoutes.forEach((routesForPath, path) => {
            const resource = this.createResourceFromPath(path);
            this.resources.set(path, resource);
            routesForPath.forEach(route => {
                const integration = new apigateway.LambdaIntegration(route.handler, {
                    proxy: true,
                    allowTestInvoke: false,
                });
                const methodOptions = {
                    operationName: `${route.method}${path.replace(/[{}]/g, '').replace(/\//g, '_')}`,
                };
                // Add authorization if required
                const requiresAuth = route.requiresAuth ?? (props.cognitoAuthorizer ? true : false);
                if (requiresAuth && this.authorizer) {
                    methodOptions.authorizer = this.authorizer;
                    methodOptions.authorizationType = apigateway.AuthorizationType.COGNITO;
                }
                // Add request validation
                if (route.requestValidation) {
                    // Request validation would need a request validator model
                    // This is a simplified implementation
                }
                resource.addMethod(route.method, integration, methodOptions);
                // Grant invoke permission to Lambda
                route.handler.addPermission(`ApiGatewayInvoke-${route.method}-${path.replace(/\//g, '-')}`, {
                    principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
                    action: 'lambda:InvokeFunction',
                    sourceArn: this.api.arnForExecuteApi(route.method, path),
                });
            });
        });
    }
    /**
     * Create API Gateway resource from path
     */
    createResourceFromPath(path) {
        const segments = path.split('/').filter(segment => segment.length > 0);
        let currentResource = this.api.root;
        for (const segment of segments) {
            const existingResource = currentResource.getResource(segment);
            if (existingResource) {
                currentResource = existingResource;
            }
            else {
                currentResource = currentResource.addResource(segment);
            }
        }
        return currentResource;
    }
    /**
     * Create CloudWatch monitoring for the API
     */
    createMonitoring(appName) {
        // Create alarm for 4XX errors
        new cloudwatch.Alarm(this, '4XXErrorAlarm', {
            alarmName: `${appName}-api-4xx-errors`,
            alarmDescription: `Monitor 4XX errors in ${appName} API Gateway`,
            metric: this.api.metricClientError({
                period: cdk.Duration.minutes(5),
                statistic: 'Sum',
            }),
            threshold: 10,
            evaluationPeriods: 2,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
        // Create alarm for 5XX errors
        new cloudwatch.Alarm(this, '5XXErrorAlarm', {
            alarmName: `${appName}-api-5xx-errors`,
            alarmDescription: `Monitor 5XX errors in ${appName} API Gateway`,
            metric: this.api.metricServerError({
                period: cdk.Duration.minutes(5),
                statistic: 'Sum',
            }),
            threshold: 5,
            evaluationPeriods: 1,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
        // Create alarm for high latency
        new cloudwatch.Alarm(this, 'LatencyAlarm', {
            alarmName: `${appName}-api-high-latency`,
            alarmDescription: `Monitor high latency in ${appName} API Gateway`,
            metric: this.api.metricLatency({
                period: cdk.Duration.minutes(5),
                statistic: 'Average',
            }),
            threshold: 5000, // 5 seconds
            evaluationPeriods: 3,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
    }
    /**
     * Add a new route to the API
     * @param route The route configuration to add
     */
    addRoute(route) {
        const resource = this.createResourceFromPath(route.path);
        this.resources.set(route.path, resource);
        const integration = new apigateway.LambdaIntegration(route.handler, {
            proxy: true,
            allowTestInvoke: false,
        });
        const methodOptions = {
            operationName: `${route.method}${route.path.replace(/[{}]/g, '').replace(/\//g, '_')}`,
        };
        // Add authorization if required
        const requiresAuth = route.requiresAuth ?? (this.authorizer ? true : false);
        if (requiresAuth && this.authorizer) {
            methodOptions.authorizer = this.authorizer;
            methodOptions.authorizationType = apigateway.AuthorizationType.COGNITO;
        }
        resource.addMethod(route.method, integration, methodOptions);
        // Grant invoke permission to Lambda
        route.handler.addPermission(`ApiGatewayInvoke-${route.method}-${route.path.replace(/\//g, '-')}`, {
            principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
            action: 'lambda:InvokeFunction',
            sourceArn: this.api.arnForExecuteApi(route.method, route.path),
        });
    }
    /**
     * Get a resource by path
     * @param path The resource path
     * @returns The API Gateway resource
     */
    getResource(path) {
        return this.resources.get(path);
    }
}
exports.APIGatewayLambda = APIGatewayLambda;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBpLWdhdGV3YXktbGFtYmRhLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vY29uc3RydWN0cy9hcGktZ2F0ZXdheS1sYW1iZGEudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEseURBQXlEO0FBR3pELDZDQUE2QztBQUM3Qyx5REFBeUQ7QUFDekQsMkNBQTJDO0FBQzNDLG1DQUFtQztBQUNuQywyQ0FBdUM7QUFvSHZDOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBd0NHO0FBQ0gsTUFBYSxnQkFBaUIsU0FBUSxzQkFBUztJQUM3Qzs7T0FFRztJQUNhLEdBQUcsQ0FBcUI7SUFFeEM7O09BRUc7SUFDYSxVQUFVLENBQXlDO0lBRW5FOztPQUVHO0lBQ2EsU0FBUyxDQUF3QjtJQUVqRDs7T0FFRztJQUNhLE1BQU0sQ0FBcUI7SUFFM0M7O09BRUc7SUFDYSxjQUFjLENBQWlCO0lBRS9DOztPQUVHO0lBQ2EsU0FBUyxHQUFxQyxJQUFJLEdBQUcsRUFBRSxDQUFDO0lBRXhFLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBNEI7UUFDcEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixNQUFNLEVBQ0osT0FBTyxFQUNQLE1BQU0sRUFDTixpQkFBaUIsRUFDakIsV0FBVyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQ25CLFFBQVEsRUFDUixPQUFPLEVBQ1AsZ0JBQWdCLEdBQUcsSUFBSSxFQUN2QixnQkFBZ0IsR0FBRyxFQUFFLEVBQ3JCLFNBQVMsR0FBRyxNQUFNLEVBQ2xCLFVBQVUsR0FDWCxHQUFHLEtBQUssQ0FBQztRQUVWLDhDQUE4QztRQUM5QyxJQUFJLGdCQUFnQixFQUFFLENBQUM7WUFDckIsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLGdCQUFnQixFQUFFO2dCQUM5RCxZQUFZLEVBQUUsbUJBQW1CLE9BQU8sRUFB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VyxFQUFFLGFBQWEsQ0FBQyxDQUFDO1FBRTdELG9DQUFvQztRQUNwQyxLQUFLLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxvQkFBb0IsS0FBSyxDQUFDLE1BQU0sSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLEVBQUUsRUFBRTtZQUNoRyxTQUFTLEVBQUUsSUFBSSxHQUFHLENBQUMsZ0JBQWdCLENBQUMsMEJBQTBCLENBQUM7WUFDL0QsTUFBTSxFQUFFLHVCQUF1QjtZQUMvQixTQUFTLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUM7U0FDL0QsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVEOzs7O09BSUc7SUFDSSxXQUFXLENBQUMsSUFBWTtRQUM3QixPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2xDLENBQUM7Q0FDRjtBQTNWRCw0Q0EyVkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBhcGlnYXRld2F5IGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5JztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGNvZ25pdG8gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZ25pdG8nO1xuaW1wb3J0ICogYXMgbG9ncyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbG9ncyc7XG5pbXBvcnQgKiBhcyBjbG91ZHdhdGNoIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZHdhdGNoJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcblxuLyoqXG4gKiBSb3V0ZSBjb25maWd1cmF0aW9uIGZvciBBUEkgR2F0ZXdheVxuICovXG5leHBvcnQgaW50ZXJmYWNlIEFwaVJvdXRlIHtcbiAgLyoqXG4gICAqIEhUVFAgbWV0aG9kXG4gICAqL1xuICByZWFkb25seSBtZXRob2Q6IHN0cmluZztcblxuICAvKipcbiAgICogUmVzb3VyY2UgcGF0aCAoY2FuIGluY2x1ZGUgcGF0aCBwYXJhbWV0ZXJzIGxpa2UgJy91c2Vycy97aWR9JylcbiAgICovXG4gIHJlYWRvbmx5IHBhdGg6IHN0cmluZztcblxuICAvKipcbiAgICogTGFtYmRhIGZ1bmN0aW9uIHRvIGhhbmRsZSB0aGlzIHJvdXRlXG4gICAqL1xuICByZWFkb25seSBoYW5kbGVyOiBsYW1iZGEuRnVuY3Rpb247XG5cbiAgLyoqXG4gICAqIFdoZXRoZXIgdGhpcyByb3V0ZSByZXF1aXJlcyBhdXRoZW50aWNhdGlvblxuICAgKiBAZGVmYXVsdCB0cnVlIGlmIGNvZ25pdG9BdXRob3JpemVyIGlzIHByb3ZpZGVkIGluIGNvbnN0cnVjdCBwcm9wc1xuICAgKi9cbiAgcmVhZG9ubHkgcmVxdWlyZXNBdXRoPzogYm9vbGVhbjtcblxuICAvKipcbiAgICogUmVxdWVzdCB2YWxpZGF0aW9uIHNldHRpbmdzXG4gICAqIEBkZWZhdWx0IHVuZGVmaW5lZFxuICAgKi9cbiAgcmVhZG9ubHkgcmVxdWVzdFZhbGlkYXRpb24/OiB7XG4gICAgdmFsaWRhdGVCb2R5PzogYm9vbGVhbjtcbiAgICB2YWxpZGF0ZVBhcmFtZXRlcnM/OiBib29sZWFuO1xuICB9O1xufVxuXG4vKipcbiAqIFRocm90dGxpbmcgY29uZmlndXJhdGlvblxuICovXG5leHBvcnQgaW50ZXJmYWNlIFRocm90dGxlQ29uZmlnIHtcbiAgLyoqXG4gICAqIFJlcXVlc3RzIHBlciBzZWNvbmQgbGltaXRcbiAgICovXG4gIHJlYWRvbmx5IHJhdGVMaW1pdDogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBCdXJzdCBsaW1pdCBmb3IgdGVtcG9yYXJ5IHNwaWtlc1xuICAgKi9cbiAgcmVhZG9ubHkgYnVyc3RMaW1pdDogbnVtYmVyO1xufVxuXG4vKipcbiAqIFByb3BlcnRpZXMgZm9yIEFQSUdhdGV3YXlMYW1iZGEgY29uc3RydWN0XG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQVBJR2F0ZXdheUxhbWJkYVByb3BzIHtcbiAgLyoqXG4gICAqIE5hbWUgZm9yIHRoZSBBUEkgR2F0ZXdheVxuICAgKi9cbiAgcmVhZG9ubHkgYXBpTmFtZTogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBBcnJheSBvZiByb3V0ZXMgdG8gY3JlYXRlXG4gICAqL1xuICByZWFkb25seSByb3V0ZXM6IEFwaVJvdXRlW107XG5cbiAgLyoqXG4gICAqIENvZ25pdG8gVXNlciBQb29sIGZvciBhdXRob3JpemF0aW9uXG4gICAqIElmIHByb3ZpZGVkLCBjcmVhdGVzIGEgQ29nbml0byBhdXRob3JpemVyXG4gICAqIEBkZWZhdWx0IHVuZGVmaW5lZFxuICAgKi9cbiAgcmVhZG9ubHkgY29nbml0b0F1dGhvcml6ZXI/OiBjb2duaXRvLlVzZXJQb29sO1xuXG4gIC8qKlxuICAgKiBDT1JTIGFsbG93ZWQgb3JpZ2luc1xuICAgKiBAZGVmYXVsdCBbJyonXVxuICAgKi9cbiAgcmVhZG9ubHkgY29yc09yaWdpbnM/OiBzdHJpbmdbXTtcblxuICAvKipcbiAgICogVGhyb3R0bGluZyBjb25maWd1cmF0aW9uXG4gICAqIElmIHByb3ZpZGVkLCBjcmVhdGVzIHVzYWdlIHBsYW4gd2l0aCBBUEkga2V5XG4gICAqIEBkZWZhdWx0IHVuZGVmaW5lZFxuICAgKi9cbiAgcmVhZG9ubHkgdGhyb3R0bGU/OiBUaHJvdHRsZUNvbmZpZztcblxuICAvKipcbiAgICogQXBwbGljYXRpb24gbmFtZSBmb3IgY29uc2lzdGVudCB0YWdnaW5nIGFuZCBuYW1pbmdcbiAgICovXG4gIHJlYWRvbmx5IGFwcE5hbWU6IHN0cmluZztcblxuICAvKipcbiAgICogRW5hYmxlIENsb3VkV2F0Y2ggYWNjZXNzIGxvZ2dpbmdcbiAgICogQGRlZmF1bHQgdHJ1ZVxuICAgKi9cbiAgcmVhZG9ubHkgZW5hYmxlQWNjZXNzTG9ncz86IGJvb2xlYW47XG5cbiAgLyoqXG4gICAqIENsb3VkV2F0Y2ggbG9nIHJldGVudGlvbiBwZXJpb2QgaW4gZGF5c1xuICAgKiBAZGVmYXVsdCAzMFxuICAgKi9cbiAgcmVhZG9ubHkgbG9nUmV0ZW50aW9uRGF5cz86IG51bWJlcjtcblxuICAvKipcbiAgICogRGVwbG95IHRvIGEgc3BlY2lmaWMgc3RhZ2UgbmFtZVxuICAgKiBAZGVmYXVsdCAncHJvZCdcbiAgICovXG4gIHJlYWRvbmx5IHN0YWdlTmFtZT86IHN0cmluZztcblxuICAvKipcbiAgICogQ3VzdG9tIGRvbWFpbiBuYW1lIGZvciB0aGUgQVBJXG4gICAqIEBkZWZhdWx0IHVuZGVmaW5lZFxuICAgKi9cbiAgcmVhZG9ubHkgZG9tYWluTmFtZT86IHN0cmluZztcbn1cblxuLyoqXG4gKiBBIGNvbnN0cnVjdCB0aGF0IGNyZWF0ZXMgYW4gQVBJIEdhdGV3YXkgUkVTVCBBUEkgd2l0aCBMYW1iZGEgaW50ZWdyYXRpb25zLFxuICogb3B0aW9uYWwgQ29nbml0byBhdXRob3JpemF0aW9uLCBDT1JTIHN1cHBvcnQsIHRocm90dGxpbmcsIGFuZCBtb25pdG9yaW5nLlxuICpcbiAqIEZlYXR1cmVzOlxuICogLSBSRVNUIEFQSSB3aXRoIGNvbmZpZ3VyYWJsZSByb3V0ZXMgYW5kIG1ldGhvZHNcbiAqIC0gTGFtYmRhIGZ1bmN0aW9uIGludGVncmF0aW9ucyB3aXRoIHByb3BlciBwZXJtaXNzaW9uc1xuICogLSBPcHRpb25hbCBDb2duaXRvIFVzZXIgUG9vbCBhdXRob3JpemF0aW9uXG4gKiAtIENPUlMgY29uZmlndXJhdGlvbiBmb3Igd2ViIGNsaWVudHNcbiAqIC0gUmVxdWVzdCB0aHJvdHRsaW5nIHdpdGggdXNhZ2UgcGxhbnNcbiAqIC0gQ2xvdWRXYXRjaCBhY2Nlc3MgbG9nZ2luZyBhbmQgbW9uaXRvcmluZ1xuICogLSBFcnJvciBoYW5kbGluZyB3aXRoIHByb3BlciBIVFRQIHN0YXR1cyBjb2Rlc1xuICpcbiAqIEBleGFtcGxlXG4gKiBgYGB0eXBlc2NyaXB0XG4gKiBjb25zdCBnZXRVc2Vyc0Z1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnR2V0VXNlcnMnLCB7XG4gKiAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzExLFxuICogICBoYW5kbGVyOiAnaW5kZXguZ2V0X3VzZXJzJyxcbiAqICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCdsYW1iZGEnKSxcbiAqIH0pO1xuICpcbiAqIGNvbnN0IGNyZWF0ZVVzZXJGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0NyZWF0ZVVzZXInLCB7XG4gKiAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzExLFxuICogICBoYW5kbGVyOiAnaW5kZXguY3JlYXRlX3VzZXInLFxuICogICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYScpLFxuICogfSk7XG4gKlxuICogbmV3IEFQSUdhdGV3YXlMYW1iZGEodGhpcywgJ0FQSScsIHtcbiAqICAgYXBwTmFtZTogJ015QXBwJyxcbiAqICAgYXBpTmFtZTogJ3VzZXItbWFuYWdlbWVudC1hcGknLFxuICogICByb3V0ZXM6IFtcbiAqICAgICB7IG1ldGhvZDogJ0dFVCcsIHBhdGg6ICcvdXNlcnMnLCBoYW5kbGVyOiBnZXRVc2Vyc0Z1bmN0aW9uIH0sXG4gKiAgICAgeyBtZXRob2Q6ICdQT1NUJywgcGF0aDogJy91c2VycycsIGhhbmRsZXI6IGNyZWF0ZVVzZXJGdW5jdGlvbiB9LFxuICogICAgIHsgbWV0aG9kOiAnR0VUJywgcGF0aDogJy91c2Vycy97aWR9JywgaGFuZGxlcjogZ2V0VXNlckZ1bmN0aW9uIH1cbiAqICAgXSxcbiAqICAgY29nbml0b0F1dGhvcml6ZXI6IHVzZXJQb29sLFxuICogICBjb3JzT3JpZ2luczogWydodHRwczovL215YXBwLmNvbSddLFxuICogICB0aHJvdHRsZTogeyByYXRlTGltaXQ6IDEwMCwgYnVyc3RMaW1pdDogMjAwIH1cbiAqIH0pO1xuICogYGBgXG4gKi9cbmV4cG9ydCBjbGFzcyBBUElHYXRld2F5TGFtYmRhIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgLyoqXG4gICAqIFRoZSBBUEkgR2F0ZXdheSBSRVNUIEFQSVxuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGFwaTogYXBpZ2F0ZXdheS5SZXN0QXBpO1xuXG4gIC8qKlxuICAgKiBDb2duaXRvIGF1dGhvcml6ZXIgKGlmIGNyZWF0ZWQpXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgYXV0aG9yaXplcj86IGFwaWdhdGV3YXkuQ29nbml0b1VzZXJQb29sc0F1dGhvcml6ZXI7XG5cbiAgLyoqXG4gICAqIFVzYWdlIHBsYW4gZm9yIHRocm90dGxpbmcgKGlmIGNyZWF0ZWQpXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgdXNhZ2VQbGFuPzogYXBpZ2F0ZXdheS5Vc2FnZVBsYW47XG5cbiAgLyoqXG4gICAqIEFQSSBrZXkgZm9yIHVzYWdlIHBsYW4gKGlmIGNyZWF0ZWQpXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgYXBpS2V5PzogYXBpZ2F0ZXdheS5BcGlLZXk7XG5cbiAgLyoqXG4gICAqIENsb3VkV2F0Y2ggbG9nIGdyb3VwIGZvciBBUEkgYWNjZXNzIGxvZ3NcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBhY2Nlc3NMb2dHcm91cD86IGxvZ3MuTG9nR3JvdXA7XG5cbiAgLyoqXG4gICAqIE1hcCBvZiBjcmVhdGVkIHJlc291cmNlcyBmb3IgcHJvZ3JhbW1hdGljIGFjY2Vzc1xuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IHJlc291cmNlczogTWFwPHN0cmluZywgYXBpZ2F0ZXdheS5SZXNvdXJjZT4gPSBuZXcgTWFwKCk7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEFQSUdhdGV3YXlMYW1iZGFQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICBjb25zdCB7XG4gICAgICBhcGlOYW1lLFxuICAgICAgcm91dGVzLFxuICAgICAgY29nbml0b0F1dGhvcml6ZXIsXG4gICAgICBjb3JzT3JpZ2lucyA9IFsnKiddLFxuICAgICAgdGhyb3R0bGUsXG4gICAgICBhcHBOYW1lLFxuICAgICAgZW5hYmxlQWNjZXNzTG9ncyA9IHRydWUsXG4gICAgICBsb2dSZXRlbnRpb25EYXlzID0gMzAsXG4gICAgICBzdGFnZU5hbWUgPSAncHJvZCcsXG4gICAgICBkb21haW5OYW1lLFxuICAgIH0gPSBwcm9wcztcblxuICAgIC8vIENyZWF0ZSBDbG91ZFdhdGNoIGxvZyBncm91cCBmb3IgYWNjZXNzIGxvZ3NcbiAgICBpZiAoZW5hYmxlQWNjZXNzTG9ncykge1xuICAgICAgdGhpcy5hY2Nlc3NMb2dHcm91cCA9IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdBY2Nlc3NMb2dHcm91cCcsIHtcbiAgICAgICAgbG9nR3JvdXBOYW1lOiBgL2F3cy9hcGlnYXRld2F5LyR7YXBpTmFtZX1gLFxuICAgICAgICByZXRlbnRpb246IGxvZ1JldGVudGlvbkRheXMgPT09IDMwID8gbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCA6XG4gICAgICAgICAgICAgICAgICAgbG9nUmV0ZW50aW9uRGF5cyA9PT0gNyA/IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyA6XG4gICAgICAgICAgICAgICAgICAgbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCxcbiAgICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIENyZWF0ZSBBUEkgR2F0ZXdheVxuICAgIHRoaXMuYXBpID0gbmV3IGFwaWdhdGV3YXkuUmVzdEFwaSh0aGlzLCAnQVBJJywge1xuICAgICAgcmVzdEFwaU5hbWU6IGFwaU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogYFJFU1QgQVBJIGZvciAke2FwcE5hbWV9YCxcbiAgICAgIGRlZmF1bHRDb3JzUHJlZmxpZ2h0T3B0aW9uczoge1xuICAgICAgICBhbGxvd09yaWdpbnM6IGNvcnNPcmlnaW5zLFxuICAgICAgICBhbGxvd01ldGhvZHM6IGFwaWdhdGV3YXkuQ29ycy5BTExfTUVUSE9EUyxcbiAgICAgICAgYWxsb3dIZWFkZXJzOiBbXG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZScsXG4gICAgICAgICAgJ0F1dGhvcml6YXRpb24nLFxuICAgICAgICAgICdYLUFtei1EYXRlJyxcbiAgICAgICAgICAnWC1BcGktS2V5JyxcbiAgICAgICAgICAnWC1BbXotU2VjdXJpdHktVG9rZW4nLFxuICAgICAgICBdLFxuICAgICAgICBhbGxvd0NyZWRlbnRpYWxzOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIGRlcGxveU9wdGlvbnM6IHtcbiAgICAgICAgc3RhZ2VOYW1lOiBzdGFnZU5hbWUsXG4gICAgICAgIGFjY2Vzc0xvZ0Rlc3RpbmF0aW9uOiB0aGlzLmFjY2Vzc0xvZ0dyb3VwXG4gICAgICAgICAgPyBuZXcgYXBpZ2F0ZXdheS5Mb2dHcm91cExvZ0Rlc3RpbmF0aW9uKHRoaXMuYWNjZXNzTG9nR3JvdXApXG4gICAgICAgICAgOiB1bmRlZmluZWQsXG4gICAgICAgIGFjY2Vzc0xvZ0Zvcm1hdDogYXBpZ2F0ZXdheS5BY2Nlc3NMb2dGb3JtYXQuanNvbldpdGhTdGFuZGFyZEZpZWxkcyh7XG4gICAgICAgICAgY2FsbGVyOiB0cnVlLFxuICAgICAgICAgIGh0dHBNZXRob2Q6IHRydWUsXG4gICAgICAgICAgaXA6IHRydWUsXG4gICAgICAgICAgcHJvdG9jb2w6IHRydWUsXG4gICAgICAgICAgcmVxdWVzdFRpbWU6IHRydWUsXG4gICAgICAgICAgcmVzb3VyY2VQYXRoOiB0cnVlLFxuICAgICAgICAgIHJlc3BvbnNlTGVuZ3RoOiB0cnVlLFxuICAgICAgICAgIHN0YXR1czogdHJ1ZSxcbiAgICAgICAgICB1c2VyOiB0cnVlLFxuICAgICAgICB9KSxcbiAgICAgICAgbG9nZ2luZ0xldmVsOiBhcGlnYXRld2F5Lk1ldGhvZExvZ2dpbmdMZXZlbC5JTkZPLFxuICAgICAgICBkYXRhVHJhY2VFbmFibGVkOiBmYWxzZSxcbiAgICAgICAgbWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIHRocm90dGxpbmdSYXRlTGltaXQ6IHRocm90dGxlPy5yYXRlTGltaXQsXG4gICAgICAgIHRocm90dGxpbmdCdXJzdExpbWl0OiB0aHJvdHRsZT8uYnVyc3RMaW1pdCxcbiAgICAgIH0sXG4gICAgICBlbmRwb2ludENvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgdHlwZXM6IFthcGlnYXRld2F5LkVuZHBvaW50VHlwZS5SRUdJT05BTF0sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIENvZ25pdG8gYXV0aG9yaXplciBpZiBwcm92aWRlZFxuICAgIGlmIChjb2duaXRvQXV0aG9yaXplcikge1xuICAgICAgdGhpcy5hdXRob3JpemVyID0gbmV3IGFwaWdhdGV3YXkuQ29nbml0b1VzZXJQb29sc0F1dGhvcml6ZXIodGhpcywgJ0NvZ25pdG9BdXRob3JpemVyJywge1xuICAgICAgICBjb2duaXRvVXNlclBvb2xzOiBbY29nbml0b0F1dGhvcml6ZXJdLFxuICAgICAgICBhdXRob3JpemVyTmFtZTogYCR7YXBpTmFtZX0tYXV0aG9yaXplcmAsXG4gICAgICAgIGlkZW50aXR5U291cmNlOiAnbWV0aG9kLnJlcXVlc3QuaGVhZGVyLkF1dGhvcml6YXRpb24nLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIHJlc291cmNlcyBhbmQgbWV0aG9kc1xuICAgIHRoaXMuY3JlYXRlUm91dGVzQW5kTWV0aG9kcyhyb3V0ZXMsIHByb3BzKTtcblxuICAgIC8vIENyZWF0ZSB1c2FnZSBwbGFuIGFuZCBBUEkga2V5IGlmIHRocm90dGxpbmcgaXMgZW5hYmxlZFxuICAgIGlmICh0aHJvdHRsZSkge1xuICAgICAgdGhpcy51c2FnZVBsYW4gPSBuZXcgYXBpZ2F0ZXdheS5Vc2FnZVBsYW4odGhpcywgJ1VzYWdlUGxhbicsIHtcbiAgICAgICAgbmFtZTogYCR7YXBpTmFtZX0tdXNhZ2UtcGxhbmAsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBgVXNhZ2UgcGxhbiBmb3IgJHthcGlOYW1lfWAsXG4gICAgICAgIHRocm90dGxlOiB7XG4gICAgICAgICAgcmF0ZUxpbWl0OiB0aHJvdHRsZS5yYXRlTGltaXQsXG4gICAgICAgICAgYnVyc3RMaW1pdDogdGhyb3R0bGUuYnVyc3RMaW1pdCxcbiAgICAgICAgfSxcbiAgICAgICAgYXBpU3RhZ2VzOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgYXBpOiB0aGlzLmFwaSxcbiAgICAgICAgICAgIHN0YWdlOiB0aGlzLmFwaS5kZXBsb3ltZW50U3RhZ2UsXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgIH0pO1xuXG4gICAgICB0aGlzLmFwaUtleSA9IG5ldyBhcGlnYXRld2F5LkFwaUtleSh0aGlzLCAnQXBpS2V5Jywge1xuICAgICAgICBhcGlLZXlOYW1lOiBgJHthcGlOYW1lfS1rZXlgLFxuICAgICAgICBkZXNjcmlwdGlvbjogYEFQSSBrZXkgZm9yICR7YXBpTmFtZX1gLFxuICAgICAgfSk7XG5cbiAgICAgIHRoaXMudXNhZ2VQbGFuLmFkZEFwaUtleSh0aGlzLmFwaUtleSk7XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIG1vbml0b3JpbmdcbiAgICB0aGlzLmNyZWF0ZU1vbml0b3JpbmcoYXBwTmFtZSk7XG5cbiAgICAvLyBBcHBseSBjb25zaXN0ZW50IHRhZ2dpbmdcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ1Byb2plY3QnLCBhcHBOYW1lKTtcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ01hbmFnZWRCeScsICdjZGstYWktY29uc3RydWN0cycpO1xuICAgIGNkay5UYWdzLm9mKHRoaXMpLmFkZCgnT3duZXInLCAnam9obmF0aGFuLWhvcm5lcicpO1xuICAgIGNkay5UYWdzLm9mKHRoaXMpLmFkZCgnQ29tcG9uZW50JywgJ0FQSUdhdGV3YXknKTtcblxuICAgIC8vIE91dHB1dCBpbXBvcnRhbnQgdmFsdWVzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FwaVVybCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmFwaS51cmwsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FQSSBHYXRld2F5IGVuZHBvaW50IFVSTCcsXG4gICAgICBleHBvcnROYW1lOiBgJHtjZGsuU3RhY2sub2YodGhpcykuc3RhY2tOYW1lfS0ke2lkfS1BcGlVcmxgLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FwaUlkJywge1xuICAgICAgdmFsdWU6IHRoaXMuYXBpLnJlc3RBcGlJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIEdhdGV3YXkgUkVTVCBBUEkgSUQnLFxuICAgICAgZXhwb3J0TmFtZTogYCR7Y2RrLlN0YWNrLm9mKHRoaXMpLnN0YWNrTmFtZX0tJHtpZH0tQXBpSWRgLFxuICAgIH0pO1xuXG4gICAgaWYgKHRoaXMuYXBpS2V5KSB7XG4gICAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQXBpS2V5SWQnLCB7XG4gICAgICAgIHZhbHVlOiB0aGlzLmFwaUtleS5rZXlJZCxcbiAgICAgICAgZGVzY3JpcHRpb246ICdBUEkgS2V5IElEIGZvciB0aHJvdHRsZWQgcmVxdWVzdHMnLFxuICAgICAgICBleHBvcnROYW1lOiBgJHtjZGsuU3RhY2sub2YodGhpcykuc3RhY2tOYW1lfS0ke2lkfS1BcGlLZXlJZGAsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5hY2Nlc3NMb2dHcm91cCkge1xuICAgICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FjY2Vzc0xvZ0dyb3VwTmFtZScsIHtcbiAgICAgICAgdmFsdWU6IHRoaXMuYWNjZXNzTG9nR3JvdXAubG9nR3JvdXBOYW1lLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0Nsb3VkV2F0Y2ggbG9nIGdyb3VwIGZvciBBUEkgYWNjZXNzIGxvZ3MnLFxuICAgICAgICBleHBvcnROYW1lOiBgJHtjZGsuU3RhY2sub2YodGhpcykuc3RhY2tOYW1lfS0ke2lkfS1BY2Nlc3NMb2dHcm91cE5hbWVgLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1JvdXRlc1N1bW1hcnknLCB7XG4gICAgICB2YWx1ZTogSlNPTi5zdHJpbmdpZnkoXG4gICAgICAgIHJvdXRlcy5tYXAocm91dGUgPT4gKHtcbiAgICAgICAgICBtZXRob2Q6IHJvdXRlLm1ldGhvZCxcbiAgICAgICAgICBwYXRoOiByb3V0ZS5wYXRoLFxuICAgICAgICAgIGZ1bmN0aW9uOiByb3V0ZS5oYW5kbGVyLmZ1bmN0aW9uTmFtZSxcbiAgICAgICAgfSkpXG4gICAgICApLFxuICAgICAgZGVzY3JpcHRpb246ICdTdW1tYXJ5IG9mIEFQSSByb3V0ZXMgYW5kIHRoZWlyIGhhbmRsZXJzJyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke2Nkay5TdGFjay5vZih0aGlzKS5zdGFja05hbWV9LSR7aWR9LVJvdXRlc1N1bW1hcnlgLFxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBBUEkgR2F0ZXdheSByZXNvdXJjZXMgYW5kIG1ldGhvZHMgZm9yIGFsbCByb3V0ZXNcbiAgICovXG4gIHByaXZhdGUgY3JlYXRlUm91dGVzQW5kTWV0aG9kcyhyb3V0ZXM6IEFwaVJvdXRlW10sIHByb3BzOiBBUElHYXRld2F5TGFtYmRhUHJvcHMpOiB2b2lkIHtcbiAgICAvLyBHcm91cCByb3V0ZXMgYnkgcGF0aCB0byBhdm9pZCBkdXBsaWNhdGUgcmVzb3VyY2UgY3JlYXRpb25cbiAgICBjb25zdCBwYXRoUm91dGVzID0gbmV3IE1hcDxzdHJpbmcsIEFwaVJvdXRlW10+KCk7XG4gICAgcm91dGVzLmZvckVhY2gocm91dGUgPT4ge1xuICAgICAgaWYgKCFwYXRoUm91dGVzLmhhcyhyb3V0ZS5wYXRoKSkge1xuICAgICAgICBwYXRoUm91dGVzLnNldChyb3V0ZS5wYXRoLCBbXSk7XG4gICAgICB9XG4gICAgICBwYXRoUm91dGVzLmdldChyb3V0ZS5wYXRoKSEucHVzaChyb3V0ZSk7XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgcmVzb3VyY2VzIGFuZCBtZXRob2RzXG4gICAgcGF0aFJvdXRlcy5mb3JFYWNoKChyb3V0ZXNGb3JQYXRoLCBwYXRoKSA9PiB7XG4gICAgICBjb25zdCByZXNvdXJjZSA9IHRoaXMuY3JlYXRlUmVzb3VyY2VGcm9tUGF0aChwYXRoKTtcbiAgICAgIHRoaXMucmVzb3VyY2VzLnNldChwYXRoLCByZXNvdXJjZSk7XG5cbiAgICAgIHJvdXRlc0ZvclBhdGguZm9yRWFjaChyb3V0ZSA9PiB7XG4gICAgICAgIGNvbnN0IGludGVncmF0aW9uID0gbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocm91dGUuaGFuZGxlciwge1xuICAgICAgICAgIHByb3h5OiB0cnVlLFxuICAgICAgICAgIGFsbG93VGVzdEludm9rZTogZmFsc2UsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IG1ldGhvZE9wdGlvbnM6IGFwaWdhdGV3YXkuTWV0aG9kT3B0aW9ucyA9IHtcbiAgICAgICAgICBvcGVyYXRpb25OYW1lOiBgJHtyb3V0ZS5tZXRob2R9JHtwYXRoLnJlcGxhY2UoL1t7fV0vZywgJycpLnJlcGxhY2UoL1xcLy9nLCAnXycpfWAsXG4gICAgICAgIH07XG5cbiAgICAgICAgLy8gQWRkIGF1dGhvcml6YXRpb24gaWYgcmVxdWlyZWRcbiAgICAgICAgY29uc3QgcmVxdWlyZXNBdXRoID0gcm91dGUucmVxdWlyZXNBdXRoID8/IChwcm9wcy5jb2duaXRvQXV0aG9yaXplciA/IHRydWUgOiBmYWxzZSk7XG4gICAgICAgIGlmIChyZXF1aXJlc0F1dGggJiYgdGhpcy5hdXRob3JpemVyKSB7XG4gICAgICAgICAgKG1ldGhvZE9wdGlvbnMgYXMgYW55KS5hdXRob3JpemVyID0gdGhpcy5hdXRob3JpemVyO1xuICAgICAgICAgIChtZXRob2RPcHRpb25zIGFzIGFueSkuYXV0aG9yaXphdGlvblR5cGUgPSBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE87XG4gICAgICAgIH1cblxuICAgICAgICAvLyBBZGQgcmVxdWVzdCB2YWxpZGF0aW9uXG4gICAgICAgIGlmIChyb3V0ZS5yZXF1ZXN0VmFsaWRhdGlvbikge1xuICAgICAgICAgIC8vIFJlcXVlc3QgdmFsaWRhdGlvbiB3b3VsZCBuZWVkIGEgcmVxdWVzdCB2YWxpZGF0b3IgbW9kZWxcbiAgICAgICAgICAvLyBUaGlzIGlzIGEgc2ltcGxpZmllZCBpbXBsZW1lbnRhdGlvblxuICAgICAgICB9XG5cbiAgICAgICAgcmVzb3VyY2UuYWRkTWV0aG9kKHJvdXRlLm1ldGhvZCwgaW50ZWdyYXRpb24sIG1ldGhvZE9wdGlvbnMpO1xuXG4gICAgICAgIC8vIEdyYW50IGludm9rZSBwZXJtaXNzaW9uIHRvIExhbWJkYVxuICAgICAgICByb3V0ZS5oYW5kbGVyLmFkZFBlcm1pc3Npb24oYEFwaUdhdGV3YXlJbnZva2UtJHtyb3V0ZS5tZXRob2R9LSR7cGF0aC5yZXBsYWNlKC9cXC8vZywgJy0nKX1gLCB7XG4gICAgICAgICAgcHJpbmNpcGFsOiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2FwaWdhdGV3YXkuYW1hem9uYXdzLmNvbScpLFxuICAgICAgICAgIGFjdGlvbjogJ2xhbWJkYTpJbnZva2VGdW5jdGlvbicsXG4gICAgICAgICAgc291cmNlQXJuOiB0aGlzLmFwaS5hcm5Gb3JFeGVjdXRlQXBpKHJvdXRlLm1ldGhvZCwgcGF0aCksXG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIEFQSSBHYXRld2F5IHJlc291cmNlIGZyb20gcGF0aFxuICAgKi9cbiAgcHJpdmF0ZSBjcmVhdGVSZXNvdXJjZUZyb21QYXRoKHBhdGg6IHN0cmluZyk6IGFwaWdhdGV3YXkuUmVzb3VyY2Uge1xuICAgIGNvbnN0IHNlZ21lbnRzID0gcGF0aC5zcGxpdCgnLycpLmZpbHRlcihzZWdtZW50ID0+IHNlZ21lbnQubGVuZ3RoID4gMCk7XG4gICAgbGV0IGN1cnJlbnRSZXNvdXJjZTogYXBpZ2F0ZXdheS5JUmVzb3VyY2UgPSB0aGlzLmFwaS5yb290O1xuXG4gICAgZm9yIChjb25zdCBzZWdtZW50IG9mIHNlZ21lbnRzKSB7XG4gICAgICBjb25zdCBleGlzdGluZ1Jlc291cmNlID0gY3VycmVudFJlc291cmNlLmdldFJlc291cmNlKHNlZ21lbnQpO1xuICAgICAgaWYgKGV4aXN0aW5nUmVzb3VyY2UpIHtcbiAgICAgICAgY3VycmVudFJlc291cmNlID0gZXhpc3RpbmdSZXNvdXJjZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGN1cnJlbnRSZXNvdXJjZSA9IChjdXJyZW50UmVzb3VyY2UgYXMgYXBpZ2F0ZXdheS5SZXNvdXJjZSkuYWRkUmVzb3VyY2Uoc2VnbWVudCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGN1cnJlbnRSZXNvdXJjZSBhcyBhcGlnYXRld2F5LlJlc291cmNlO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBDbG91ZFdhdGNoIG1vbml0b3JpbmcgZm9yIHRoZSBBUElcbiAgICovXG4gIHByaXZhdGUgY3JlYXRlTW9uaXRvcmluZyhhcHBOYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAvLyBDcmVhdGUgYWxhcm0gZm9yIDRYWCBlcnJvcnNcbiAgICBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnNFhYRXJyb3JBbGFybScsIHtcbiAgICAgIGFsYXJtTmFtZTogYCR7YXBwTmFtZX0tYXBpLTR4eC1lcnJvcnNgLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogYE1vbml0b3IgNFhYIGVycm9ycyBpbiAke2FwcE5hbWV9IEFQSSBHYXRld2F5YCxcbiAgICAgIG1ldHJpYzogdGhpcy5hcGkubWV0cmljQ2xpZW50RXJyb3Ioe1xuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgICBzdGF0aXN0aWM6ICdTdW0nLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDEwLFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDIsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBhbGFybSBmb3IgNVhYIGVycm9yc1xuICAgIG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICc1WFhFcnJvckFsYXJtJywge1xuICAgICAgYWxhcm1OYW1lOiBgJHthcHBOYW1lfS1hcGktNXh4LWVycm9yc2AsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiBgTW9uaXRvciA1WFggZXJyb3JzIGluICR7YXBwTmFtZX0gQVBJIEdhdGV3YXlgLFxuICAgICAgbWV0cmljOiB0aGlzLmFwaS5tZXRyaWNTZXJ2ZXJFcnJvcih7XG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICAgIHN0YXRpc3RpYzogJ1N1bScsXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogNSxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAxLFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgYWxhcm0gZm9yIGhpZ2ggbGF0ZW5jeVxuICAgIG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdMYXRlbmN5QWxhcm0nLCB7XG4gICAgICBhbGFybU5hbWU6IGAke2FwcE5hbWV9LWFwaS1oaWdoLWxhdGVuY3lgLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogYE1vbml0b3IgaGlnaCBsYXRlbmN5IGluICR7YXBwTmFtZX0gQVBJIEdhdGV3YXlgLFxuICAgICAgbWV0cmljOiB0aGlzLmFwaS5tZXRyaWNMYXRlbmN5KHtcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgICAgc3RhdGlzdGljOiAnQXZlcmFnZScsXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogNTAwMCwgLy8gNSBzZWNvbmRzXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMyxcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIEFkZCBhIG5ldyByb3V0ZSB0byB0aGUgQVBJXG4gICAqIEBwYXJhbSByb3V0ZSBUaGUgcm91dGUgY29uZmlndXJhdGlvbiB0byBhZGRcbiAgICovXG4gIHB1YmxpYyBhZGRSb3V0ZShyb3V0ZTogQXBpUm91dGUpOiB2b2lkIHtcbiAgICBjb25zdCByZXNvdXJjZSA9IHRoaXMuY3JlYXRlUmVzb3VyY2VGcm9tUGF0aChyb3V0ZS5wYXRoKTtcbiAgICB0aGlzLnJlc291cmNlcy5zZXQocm91dGUucGF0aCwgcmVzb3VyY2UpO1xuXG4gICAgY29uc3QgaW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihyb3V0ZS5oYW5kbGVyLCB7XG4gICAgICBwcm94eTogdHJ1ZSxcbiAgICAgIGFsbG93VGVzdEludm9rZTogZmFsc2UsXG4gICAgfSk7XG5cbiAgICBjb25zdCBtZXRob2RPcHRpb25zOiBhcGlnYXRld2F5Lk1ldGhvZE9wdGlvbnMgPSB7XG4gICAgICBvcGVyYXRpb25OYW1lOiBgJHtyb3V0ZS5tZXRob2R9JHtyb3V0ZS5wYXRoLnJlcGxhY2UoL1t7fV0vZywgJycpLnJlcGxhY2UoL1xcLy9nLCAnXycpfWAsXG4gICAgfTtcblxuICAgIC8vIEFkZCBhdXRob3JpemF0aW9uIGlmIHJlcXVpcmVkXG4gICAgY29uc3QgcmVxdWlyZXNBdXRoID0gcm91dGUucmVxdWlyZXNBdXRoID8/ICh0aGlzLmF1dGhvcml6ZXIgPyB0cnVlIDogZmFsc2UpO1xuICAgIGlmIChyZXF1aXJlc0F1dGggJiYgdGhpcy5hdXRob3JpemVyKSB7XG4gICAgICAobWV0aG9kT3B0aW9ucyBhcyBhbnkpLmF1dGhvcml6ZXIgPSB0aGlzLmF1dGhvcml6ZXI7XG4gICAgICAobWV0aG9kT3B0aW9ucyBhcyBhbnkpLmF1dGhvcml6YXRpb25UeXBlID0gYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPO1xuICAgIH1cblxuICAgIHJlc291cmNlLmFkZE1ldGhvZChyb3V0ZS5tZXRob2QsIGludGVncmF0aW9uLCBtZXRob2RPcHRpb25zKTtcblxuICAgIC8vIEdyYW50IGludm9rZSBwZXJtaXNzaW9uIHRvIExhbWJkYVxuICAgIHJvdXRlLmhhbmRsZXIuYWRkUGVybWlzc2lvbihgQXBpR2F0ZXdheUludm9rZS0ke3JvdXRlLm1ldGhvZH0tJHtyb3V0ZS5wYXRoLnJlcGxhY2UoL1xcLy9nLCAnLScpfWAsIHtcbiAgICAgIHByaW5jaXBhbDogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdhcGlnYXRld2F5LmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIGFjdGlvbjogJ2xhbWJkYTpJbnZva2VGdW5jdGlvbicsXG4gICAgICBzb3VyY2VBcm46IHRoaXMuYXBpLmFybkZvckV4ZWN1dGVBcGkocm91dGUubWV0aG9kLCByb3V0ZS5wYXRoKSxcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgYSByZXNvdXJjZSBieSBwYXRoXG4gICAqIEBwYXJhbSBwYXRoIFRoZSByZXNvdXJjZSBwYXRoXG4gICAqIEByZXR1cm5zIFRoZSBBUEkgR2F0ZXdheSByZXNvdXJjZVxuICAgKi9cbiAgcHVibGljIGdldFJlc291cmNlKHBhdGg6IHN0cmluZyk6IGFwaWdhdGV3YXkuUmVzb3VyY2UgfCB1bmRlZmluZWQge1xuICAgIHJldHVybiB0aGlzLnJlc291cmNlcy5nZXQocGF0aCk7XG4gIH1cbn0iXX0=