import { Inject, Injectable } from '@nestjs/common';
import type { GoogleContact, GooglePeoplePort } from '../../ports/outbound/google/google-people.port';
import { TOKENS } from '../../ports/tokens';
import { ResolveGoogleAccessTokenService } from '../../services/resolve-google-access-token.service';

export type UpsertGoogleContactCommand = {
  name: string;
  phoneNumber: string;
};

export type UpsertGoogleContactResult = {
  action: 'created' | 'updated';
  contact: {
    name: string;
    phoneNumbers: string[];
  };
};

@Injectable()
export class UpsertGoogleContactUseCase {
  constructor(
    private readonly resolveGoogleAccessTokenService: ResolveGoogleAccessTokenService,
    @Inject(TOKENS.GooglePeoplePort)
    private readonly googlePeoplePort: GooglePeoplePort
  ) {}

  public async execute(command: UpsertGoogleContactCommand): Promise<UpsertGoogleContactResult> {
    const accessToken = await this.resolveGoogleAccessTokenService.execute();
    const existing = await this.findByPhone(accessToken, command.phoneNumber);

    if (existing && existing.resourceName && existing.etag) {
      const updated = await this.googlePeoplePort.updateContact(accessToken, {
        resourceName: existing.resourceName,
        etag: existing.etag,
        displayName: command.name,
        phoneNumber: command.phoneNumber
      });

      return {
        action: 'updated',
        contact: {
          name: updated.displayName,
          phoneNumbers: updated.phoneNumbers
        }
      };
    }

    const created = await this.googlePeoplePort.createContact(accessToken, {
      displayName: command.name,
      phoneNumber: command.phoneNumber
    });

    return {
      action: 'created',
      contact: {
        name: created.displayName,
        phoneNumbers: created.phoneNumbers
      }
    };
  }

  private async findByPhone(accessToken: string, phoneNumber: string): Promise<GoogleContact | null> {
    const normalizedTarget = this.normalizePhone(phoneNumber);

    let pageToken: string | undefined;
    let loops = 0;

    do {
      const page = await this.googlePeoplePort.listContacts(accessToken, 200, pageToken);
      const match = page.contacts.find((contact) =>
        contact.phoneNumbers.some((candidate) => this.normalizePhone(candidate) === normalizedTarget)
      );

      if (match) {
        return match;
      }

      pageToken = page.nextPageToken;
      loops += 1;
    } while (pageToken && loops < 10);

    return null;
  }

  private normalizePhone(phone: string): string {
    return phone.replace(/[^0-9]/g, '');
  }
}
