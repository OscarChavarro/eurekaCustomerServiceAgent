export class QdrantConnectionError extends Error {
  constructor(
    message =
      'Unable to connect to Qdrant. Please verify qdrant.url and qdrant.apiKey in secrets.json.'
  ) {
    super(message);
    this.name = 'QdrantConnectionError';
  }
}
