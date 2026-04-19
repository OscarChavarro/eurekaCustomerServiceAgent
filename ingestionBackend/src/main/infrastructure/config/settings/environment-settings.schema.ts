import { z } from 'zod';

export const environmentSettingsSchema = z.object({
  service: z.object({
    port: z.number().int().positive(),
    qdrantConnectionFailurePauseMinutes: z.number().int().positive(),
    processedConversationsFolderName: z.string().trim().min(1)
  }),
  qdrant: z.object({
    collectionName: z.string().trim().min(1)
  })
});
