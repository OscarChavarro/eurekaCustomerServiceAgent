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
- `embed`: BGE embedding service via HTTP (`/embed`) generating one vector per semantic chunk.
- `store`: wired through `VectorStorePort`; can stay disabled with `service.enableQdrantIngestion=false` while validating embedding quality.

## Processing Debug Output

- Stage payloads are persisted per conversation in `output/<processedConversationsFolderName>`.
- One JSON file is generated per `conversationId`.
- Console output only prints `<conversationId> - <phase>` (for `raw`, `clean`, `structure`, `chunk`, `embed`).
- On service startup, the output folder is validated for write access (created if missing).
- If write access fails, service logs:
  `Can not write to folder <path> ... Waiting for pod to allow debugging...`
  then pauses using `service.qdrantConnectionFailurePauseMinutes` and exits.

## MongoDB Observability

- MongoDB is used as an additional persistence layer for visualization and debugging.
- Startup includes a MongoDB connectivity validation.
- If MongoDB is not reachable, the service logs:
  `Cannot connect to MongoDB, waiting for pod to become available`
  then pauses using `service.qdrantConnectionFailurePauseMinutes` and exits.

Collections:

- `conversations` (one document per conversation):
  - `_id` (`conversationId`)
  - `rawMessages`
  - `cleanedMessages`
  - `structuredMessages`
  - `chunkedMessages`
  - `metadata` (`createdAt`, `source`)
- `embeddings` (one document per chunk):
  - `_id` (`embeddingId`)
  - `conversationId`
  - `chunkIndex`
  - `chunkId`
  - `text`
  - `vector`
  - `createdAt`

The pipeline updates `conversations` after each stage (`raw`, `clean`, `structure`, `chunk`) and persists chunk vectors into `embeddings` during `embed`.

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

## Embedding Integration

- Provider: `bge`
- Endpoint format: `http://<embedding.host>:<embedding.port>/embed`
- Request payload: `{ "text": "<chunk_text>" }`
- Expected response: `{ "vector": number[] }` with 1024 dimensions (`bge-m3`)

## BGE Installation

Dependencies install
```bash
apt-get update
apt-get install python3 python3-pip python3.10-venv uvicorn
pip3 install torch transformers sentence-transformers
pip3 install torch --index-url https://download.pytorch.org/whl/cu121
```

If this fails due to conflicting operating system python installation, it is possible to run it under `venv`:

```bash
python3 -m venv venv
source venv/bin/activate
# Run everything inside this container, specific commands depends on you GPU/Driver/OS versions
pip install "numpy<2"
pip install torch==1.13.1
```

Test local installation. First usage downloads the embeddings model.

```bash
cat > testBge.py << EOF
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("BAAI/bge-m3")

text = "Client ask for chispita product. Answer: Yes, from 25USD."

embedding = model.encode(text)

print(len(embedding))  # Number of dimensions
print(embedding[:5])   # Will print just first 5 values
EOF
python3 testBge.py
```

If this works (generates a 1024 vector), it can be wrapped with `fastapi` to turn it in to a REST api endpoint:

```bash
pip install fastapi uvicorn
cat > main.py << EOF
from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

app = FastAPI()

model = SentenceTransformer("BAAI/bge-m3")

class EmbedRequest(BaseModel):
    text: str

@app.post("/embed")
def embed(req: EmbedRequest):
    vector = model.encode(req.text).tolist()
    return { "vector": vector }
EOF
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

This can be tested with
```bash
curl -X POST http://localhost:8000/embed   -H "Content-Type: application/json"   -d '{"text": "Client ask for chispita product. Answer: Yes, from 25USD."}'
```
or using the included Bruno endpoint.

## Main Endpoint

- `POST /ingestion/process-folder`
- Payload:

```json
{
  "folderPath": "./etc/_chatsEureka/csv"
}
```

`folderPath` accepts either:
- A directory path: processes all `.csv` files in that directory.
- A single `.csv` file path: processes only that file.

## Development

```bash
npm install
npm run lint
npm run start:dev
```

## Configuration

- Non-secret settings: `src/main/infrastructure/config/settings/environment.json`
- Secret/runtime settings: `secrets.json` (use `secrets-example.json` as template)
- Processed conversations output folder name is configured with `service.processedConversationsFolderName`.
- Embedding service secrets are configured under `embedding.provider`, `embedding.host`, and `embedding.port`.
- MongoDB secrets are configured under `mongo.host`, `mongo.port`, `mongo.database`, `mongo.username`, and `mongo.password`.
- Set `service.enableQdrantIngestion` to `false` to keep storage ingestion disabled while refining cleaning/structuring/chunking quality.
