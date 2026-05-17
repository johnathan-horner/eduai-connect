# CDK AI Constructs

[![npm version](https://badge.fury.io/js/@johnathan-horner%2Fcdk-ai-constructs.svg)](https://badge.fury.io/js/@johnathan-horner%2Fcdk-ai-constructs)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Production-ready AWS CDK constructs for AI systems with Amazon Bedrock, SageMaker, multi-tenant authentication, auditable storage, and Stripe billing. These constructs abstract the production patterns used across six AI systems: ShootItPicks, FinTech AI, EduAI Connect, Medical Image Triage, Transaction Anomaly Detection, and Legal Document Classification.

Built by [Johnathan Horner](https://portfolio.johnathancloudspace.com) to accelerate AI application development on AWS.

## Features

🚀 **Production-Ready**: Battle-tested patterns from real AI systems
🔐 **Security-First**: Least-privilege IAM, encryption at rest, audit trails
🏢 **Multi-Tenant**: Built-in tenant isolation and subscription management
💳 **Stripe Integration**: Complete billing infrastructure with webhook handling
📊 **Observability**: Comprehensive CloudWatch monitoring and alerting
🎯 **Compliance Ready**: HIPAA, FERPA, FedRAMP, SR11-7 compliance modes

## Installation

```bash
npm install @johnathan-horner/cdk-ai-constructs
```

## Quick Start

Here's a minimal AI application with Bedrock, API Gateway, and secure storage:

```typescript
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import {
  BedrockAgentConstruct,
  APIGatewayLambda,
  AuditableStorage,
} from '@johnathan-horner/cdk-ai-constructs';

export class MyAIAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1. AI Processing Lambda
    const aiFunction = new lambda.Function(this, 'AIFunction', {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda'),
    });

    // 2. Bedrock Integration
    new BedrockAgentConstruct(this, 'BedrockAgent', {
      appName: 'MyAIApp',
      handler: aiFunction,
      modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
    });

    // 3. Secure Storage
    const storage = new AuditableStorage(this, 'Storage', {
      appName: 'MyAIApp',
      bucketName: 'documents',
      complianceMode: 'HIPAA', // 7-year retention
    });

    // 4. REST API
    new APIGatewayLambda(this, 'API', {
      appName: 'MyAIApp',
      apiName: 'my-ai-api',
      routes: [
        { method: 'POST', path: '/chat', handler: aiFunction },
      ],
    });

    storage.grantReadWrite(aiFunction);
  }
}
```

## Construct Reference

| Construct | Purpose | Key Features |
|-----------|---------|--------------|
| **BedrockAgentConstruct** | Amazon Bedrock integration | IAM permissions, CloudWatch monitoring, environment setup |
| **ServerlessMLEndpoint** | SageMaker serverless inference | Auto-scaling, cost optimization, endpoint monitoring |
| **MultiTenantAuth** | Cognito-based authentication | Tenant isolation, custom attributes, DynamoDB integration |
| **EventDrivenPipeline** | EventBridge + Lambda processing | Dead letter queues, retry logic, monitoring alarms |
| **AuditableStorage** | Secure S3 with compliance | KMS encryption, CloudTrail, lifecycle management |
| **StripeBilling** | Complete billing infrastructure | Checkout sessions, webhook handling, subscription management |
| **APIGatewayLambda** | REST API with authentication | CORS, throttling, Cognito authorization |
| **StreamlitDashboard** | Containerized data dashboards | ECS Fargate, auto-scaling, custom domains |
| **ModelCardConstruct** | ML model documentation & governance | SageMaker Model Card, S3 artifacts, DynamoDB registry, compliance tracking |

## Examples

### Multi-Tenant AI Application

```typescript
import { MultiTenantAuth, StripeBilling, BedrockAgentConstruct } from '@johnathan-horner/cdk-ai-constructs';

// Authentication with tenant isolation
const auth = new MultiTenantAuth(this, 'Auth', {
  appName: 'MyApp',
  callbackUrls: ['https://myapp.com/dashboard'],
  customAttributes: ['company_size', 'industry'],
  mfaRequired: true,
});

// Stripe billing with multiple tiers
const billing = new StripeBilling(this, 'Billing', {
  appName: 'MyApp',
  tiers: [
    { name: 'Starter', priceId: 'price_1234', amount: 999 },
    { name: 'Pro', priceId: 'price_5678', amount: 2999 },
  ],
  webhookSecret: '/myapp/stripe/webhook-secret',
  successUrl: 'https://myapp.com/success',
  cancelUrl: 'https://myapp.com/cancel',
  onPaymentSuccess: paymentHandler,
  tenantsTable: auth.tenantsTable,
});
```

### Event-Driven AI Processing

```typescript
import { EventDrivenPipeline, BedrockAgentConstruct } from '@johnathan-horner/cdk-ai-constructs';

// Process documents when uploaded to S3
const pipeline = new EventDrivenPipeline(this, 'DocumentPipeline', {
  appName: 'MyApp',
  ruleName: 'ProcessDocuments',
  eventPattern: {
    source: ['myapp.documents'],
    'detail-type': ['Document Uploaded'],
  },
  targetFunction: documentProcessor,
  alarmEmail: 'admin@myapp.com',
});
```

### SageMaker Serverless Inference

```typescript
import { ServerlessMLEndpoint } from '@johnathan-horner/cdk-ai-constructs';

const endpoint = new ServerlessMLEndpoint(this, 'MLEndpoint', {
  appName: 'MyApp',
  modelDataUrl: 's3://my-bucket/models/sentiment/model.tar.gz',
  containerImage: '763104351884.dkr.ecr.us-east-1.amazonaws.com/pytorch-inference:latest',
  invokerFunction: mlLambda,
  maxConcurrency: 10,
  memorySize: 4096,
});
```

### ML Model Documentation

```typescript
import { ModelCardConstruct } from '@johnathan-horner/cdk-ai-constructs';

const modelCard = new ModelCardConstruct(this, 'SentimentModelCard', {
  appName: 'MyApp',
  modelName: 'sentiment-classifier',
  modelVersion: '2.1.0',
  intendedUse: 'Classify customer feedback sentiment for business intelligence',
  trainingDataDescription: 'Customer reviews dataset with 100K labeled examples',
  evaluationMetrics: [
    { name: 'accuracy', value: 0.942, unit: 'percentage' },
    { name: 'f1_score', value: 0.923 },
    { name: 'precision', value: 0.931 },
  ],
  limitations: [
    'Limited to English language text',
    'May struggle with sarcasm and irony',
    'Trained primarily on e-commerce reviews'
  ],
  outOfScopeUse: [
    'Medical diagnosis or health decisions',
    'Legal document analysis without human oversight'
  ],
  complianceMode: 'FERPA',
  responsibleTeam: 'ML Engineering Team',
  contactEmail: 'ml-team@company.com'
});
```

## Compliance Modes

The `AuditableStorage` construct supports various compliance frameworks:

| Mode | Retention Period | Use Case |
|------|------------------|----------|
| **HIPAA** | 7 years (2555 days) | Healthcare data |
| **FERPA** | 5 years (1825 days) | Educational records |
| **FEDRAMP** | 7 years (2555 days) | Federal systems |
| **SR11-7** | 7 years (2555 days) | Banking regulations |

```typescript
// HIPAA-compliant storage
new AuditableStorage(this, 'PatientData', {
  appName: 'HealthApp',
  bucketName: 'patient-records',
  complianceMode: 'HIPAA', // Automatically sets 7-year retention
});
```

## Architecture Patterns

This library implements proven patterns from production AI systems:

### 1. Multi-Tenant SaaS Pattern
- Cognito User Pools with custom tenant attributes
- DynamoDB tenant metadata with Stripe customer mapping
- S3 tenant isolation via path-based access control

### 2. Event-Driven AI Processing
- S3 upload triggers → EventBridge → Lambda → Bedrock/SageMaker
- Dead letter queues for failed processing
- CloudWatch alarms for monitoring

### 3. Secure Data Pipeline
- KMS encryption at rest
- CloudTrail audit logging
- Lifecycle management for cost optimization

### 4. Production Monitoring
- CloudWatch alarms for all critical metrics
- SNS notifications for operational issues
- Structured logging for debugging

### 5. ML Model Governance
- SageMaker Model Cards for comprehensive documentation
- S3 artifacts storage with versioning
- DynamoDB model registry for searchable metadata
- Compliance tracking for regulated industries

## Development

```bash
# Clone the repository
git clone https://github.com/johnathan-horner/cdk-ai-constructs.git
cd cdk-ai-constructs

# Install dependencies
npm install

# Build the library
npm run build

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Lint code
npm run lint
```

## Testing

All constructs include comprehensive Jest tests covering:

- ✅ Resource creation and configuration
- ✅ IAM permissions (no wildcard actions)
- ✅ CloudWatch monitoring setup
- ✅ Compliance requirements
- ✅ Tag application
- ✅ Output generation

```bash
npm test
```

## Examples

See the `examples/` directory for complete stack implementations:

- **basic-ai-app-stack.ts**: Minimal AI application with Bedrock and API Gateway
- **connectiq-stack.ts**: Full-featured multi-tenant AI platform with billing
- **model-cards/template.md**: Comprehensive model card documentation template

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes with tests
4. Run tests: `npm test`
5. Submit a pull request

## Support

- 📖 **Documentation**: [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- 🐛 **Issues**: [GitHub Issues](https://github.com/johnathan-horner/cdk-ai-constructs/issues)
- 💼 **Portfolio**: [johnathan.cloudspace.com](https://portfolio.johnathancloudspace.com)

## Real-World Usage

These constructs power production AI systems including:

- **ShootItPicks**: AI-powered sports betting analysis platform
- **FinTech AI**: Real-time transaction anomaly detection
- **EduAI Connect**: Educational content processing and insights
- **Medical Image Triage**: HIPAA-compliant medical image analysis
- **Legal Document Classification**: Automated legal document processing

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Built by [Johnathan Horner](https://portfolio.johnathancloudspace.com)** - Accelerating AI innovation on AWS.

[![Portfolio](https://img.shields.io/badge/Portfolio-johnathancloudspace.com-blue.svg)](https://portfolio.johnathancloudspace.com)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Connect-blue.svg)](https://linkedin.com/in/johnathan-horner)