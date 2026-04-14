import * as path from 'path';

import { PreprocessWhatsappExportUseCase } from '../application/PreprocessWhatsappExportUseCase';
import { SimpleCsvParser } from '../infrastructure/csv/SimpleCsvParser';
import { SecretsConfig } from '../infrastructure/config/SecretsConfig';
import { ContactsBackendHttpAdapter } from '../infrastructure/contacts/ContactsBackendHttpAdapter';
import { NodeFileSystemAdapter } from '../infrastructure/fs/NodeFileSystemAdapter';
import { ConsoleLogger } from '../infrastructure/logging/ConsoleLogger';

async function main(): Promise<void> {
  const rootFolderArgument: string | undefined = process.argv[2];
  if (rootFolderArgument === undefined || rootFolderArgument.trim().length === 0) {
    throw new Error('Usage: npm run start -- /path/to/root-folder');
  }

  const rootFolderPath: string = path.resolve(rootFolderArgument);
  const secretsConfig: SecretsConfig = new SecretsConfig();
  const contactsBackendSettings = await secretsConfig.load();
  const contactsBackend = new ContactsBackendHttpAdapter({
    baseUrl: contactsBackendSettings.baseUrl,
    pageSize: contactsBackendSettings.pageSize ?? 100,
    requestTimeoutMs: contactsBackendSettings.requestTimeoutMs ?? 10000
  });

  const useCase: PreprocessWhatsappExportUseCase = new PreprocessWhatsappExportUseCase(
    new NodeFileSystemAdapter(),
    new SimpleCsvParser(),
    contactsBackend,
    new ConsoleLogger()
  );

  await useCase.execute(rootFolderPath);
}

main().catch((error: Error) => {
  // tslint:disable-next-line:no-console
  console.error(`[ERROR] ${error.message}`);
  process.exit(1);
});
