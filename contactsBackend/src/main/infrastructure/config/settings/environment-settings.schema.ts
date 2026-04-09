import { z } from 'zod';

export const environmentSettingsSchema = z.object({
  api: z.object({
    httpPort: z.number().int().positive()
  }),
  service: z.object({
    oauthStateTtlMinutes: z.number().int().positive(),
    authSessionFilePath: z.string().trim().min(1)
  })
});
