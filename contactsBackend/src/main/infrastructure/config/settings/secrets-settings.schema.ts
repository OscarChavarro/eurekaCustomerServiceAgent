import { z } from 'zod';

export const secretsSettingsSchema = z.object({
  web: z.object({
    client_id: z.string().trim().min(1),
    project_id: z.string().trim().min(1),
    auth_uri: z.string().trim().min(1),
    token_uri: z.string().trim().min(1),
    auth_provider_x509_cert_url: z.string().trim().min(1),
    client_secret: z.string().trim().min(1),
    redirect_uris: z.array(z.string().trim().min(1)).min(1)
  }),
  cors: z.object({
    allowedOrigins: z.array(z.string().trim().min(1)).min(1),
    allowedNetworkCidr: z.string().trim().min(1).optional()
  }),
  googleAuthSession: z
    .object({
      pendingStates: z
        .array(
          z.object({
            value: z.string().trim().min(1),
            createdAtMs: z.number().int().nonnegative()
          })
        )
        .optional(),
      tokenSet: z
        .object({
          accessToken: z.string().trim().min(1),
          refreshToken: z.string().trim().min(1).optional(),
          expiryDateMs: z.number().int().optional(),
          tokenType: z.string().trim().min(1).optional(),
          scope: z.string().trim().min(1).optional()
        })
        .nullable()
        .optional()
    })
    .optional()
});
