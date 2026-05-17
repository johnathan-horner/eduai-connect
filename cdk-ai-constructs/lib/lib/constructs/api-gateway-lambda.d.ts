import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
/**
 * Route configuration for API Gateway
 */
export interface ApiRoute {
    /**
     * HTTP method
     */
    readonly method: string;
    /**
     * Resource path (can include path parameters like '/users/{id}')
     */
    readonly path: string;
    /**
     * Lambda function to handle this route
     */
    readonly handler: lambda.Function;
    /**
     * Whether this route requires authentication
     * @default true if cognitoAuthorizer is provided in construct props
     */
    readonly requiresAuth?: boolean;
    /**
     * Request validation settings
     * @default undefined
     */
    readonly requestValidation?: {
        validateBody?: boolean;
        validateParameters?: boolean;
    };
}
/**
 * Throttling configuration
 */
export interface ThrottleConfig {
    /**
     * Requests per second limit
     */
    readonly rateLimit: number;
    /**
     * Burst limit for temporary spikes
     */
    readonly burstLimit: number;
}
/**
 * Properties for APIGatewayLambda construct
 */
export interface APIGatewayLambdaProps {
    /**
     * Name for the API Gateway
     */
    readonly apiName: string;
    /**
     * Array of routes to create
     */
    readonly routes: ApiRoute[];
    /**
     * Cognito User Pool for authorization
     * If provided, creates a Cognito authorizer
     * @default undefined
     */
    readonly cognitoAuthorizer?: cognito.UserPool;
    /**
     * CORS allowed origins
     * @default ['*']
     */
    readonly corsOrigins?: string[];
    /**
     * Throttling configuration
     * If provided, creates usage plan with API key
     * @default undefined
     */
    readonly throttle?: ThrottleConfig;
    /**
     * Application name for consistent tagging and naming
     */
    readonly appName: string;
    /**
     * Enable CloudWatch access logging
     * @default true
     */
    readonly enableAccessLogs?: boolean;
    /**
     * CloudWatch log retention period in days
     * @default 30
     */
    readonly logRetentionDays?: number;
    /**
     * Deploy to a specific stage name
     * @default 'prod'
     */
    readonly stageName?: string;
    /**
     * Custom domain name for the API
     * @default undefined
     */
    readonly domainName?: string;
}
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
export declare class APIGatewayLambda extends Construct {
    /**
     * The API Gateway REST API
     */
    readonly api: apigateway.RestApi;
    /**
     * Cognito authorizer (if created)
     */
    readonly authorizer?: apigateway.CognitoUserPoolsAuthorizer;
    /**
     * Usage plan for throttling (if created)
     */
    readonly usagePlan?: apigateway.UsagePlan;
    /**
     * API key for usage plan (if created)
     */
    readonly apiKey?: apigateway.ApiKey;
    /**
     * CloudWatch log group for API access logs
     */
    readonly accessLogGroup?: logs.LogGroup;
    /**
     * Map of created resources for programmatic access
     */
    readonly resources: Map<string, apigateway.Resource>;
    constructor(scope: Construct, id: string, props: APIGatewayLambdaProps);
    /**
     * Create API Gateway resources and methods for all routes
     */
    private createRoutesAndMethods;
    /**
     * Create API Gateway resource from path
     */
    private createResourceFromPath;
    /**
     * Create CloudWatch monitoring for the API
     */
    private createMonitoring;
    /**
     * Add a new route to the API
     * @param route The route configuration to add
     */
    addRoute(route: ApiRoute): void;
    /**
     * Get a resource by path
     * @param path The resource path
     * @returns The API Gateway resource
     */
    getResource(path: string): apigateway.Resource | undefined;
}
