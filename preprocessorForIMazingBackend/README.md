# preprocessorForIMazingBackend

NestJS microservice that normalizes iMazing WhatsApp export paths.

## Endpoint

### `POST /normalizePath`

Request body:

```json
{
  "path": "/absolute/or/relative/root-folder"
}
```

`path` must point to a folder that contains:

```text
<root>/
  csv/
  media/
```

The endpoint executes the existing normalization flow:

1. Creates and maintains auxiliary folders (`csv_groups`, `csv_disabled`, `csv_unsupported`, `outlog`).
2. Moves grouped and disabled conversations to their target folders.
3. Moves Facebook confirmation and unsupported CSV files to `csv_unsupported`.
4. Resolves contact phone numbers from CSV content, numeric names, and `contactsBackend` contacts.
5. Renames CSV and media paths to normalized phone-based names.
6. Writes `outlog/unprocessed.txt`.

Response:

```json
{
  "status": "ok"
}
```

## Health endpoint

### `GET /health`

Response:

```json
{
  "status": "ok"
}
```

## Configuration

Create `secrets.json` from `secrets-example.json`.

```json
{
  "service": {
    "port": 3671
  },
  "contactsBackend": {
    "baseUrl": "http://localhost:3669",
    "pageSize": 100,
    "requestTimeoutMs": 10000
  }
}
```

- `service.port`: TCP port where this microservice listens.
- `contactsBackend.baseUrl`: base URL for contacts service.
- `contactsBackend.pageSize`: page size for `GET /contacts`.
- `contactsBackend.requestTimeoutMs`: timeout for `contactsBackend` requests.

## Startup behavior

On startup, the service:

1. Verifies `contactsBackend` health (`GET /health`).
2. Loads contacts and computes a deterministic SHA-256 contacts hash.
3. Starts HTTP server and logs in English the TCP port where the service is listening.

## Install

```bash
npm install
```

## Build

```bash
npm run build
```

## Run

```bash
npm run start
```

No CLI parameters are required.

## Bruno collection

A Bruno collection is provided under:

```text
bruno/preprocessorForIMazingBackend
```

It includes:

- `GET /health`
- `POST /normalizePath`
