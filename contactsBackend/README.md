# contactsBackend

NestJS microservice to authenticate with Google OAuth2 and manage contacts using Google People API.

## Endpoints

- `GET /health`
- `GET /auth/google/start`
- `GET /auth/google/callback`
- `GET /contacts`
- `DELETE /contacts`
- `PUT /contacts/upsert`

### Contacts pagination behavior

`GET /contacts` fetches all contacts from Google People API by following `nextPageToken` until exhaustion.
`pageSize` controls per-request page size (1..1000), but the endpoint response includes the full aggregated list.

`PUT /contacts/upsert` expects payload:
`{ currentName?: string, currentPhoneNumber?: string, newName: string, newPhoneNumber: string }`.
If `currentName` and `currentPhoneNumber` are both empty/missing it is treated as `created`;
otherwise it is treated as `updated`.

`DELETE /contacts` expects payload:
`[{ nameToDelete?: string, phoneToDelete?: string }]`.
Each item must have at least one non-empty field (`nameToDelete` or `phoneToDelete`).

## Local config

- TCP port is configured in `src/main/infrastructure/config/settings/environment.json`.
- Secrets are loaded from `secrets.json`.
