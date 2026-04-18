# whatsappConnectorBackend

NestJS microservice to connect a WhatsApp account using `@whiskeysockets/baileys`.

## Current Behavior

- QR-based connection (printed in terminal).
- Session persistence in `output/whatsapp-auth`.
- Continuous listening for incoming messages.
- For each incoming message, prints the sender WhatsApp identifier.
- Startup connectivity checks against `contactsBackend`:
  - `GET /health`
  - `GET /contacts`

## Configuration

1. Copy `secrets-example.json` to `secrets.json`.
2. Adjust `environment.json` as needed.

Main fields:

- `secrets.contactsBackend.host`
- `secrets.contactsBackend.port`
- `secrets.contactsBackend.pageSize`
- `secrets.contactsBackend.requestTimeoutMs`
- `environment.whiskeysocketswhatsapp.authFolderPath`
- `environment.whiskeysocketswhatsapp.printQrInTerminal`
- `environment.whatsapp.messageReceiveMode`: `WHATSAPP_ID`, `JSON`, or `SILENT`

## Commands

- `npm install`
- `npm run start:dev`
- `npm run build`
- `npm start`
