import { z } from 'zod';

export const environmentSettingsSchema = z.object({
  service: z.object({
    startupFailurePauseMinutes: z.number().int().positive().default(15)
  })
});
