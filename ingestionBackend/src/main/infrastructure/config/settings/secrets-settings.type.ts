import type { z } from 'zod';
import type { secretsSettingsSchema } from './secrets-settings.schema';

export type SecretsSettings = z.infer<typeof secretsSettingsSchema>;
