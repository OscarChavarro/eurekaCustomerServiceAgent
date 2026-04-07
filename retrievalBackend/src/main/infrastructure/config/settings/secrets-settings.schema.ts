import { z } from 'zod';

export const secretsSettingsSchema = z.object({
  cors: z.object({
    allowedOrigins: z.array(z.string().trim().min(1)).default([]),
    allowedNetworkCidr: z.string().trim().min(1).optional()
  }),
  llm: z.object({
    host: z.string().trim().min(1),
    port: z.number().int().positive(),
    endpoint: z.string().trim().min(1)
  }),
  embedding: z.object({
    provider: z.string().trim().min(1),
    host: z.string().trim().min(1),
    port: z.number().int().positive()
  }),
  qdrant: z.object({
    url: z.string().trim().min(1),
    apiKey: z.string().optional().transform((value) => {
      const normalizedValue = value?.trim();
      return normalizedValue && normalizedValue.length > 0 ? normalizedValue : null;
    }),
    collectionName: z.string().trim().min(1)
  }),
  contextGenerator: z.object({
    implementation: z.enum(['naive', 'vector-search']),
    naive: z.object({
      contextFilePath: z.string().trim().min(1)
    }),
    vectorSearch: z.object({
      maxMatches: z.number().int().positive().default(5)
    })
  })
});
