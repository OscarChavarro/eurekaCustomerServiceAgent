# AGENTS Operational Contract

This contract defines how an LLM should maintain this repository.
Use it as the default engineering policy unless a task explicitly requires an exception.

## Project Overview

- This repository is a TypeScript monorepo with one frontend project, multiple backend projects, and shared internal packages.
- Backend projects are service-oriented and communicate through HTTP, WebSocket, queues, and shared persistence/storage systems.
- Frontend architecture is feature-oriented, with thin UI components and service-driven orchestration.
- Backend architecture targets hexagonal design (ports and adapters).
- Runtime configuration is file-based and split into non-secret settings and secret settings.
- Deployment supports local development and Kubernetes-based environments.

## Project Structure

- `ingestionBackend`: process Whatsapp conversations imported via `iMazing` csv files and feeds embeddings into `Qdrant`.
- `backofficeBackend`: primary API backend for frontend consumption.
- `backofficeFrontend`: primary Angular frontend application. Help customer service people to understand the whole process and visualize statistics about the customers.
- `notificationMessageSender`: asynchronous notification backend. Talks with whatsapp.
- `k8s`: shared infrastructure manifests for external systems and ingress.
- `doc`: project-level architecture and operations documentation.
- `scripts`: monorepo-level utility/build scripts.

## Architecture Rules

### Frontend Projects

- Organize code by feature, not by technical layer.
- Keep cross-cutting concerns centralized in a dedicated core area.
- Keep components focused on rendering and interaction wiring.
- Put business flow orchestration in dedicated use-case/coordinator services.
- Keep feature state explicit and reactive, with a single source of truth per concern.
- Route backend communication through a centralized transport policy layer.
- Keep mapping/parsing logic separate from UI logic.
- Keep internationalization typed and fail fast for missing keys.

### Backend Projects

- Treat hexagonal architecture as the default target architecture.
- Keep domain logic framework-agnostic and independent from transport and infrastructure details.
- Keep application logic in use-case/services that orchestrate domain objects through ports.
- Define ports as explicit contracts and inject implementations through dependency inversion.
- Keep inbound adapters focused on request/response translation and authorization, not business workflows.
- Keep outbound adapters focused on integration details and idempotent side effects.
- Keep configuration, process control, and technical utilities in infrastructure-only code.
- Enforce one-way dependency direction from adapters toward ports/application/domain, never the opposite.
- For legacy or transitional backends, move incrementally toward explicit ports and smaller use cases when touching existing code.

### Backend Quality Checklist (Mandatory)

- Every backend service must run a startup infrastructure availability preflight before accepting traffic.
- The preflight must validate each declared dependency using a real connectivity check:
- For databases (for example MongoDB), attempt connection with configured credentials.
- For message brokers/queues (for example RabbitMQ), attempt authenticated broker connectivity.
- For required upstream HTTP microservices, call their `/health` endpoint and require a successful response.
- If any preflight check fails, startup must be blocked (service must not start listening for normal traffic).
- On preflight failure, log a clear error message in English with the failed dependency name and failure reason.
- After logging the failure, keep the process alive for a configurable delay sourced from JSON configuration, then terminate with non-zero exit code.
- The default failure-delay value must be 15 minutes when configuration is missing or invalid.
- The delay exists to give DevOps enough time to inspect failing Kubernetes pods before restart loops.
- Every backend service must expose an HTTP `GET /health` endpoint.

General folder structure is
```
adapters
adapters/inbound
adapters/outbound
application
application/dto
application/context
application/usecases
application/services
infrastructure
infrastructure/config
infrastructure/config/settings
infrastructure/config/validation
ports
ports/inbound
ports/outbound
domain
domain/<feature>
```

## Code Conventions

- Use TypeScript strict mode and preserve strict typing for new code.
- Prefer small, single-purpose classes and methods with explicit names.
- Use consistent suffix-based naming for technical roles such as controller, service, use case, module, port, token, model, and type.
- Prefer constructor injection or framework-native injection with readonly dependencies.
- Keep boundary payloads as explicit types and normalize/validate external input early.
- Keep mapping and normalization logic explicit and testable.
- Prefer deterministic behavior and explicit defaults over implicit fallthrough.
- Keep logs contextual, actionable, and free of secrets.
- Avoid coupling UI/domain behavior directly to transport payload shapes.

## Testing Guidelines

Initially disable. Not being generated until a full working solution MVP is done. Will be
generated later, but, when generaing main production code, will need to consider how tests
will be done, so this is easier in the future.

- Mirror production code organization in tests.
- Prioritize unit tests for use cases, services, mappers, value objects, and guards/policies.
- Mock ports and external adapters in unit tests.
- Cover success paths, validation failures, retries, fallback behavior, and idempotency scenarios.
- Keep test names behavior-oriented and explicit about expected outcomes.
- Maintain existing coverage thresholds where configured and do not lower them to pass changes.
- When modifying untested backend services, add focused tests around changed behavior before broad refactors.
- For frontend changes, add or update component/service specs for interaction logic, state transitions, and API fallback behavior.

## External Systems

- Message broker for asynchronous communication.
- Document database for persistent records.
- Shared file storage for binary assets.
- Static asset serving layer.
- OAuth2 identity provider.
- Geospatial/maps provider.
- Real-time messaging gateway.
- Metrics and dashboard stack.
- Container and orchestration platform with ingress and persistent volumes.
- Optional forward proxy and private overlay networking for egress control.

## Security Rules

- Never commit `secrets.json` files. Commit only `secrets-example.json` templates.
- Keep all credentials in secret files or Kubernetes Secrets, never in source code.
- Avoid permissive CORS with credentials in production deployments.
- Rotate default infrastructure credentials immediately for RabbitMQ, Grafana, and any bootstrap admin users.
- Keep Prometheus/Grafana protected with authentication in non-local environments.
- Preserve non-root container execution and mounted-secret read-only patterns in Kubernetes manifests.

## Preferred Patterns

- Explicit ports plus adapter implementations with dependency injection tokens.
- Use-case services exposing a single `execute`-style entry point for orchestration.
- Configuration objects with normalization, fallback defaults, and validation.
- Retry policies for transient failures with bounded delays and clear logging.
- Queue consumers with explicit ACK/NACK behavior and safe requeue decisions.
- Idempotent processing for repeated events/messages.
- Thin inbound layers delegating to application services.
- Dedicated payload mappers between transport models and internal models.
- Feature-level frontend services coordinating API, state, and UI commands.
- Reactive frontend state using explicit signals/selectors and deterministic updates.

## Anti-patterns

- Putting core business rules directly in controllers, gateways, or components.
- Direct coupling from application logic to concrete infrastructure clients without ports.
- Cross-layer imports that break dependency direction.
- Silent fallback behavior without logging or tests.
- Hardcoded credentials, hostnames, or operational secrets in code.
- Large "god services" that mix orchestration, validation, transport mapping, and persistence in one class.
- Adding new integration behavior without retry/error classification strategy.
- Shipping changes that bypass existing test suites or reduce configured coverage discipline.
- Relying on stale automation scripts without verifying they match current package scripts.
