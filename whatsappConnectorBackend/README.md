# whatsappConnectorBackend

NestJS microservice to connect a WhatsApp account using `@whiskeysockets/baileys`.

## Current Behavior

- QR-based connection (printed in terminal).
- Session persistence in `output/whatsapp-auth`.
- Continuous listening for incoming messages.
- HTTP endpoint: `GET /profileImage?phoneNumber=<digits_with_country_code>&size=<original|small>`
  - Example input: `41767876763`
  - Internally normalized to `+41767876763`
  - Daily cache in `<profileImages.baseFolderPath>/<phone_without_plus>/`
  - File naming format:
    - original: `YYYY_MMmmmDD.<ext>` (example: `2026_04apr18.jpg`)
    - small: `YYYY_MMmmmDD_small.jpg` (example: `2026_04apr18_small.jpg`)
  - If today's file exists for the requested size, returns cached image without querying WhatsApp.
  - `size=small` always returns a JPEG where the max image dimension is 64 pixels.
  - Returns the WhatsApp profile image with the corresponding image mime-type.
  - On error or missing profile image, returns HTTP `404 Not Found`.
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
- `secrets.profileImages.baseFolderPath`
- `environment.whiskeysocketswhatsapp.authFolderPath`
- `environment.whiskeysocketswhatsapp.printQrInTerminal`
- `environment.whatsapp.messageReceiveMode`: `WHATSAPP_ID`, `JSON`, or `SILENT`
- `environment.service.httpPort`

## Commands

- `npm install`
- `npm run start:dev`
- `npm run build`
- `npm start`
