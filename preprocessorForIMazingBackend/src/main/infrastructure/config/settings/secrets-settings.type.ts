export type ServiceSecretsSettings = {
  port: number;
};

export type ContactsBackendSecretsSettings = {
  baseUrl: string;
  pageSize: number;
  requestTimeoutMs: number;
};

export type SecretsSettings = {
  service: ServiceSecretsSettings;
  contactsBackend: ContactsBackendSecretsSettings;
};
