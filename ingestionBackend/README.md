# ingestionBackend

NestJS backend to ingest iMazing WhatsApp CSV exports and prepare semantic data for a RAG pipeline.

## iMazing Source

iMazing: https://imazing.com

iMazing is a commercial product that helps extract WhatsApp data from devices and export conversations to CSV files, which are then used by this ingestion service.

## Ingestion Pipeline

Flow:

`CSV -> parse -> clean -> structure -> chunk -> embed -> store`

Current stage implementation:

- `parse`: reads iMazing CSV files and maps raw records into typed raw conversation messages.
- `clean`: normalizes message text and removes common noise/artifacts.
- `structure`: groups cleaned messages into conversational turns (customer -> agent).
- `chunk`: converts turns into semantic chunks ready for embedding.
- `embed`: wired as an extension point; currently kept as planned while cleaning rules are finalized.
- `store`: wired as an extension point through `VectorStorePort`; currently kept as planned while embedding stage is disabled.

## Qdrant Installation

Use Docker to install and run Qdrant:

```bash
docker run -d \
  -p 6333:6333 \
  -v /opt/qdrant_storage:/qdrant/storage \
  qdrant/qdrant
```

## Qdrant Integration

- Default URL: `http://localhost:6333`
- No authentication by default
- Optional API key: `QDRANT_API_KEY` environment variable
- Optional URL override: `QDRANT_URL` environment variable

Qdrant integration is isolated behind `VectorStorePort`. Only the outbound adapter (`QdrantVectorStoreAdapter`) talks to Qdrant directly.

## Main Endpoint

- `POST /ingestion/process-folder`
- Payload:

```json
{
  "folderPath": "./etc/_chatsEureka/csv"
}
```

## Development

```bash
npm install
npm run lint
npm run start:dev
```

## Configuration

- Non-secret settings: `src/main/infrastructure/config/settings/environment.json`
- Secret/runtime settings: `secrets.json` (use `secrets-example.json` as template)
- Set `service.enableQdrantIngestion` to `false` to keep storage ingestion disabled while refining cleaning/structuring/chunking quality.
