import * as path from 'path';

import { PreprocessWhatsappExportUseCase } from '../application/PreprocessWhatsappExportUseCase';
import { SimpleCsvParser } from '../infrastructure/csv/SimpleCsvParser';
import { NodeFileSystemAdapter } from '../infrastructure/fs/NodeFileSystemAdapter';
import { ConsoleLogger } from '../infrastructure/logging/ConsoleLogger';

async function main(): Promise<void> {
  const rootFolderArgument: string | undefined = process.argv[2];
  if (rootFolderArgument === undefined || rootFolderArgument.trim().length === 0) {
    throw new Error('Usage: npm run start -- /path/to/root-folder');
  }

  const rootFolderPath: string = path.resolve(rootFolderArgument);
  const useCase: PreprocessWhatsappExportUseCase = new PreprocessWhatsappExportUseCase(
    new NodeFileSystemAdapter(),
    new SimpleCsvParser(),
    new ConsoleLogger()
  );

  await useCase.execute(rootFolderPath);
}

main().catch((error: Error) => {
  // tslint:disable-next-line:no-console
  console.error(`[ERROR] ${error.message}`);
  process.exit(1);
});
