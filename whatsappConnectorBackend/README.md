# whatsappConnectorBackend

NestJS microservice to connect a WhatsApp account using `@whiskeysockets/baileys`.

## Current Behavior

- QR-based connection (printed in terminal).
- Session persistence in `output/whatsapp-auth`.
- Continuous listening for incoming messages.
- Startup connectivity checks against `contactsBackend`:
  - `GET /health`
  - `GET /contacts`
- Startup connectivity check against `retrievalBackend`:
  - `GET /health`
- Incoming messages are routed through message-processing strategies:
  - `Dummy` (fallback): prints the original incoming JSON payload.
  - `AgentControl`: if message text contains `Eury` (case-insensitive), sends:
    `escuchamos, juzgamos y guardamos evidencia de todo en la base de datos`

## Configuration

1. Copy `secrets-example.json` to `secrets.json`.
2. Adjust `environment.json` as needed.

Main fields:

- `secrets.contactsBackend.host`
- `secrets.contactsBackend.port`
- `secrets.contactsBackend.pageSize`
- `secrets.contactsBackend.requestTimeoutMs`
- `secrets.retrievalBackend.baseUrl`
- `environment.whiskeysocketswhatsapp.authFolderPath`
- `environment.whiskeysocketswhatsapp.printQrInTerminal`
- `environment.whatsapp.messageReceiveMode`: `WHATSAPP_ID`, `JSON`, or `SILENT`

## Commands

- `npm install`
- `npm run start:dev`
- `npm run build`
- `npm start`
