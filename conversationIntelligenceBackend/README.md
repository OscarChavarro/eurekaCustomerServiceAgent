# conversationIntelligenceBackend

NestJS microservice for conversation intelligence classification.

Current endpoint:

- `GET /conversationStage?conversationId=<id>`
  - Returns a skeleton result with `currentStage: "UNDEFINED"` and empty `previousStage`.

Startup includes connectivity preflight checks for:

- MongoDB
- LLM HTTP service
- `contactsBackend` (`/health`)
- BGE embedding service (`/embed`)
- Qdrant

On preflight failure, the service logs the failing dependency, waits a configurable delay, and exits with non-zero status.
