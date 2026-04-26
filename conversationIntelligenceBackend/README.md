# Conversation intelligence backend

NestJS microservice for conversation intelligence classification.

`conversationIntelligenceBackend` is a NestJS microservice that classifies WhatsApp conversations into
actionable business signals and lifecycle stages. It exposes HTTP endpoints that return persisted conversation
intelligence, including current stage, stage history, summary, detected signals, and label inconsistencies.

The service is designed for customer-service operations where teams need a fast and explainable answer to:

- What is the customer trying to do right now?
- What is the customer sentiment and tone trend?
- Which lifecycle stage is this conversation currently in?
- Does this inferred stage conflict with known labels (prospect/customer/contact)?

## How This Microservice Works

The classification pipeline is hybrid and intentionally layered so it remains robust when one dependency is noisy:

1. Input and cache policy:
- `GET /conversationStage` receives `conversationId` and optionally `forceRefresh`.
- If a recent classification exists in MongoDB, it can be reused.
- If cache is stale/missing/forced, the service recomputes the intelligence document.

2. Evidence retrieval from Qdrant:
- The service fetches conversation chunks/messages indexed by `conversationId`.
- It extracts text and timestamps from chunk payloads and raw messages.
- It reconstructs chronological message evidence used for stage timeline segmentation.

3. Deterministic signal extraction (rules):
- Rule-based detectors identify high-confidence intents/signals from message text.
- Examples: payment intent, order confirmation, shipping, delivery, support issue,
  unsolicited sellers, brand counterfeiting.
- These signals provide stable behavior even when LLM confidence is low.

4. Semantic retrieval with embeddings:
- Probe phrases are embedded with BGE and searched in Qdrant.
- Top semantic matches are filtered by score threshold (`inference.semanticMinScore`).
- Semantic matches strengthen intent detection and provide fallback evidence.

5. LLM reasoning:
- Ollama-compatible LLM endpoint receives compact evidence and must return strict JSON.
- The model infers stage, summary, detected signals, confidence, and `noHint`.
- Low-confidence/no-hint responses do not override strong deterministic evidence.

6. Sentiment, intent, and lifecycle interpretation:
- Customer intent: inferred from deterministic and semantic signals plus LLM reasoning.
- Customer sentiment: inferred from textual tone and support/feedback semantics, then reflected in
  detected signals and LLM summary/confidence.
- Lifecycle stage: selected with precedence rules:
  deterministic signals > semantic evidence > LLM (when confidence is sufficient) > `UNIDENTIFIED`.
- Stage transitions are tracked as timeline segments (`previousStages`) with message/date boundaries.

7. Metadata enrichment and consistency checks:
- Contact metadata is enriched from `contactsBackend` and configured sales/prospect prefixes.
- The service generates inconsistency records when inferred stage conflicts with known labels.

8. Persistence and observability:
- Final result is upserted to MongoDB collection `conversationStages`.
- `/conversationStage/debug` exposes the same result plus diagnostic evidence used in the decision.

Current endpoint:

- `GET /conversationStage?conversationId=<id>`
  - Optional query: `forceRefresh=true|false`
  - Returns persisted lifecycle classification with:
    - `currentStage`
    - `previousStages`
    - `lastStageUpdate`
    - `summary`
    - `detectedSignals`
    - `classificationSource`
    - `inconsistencies`
- `GET /conversationStage/debug?conversationId=<id>`
  - Optional query: `forceRefresh=true|false` (defaults to `true` for diagnostic evidence)
  - Returns same stage payload plus inference evidence used during classification.

Startup includes connectivity preflight checks for:

- MongoDB
- LLM HTTP service
- `contactsBackend` (`/health`)
- BGE embedding service (`/embed`)
- Qdrant

On preflight failure, the service logs the failing dependency, waits a configurable delay, and exits with non-zero status.

Inference configuration is file-based at `src/main/infrastructure/config/settings/environment.json`:

- `inference.maxMessagesPerConversation`
- `inference.semanticProbeTopK`
- `inference.semanticMinScore`
- `inference.llmModel`
- `inference.recomputeTtlMinutes`
- `inference.allowLlmFallbackOnLowSignal`
- `inference.salesCodePrefixes`
