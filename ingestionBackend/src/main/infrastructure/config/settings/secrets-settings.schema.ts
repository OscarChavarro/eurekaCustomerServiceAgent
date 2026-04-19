import { z } from 'zod';

const whisperModelSchema = z
  .enum(['tiny', 'base', 'small', 'medium', 'large', 'TINY', 'BASE', 'SMALL', 'MEDIUM', 'LARGE'])
  .transform((value) => value.toLowerCase() as 'tiny' | 'base' | 'small' | 'medium' | 'large');

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
  staticAssets: z.object({
    baseUrl: z.string().trim().min(1)
  }),
  embedding: z.object({
    provider: z.string().trim().min(1),
    host: z.string().trim().min(1),
    port: z.number().int().positive()
  }),
  whisper: z
    .object({
      device: z
        .enum(['cpu', 'gpu', 'CPU', 'GPU'])
        .transform((value) => value.toLowerCase() as 'cpu' | 'gpu')
        .default('gpu'),
      model: whisperModelSchema.default('large'),
      workers: z.number().int().positive().default(1)
    })
    .default({
      device: 'gpu',
      model: 'large',
      workers: 1
    }),
  mongo: z.object({
    host: z.string().trim().min(1),
    port: z.number().int().positive(),
    database: z.string().trim().min(1),
    username: z.string().trim().min(1),
    password: z.string().trim().min(1)
  })
});
