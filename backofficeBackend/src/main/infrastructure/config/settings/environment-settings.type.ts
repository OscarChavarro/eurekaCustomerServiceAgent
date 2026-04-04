import type { z } from 'zod';
import type { environmentSettingsSchema } from './environment-settings.schema';

export type EnvironmentSettings = z.infer<typeof environmentSettingsSchema>;
