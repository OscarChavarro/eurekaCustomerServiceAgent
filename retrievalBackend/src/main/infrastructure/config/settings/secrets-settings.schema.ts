import { z } from 'zod';

export const secretsSettingsSchema = z.object({
  cors: z.object({
    allowedOrigins: z.array(z.string().trim().min(1)).default([]),
    allowedNetworkCidr: z.string().trim().min(1).optional()
  }),
  llm: z.object({
    host: z.string().trim().min(1),
    port: z.number().int().positive(),
    endpoint: z.string().trim().min(1),
    contextMessage: z.string().trim().min(1)
  })
});
