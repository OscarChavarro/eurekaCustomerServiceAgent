# ingestionBackend

NestJS backend to ingest iMazing WhatsApp CSV exports and store embeddings in Qdrant.

## iMazing Source

iMazing: https://imazing.com

iMazing is a commercial product that helps extract WhatsApp data from devices and export conversations to CSV files, which are then used by this ingestion service.

## Qdrant Installation

Use Docker to install and run Qdrant:

```bash
docker run -d \
  -p 6333:6333 \
  -v /opt/qdrant_storage:/qdrant/storage \
  qdrant/qdrant
```

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
- Set `service.enableQdrantIngestion` to `false` while message-cleaning logic is still pending.
