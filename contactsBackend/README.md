# contactsBackend

NestJS microservice to authenticate with Google OAuth2 and manage contacts using Google People API.

## Endpoints

- `GET /auth/google/start`
- `GET /auth/google/callback`
- `GET /contacts`
- `PUT /contacts/upsert`

## Local config

- TCP port is configured in `src/main/infrastructure/config/settings/environment.json`.
- Secrets are loaded from `secrets.json`.
