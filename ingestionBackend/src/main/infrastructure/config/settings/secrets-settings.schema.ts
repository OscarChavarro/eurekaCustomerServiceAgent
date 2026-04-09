import { z } from 'zod';

export const secretsSettingsSchema = z.object({
  qdrant: z.object({
    url: z.string().trim().min(1).default('http://localhost:6333'),
    apiKey: z.string().optional().transform((value) => {
      const normalizedValue = value?.trim();
      return normalizedValue && normalizedValue.length > 0 ? normalizedValue : null;
    })
  }),
  contactsBackend: z
    .object({
      url: z.string().trim().min(1).default('http://localhost:3669')
    })
    .default({
      url: 'http://localhost:3669'
    }),
  embedding: z.object({
    provider: z.string().trim().min(1),
    host: z.string().trim().min(1),
    port: z.number().int().positive()
  }),
  mongo: z.object({
    host: z.string().trim().min(1),
    port: z.number().int().positive(),
    database: z.string().trim().min(1),
    username: z.string().trim().min(1),
    password: z.string().trim().min(1)
  })
});
