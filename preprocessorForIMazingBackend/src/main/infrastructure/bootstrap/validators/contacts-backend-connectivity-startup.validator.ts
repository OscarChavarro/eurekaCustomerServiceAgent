import { Inject, Injectable } from '@nestjs/common';
import { ContactsBackendPort } from '../../../application/ports';
import { TOKENS } from '../../../application/ports/tokens';
import type { StartupValidator } from '../startup-validator.interface';

@Injectable()
export class ContactsBackendConnectivityStartupValidator implements StartupValidator {
  private contactsHash: string = 'unknown';

  constructor(
    @Inject(TOKENS.ContactsBackendPort)
    private readonly contactsBackendPort: ContactsBackendPort
  ) {}

  getName(): string {
    return 'ContactsBackendConnectivityStartupValidator';
  }

  getSuccessMessage(): string {
    return `contactsBackend health check succeeded. Contacts hash: ${this.contactsHash}.`;
  }

  async validate(): Promise<void> {
    await this.contactsBackendPort.assertHealth();
    this.contactsHash = await this.contactsBackendPort.getContactsHash();
  }
}
