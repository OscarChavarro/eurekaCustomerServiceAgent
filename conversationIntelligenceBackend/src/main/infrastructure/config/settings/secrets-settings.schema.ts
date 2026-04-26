import { z } from 'zod';

export const secretsSettingsSchema = z.object({
  service: z.object({
    port: z.number().int().positive()
  }),
  mongo: z.object({
    host: z.string().trim().min(1),
    port: z.number().int().positive(),
    database: z.string().trim().min(1),
    username: z.string().trim().min(1),
    password: z.string().trim().min(1)
  }),
  llm: z.object({
    baseUrl: z.string().url(),
    healthEndpoint: z.string().trim().min(1).default('/api/tags')
  }),
  contactsBackend: z.object({
    baseUrl: z.string().url()
  }),
  embedding: z.object({
    provider: z.string().trim().min(1),
    host: z.string().trim().min(1),
    port: z.number().int().positive()
  }),
  qdrant: z.object({
    url: z.string().url(),
    apiKey: z.string().optional(),
    collectionName: z.string().trim().min(1).optional()
  }),
  cors: z.object({
    allowedOrigins: z.array(z.string().trim().min(1)).default([]),
    allowedNetworkCidr: z.string().trim().min(1).optional()
  })
});
