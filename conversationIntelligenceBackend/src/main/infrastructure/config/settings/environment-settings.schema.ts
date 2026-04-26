import { z } from 'zod';

export const environmentSettingsSchema = z.object({
  service: z.object({
    startupFailurePauseMinutes: z.number().int().positive().default(15)
  }),
  inference: z.object({
    maxMessagesPerConversation: z.number().int().positive().max(5000).default(300),
    semanticProbeTopK: z.number().int().positive().max(50).default(5),
    semanticMinScore: z.number().min(0).max(1).default(0.58),
    llmModel: z.string().trim().min(1).default('llama3.1:8b'),
    recomputeTtlMinutes: z.number().int().positive().max(7 * 24 * 60).default(60),
    allowLlmFallbackOnLowSignal: z.boolean().default(true),
    salesCodePrefixes: z.array(z.string().trim().min(1)).default(['S ', 'SALE '])
  })
});
