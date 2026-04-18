export interface RetrievalBackendPort {
  assertHealth(): Promise<void>;
  completeChat(prompt: string, customerId: string): Promise<string>;
}

export const RETRIEVAL_BACKEND_PORT = Symbol('RETRIEVAL_BACKEND_PORT');
