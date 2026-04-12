# contactsBackend

NestJS microservice to authenticate with Google OAuth2 and manage contacts using Google People API.

## Endpoints

- `GET /health`
- `GET /auth/google/start`
- `GET /auth/google/callback`
- `GET /contacts`
- `POST /contacts`
- `PATCH /contacts/:resourceName`
- `DELETE /contacts`

### Contacts pagination behavior

`GET /contacts` fetches all contacts from Google People API by following `nextPageToken` until exhaustion.
`pageSize` controls per-request page size (1..1000), but the endpoint response includes the full aggregated list.

`POST /contacts` expects payload:
`{ names?: string[], emailAddresses?: string[], phoneNumbers?: string[], biographies?: string[] }`.
Only provided fields are sent to Google People API.

`PATCH /contacts/:resourceName` expects payload:
`{ names?: string[], emailAddresses?: string[], phoneNumbers?: string[], biographies?: string[] }`.
The backend first fetches the existing Google contact, merges existing data for omitted fields,
and updates only fields explicitly provided in the request.
Use URL-encoded resource names in the path (for example `people%2Fc1234567890`).

`DELETE /contacts` expects payload:
`[{ nameToDelete?: string, phoneToDelete?: string }]`.
Each item must have at least one non-empty field (`nameToDelete` or `phoneToDelete`).

## Local config

- TCP port is configured in `src/main/infrastructure/config/settings/environment.json`.
- Secrets are loaded from `secrets.json`.
