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
