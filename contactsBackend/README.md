# contactsBackend

NestJS microservice to authenticate with Google OAuth2 and manage contacts using Google People API.

## Endpoints

- `GET /health`
- `GET /auth/google/start`
- `GET /auth/google/callback`
- `GET /contacts`
- `PUT /contacts/upsert`

### Contacts pagination behavior

`GET /contacts` fetches all contacts from Google People API by following `nextPageToken` until exhaustion.
`pageSize` controls per-request page size (1..1000), but the endpoint response includes the full aggregated list.

## Local config

- TCP port is configured in `src/main/infrastructure/config/settings/environment.json`.
- Secrets are loaded from `secrets.json`.
