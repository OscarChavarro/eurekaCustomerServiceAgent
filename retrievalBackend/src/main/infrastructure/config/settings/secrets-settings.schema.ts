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
  contextGenerator: z.object({
    implementation: z.enum(['naive', 'vector-search']),
    naive: z.object({
      contextMessage: z.string().trim().min(1)
    })
  })
});
