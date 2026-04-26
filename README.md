# Eureka Customer Service Agent

This project is focused on building a customer-service knowledge and operations platform based on WhatsApp conversations.

## Initial Idea

The initial scope is to process WhatsApp conversation exports (CSV files generated with iMazing), transform them into structured knowledge, and prepare them for semantic search using vector storage.

High-level ingestion flow:

`CSV -> parse -> clean -> structure -> chunk -> embed -> store`

This foundation is intended to support future customer-service workflows such as faster context retrieval, conversation understanding, and operational analytics.

## Project Components

The repository is organized to evolve into multiple services and applications over time. The first implemented component is the ingestion service.

For its setup and usage, see:

- [ingestionBackend README](./ingestionBackend/README.md)

## Architecture

Components view:

![Eureka architecture](./doc/architecture/eureka-architecture.png)

Project READMEs:

- [backofficeFrontend README](./backofficeFrontend/README.md)
- [backofficeBackend README](./backofficeBackend/README.md)
- [retrievalBackend README](./retrievalBackend/README.md)
- [ingestionBackend README](./ingestionBackend/README.md)
- [contactsBackend README](./contactsBackend/README.md)
- [preprocessorForIMazingBackend README](./preprocessorForIMazingBackend/README.md)

### Current Scope (v1)

- `backofficeFrontend` and `backofficeBackend` for customer-service operations.
- `retrievalBackend` for `/v1/chat/completions` wrapper and retrieval-oriented LLM orchestration.
- `ingestionBackend` processing `iMazing` CSV exports.
- `contactsBackend` for Google OAuth2 and customer-contact operations through Google People API.
- `bge` for embeddings and `Qdrant` for vector storage.
- `MongoDb` for operational persistence.
- `nginx` for static asset serving.
- `notificationMessageSender` for WhatsApp outbound messages.

### Planned Next Iterations

- Extend `retrievalBackend` with a `contextBuilder` to prepare prompt-ready context.
- Add a product `catalog` fed from WIX e-commerce data.
