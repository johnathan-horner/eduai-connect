# Contributing to EduAI Connect

## Getting Started

1. Clone the repository
2. Install dependencies: `pip install -r requirements.txt`
3. Set up AWS credentials with Bedrock access
4. Run locally: `streamlit run app.py`

## Educational AI Development

### Architecture Principles
- **FERPA First**: All development must maintain student privacy and FERPA compliance
- **Multi-Agent Design**: Use specialized agents for distinct educational functions
- **RAG-Enhanced**: Leverage retrieval-augmented generation for educational content
- **Human-in-the-Loop**: Always require educator oversight for AI recommendations

### Educational Domain Expertise
- **Learning Science**: Ground recommendations in evidence-based educational research
- **Differentiated Instruction**: Support diverse learning needs and styles
- **Trauma-Informed**: Consider student wellbeing and supportive environments
- **Cultural Responsiveness**: Respect diverse backgrounds and perspectives

## Architecture Decisions

See [docs/decisions/](docs/decisions/) for architecture decision records explaining why each service and pattern was chosen.

## AI System Documentation

See [AI_SYSTEM_CARD.md](AI_SYSTEM_CARD.md) for detailed AI system documentation including RAG pipeline, multi-agent workflows, LLM usage, and governance framework.

## Development Workflow

### Testing
- Ensure all MCP tools function correctly with educational data
- Test FERPA compliance with synthetic student data
- Validate intervention recommendations with educational experts
- Run automated tests: Push to main triggers GitHub Actions CI pipeline

### Privacy and Security
- **Never use real student data** in development or testing
- Use synthetic educational data that mimics real patterns
- All AI model interactions must be logged for audit purposes
- Test privacy controls and PII filtering functionality

### Code Standards
- Follow educational AI best practices for bias mitigation
- Document all AI decision points and thresholds
- Include educational research citations for recommendations
- Maintain clear separation between AI suggestions and human decisions

## Educational Impact

### Success Metrics
- **Early Intervention**: Time improvement in identifying at-risk students
- **Intervention Effectiveness**: Success rate of AI-recommended support strategies
- **Teacher Efficiency**: Reduction in manual progress monitoring tasks
- **Student Outcomes**: Academic improvement following AI-assisted interventions

### Responsible AI Practices
- Regular bias testing across student demographics
- Transparent explanation of AI recommendations to educators
- Clear limitations and uncertainty communication
- Continuous monitoring of educational impact and unintended consequences

## API Documentation

The project includes educational data processing APIs. Run the server and visit `/docs` for interactive Swagger documentation.

## Compliance

### FERPA Requirements
- Student data must be processed only for educational purposes
- Implement proper access controls and audit logging
- Ensure data minimization and retention compliance
- Provide clear privacy notices and consent mechanisms

### Ethical Guidelines
- Prioritize student wellbeing and educational equity
- Avoid stigmatization or labeling of students
- Support educator professional judgment and autonomy
- Maintain transparency with families and school communities

## Support

For questions about educational AI development or FERPA compliance, reach out to the development team or review the comprehensive documentation in this repository.