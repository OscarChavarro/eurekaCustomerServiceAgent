import { z } from 'zod';

export const secretsSettingsSchema = z.object({
  mongo: z.object({
    host: z.string().trim().min(1),
    port: z.number().int().positive(),
    database: z.string().trim().min(1),
    username: z.string().trim().min(1),
    password: z.string().trim().min(1)
  }),
  cors: z.object({
    allowedOrigins: z.array(z.string().trim().min(1)).default([]),
    allowedNetworkCidr: z.string().trim().min(1).optional()
  })
});
