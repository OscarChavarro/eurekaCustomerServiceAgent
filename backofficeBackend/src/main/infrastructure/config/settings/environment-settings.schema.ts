import { z } from 'zod';

export const environmentSettingsSchema = z.object({
  api: z.object({
    httpPort: z.number().int().positive()
  })
});
