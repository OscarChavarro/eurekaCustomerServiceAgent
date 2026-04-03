import { z } from 'zod';

export const secretsSettingsSchema = z.object({
  qdrant: z.object({
    url: z.string().trim().min(1).default('http://localhost:6333'),
    apiKey: z.string().optional().transform((value) => {
      const normalizedValue = value?.trim();
      return normalizedValue && normalizedValue.length > 0 ? normalizedValue : null;
    })
  }),
  embedding: z.object({
    dimension: z.number().int().positive()
  })
});
