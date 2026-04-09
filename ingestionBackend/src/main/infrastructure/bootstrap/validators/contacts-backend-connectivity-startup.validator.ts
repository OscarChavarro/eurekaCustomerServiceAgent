import { Inject, Injectable } from '@nestjs/common';
import type { ContactsDirectoryPort } from '../../../application/ports/outbound/contacts-directory.port';
import { TOKENS } from '../../../application/ports/tokens';
import type { StartupValidator } from '../startup-validator.interface';

@Injectable()
export class ContactsBackendConnectivityStartupValidator implements StartupValidator {
  constructor(
    @Inject(TOKENS.ContactsDirectoryPort)
    private readonly contactsDirectoryPort: ContactsDirectoryPort
  ) {}

  public getName(): string {
    return 'ContactsBackendConnectivityStartupValidator';
  }

  public getSuccessMessage(): string {
    return 'contactsBackend health check succeeded.';
  }

  public async validate(): Promise<void> {
    await this.contactsDirectoryPort.checkHealth();
  }
}
