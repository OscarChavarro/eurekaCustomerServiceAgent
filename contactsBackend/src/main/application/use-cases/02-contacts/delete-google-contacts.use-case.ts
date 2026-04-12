import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { GoogleContact, GooglePeoplePort } from '../../ports/outbound/google/google-people.port';
import { TOKENS } from '../../ports/tokens';
import { ResolveGoogleAccessTokenService } from '../../services/resolve-google-access-token.service';

export type DeleteGoogleContactsCommand = {
  contactsToDelete: Array<{
    nameToDelete?: string;
    phoneToDelete?: string;
  }>;
};

export type DeleteGoogleContactsResult = {
  action: 'deleted';
  requestedCount: number;
  contacts: Array<{
    nameToDelete: string;
    phoneToDelete: string;
  }>;
};

@Injectable()
export class DeleteGoogleContactsUseCase {
  constructor(
    private readonly resolveGoogleAccessTokenService: ResolveGoogleAccessTokenService,
    @Inject(TOKENS.GooglePeoplePort)
    private readonly googlePeoplePort: GooglePeoplePort
  ) {}

  public async execute(command: DeleteGoogleContactsCommand): Promise<DeleteGoogleContactsResult> {
    const normalizedDeleteQueries = command.contactsToDelete.map((contact, index) =>
      this.normalizeDeleteQuery(contact, index)
    );

    if (normalizedDeleteQueries.length === 0) {
      throw new BadRequestException('Request body must contain at least one contact to delete.');
    }

    const accessToken = await this.resolveGoogleAccessTokenService.execute();
    const listedContacts = await this.listAllContacts(accessToken);
    const availableContacts = [...listedContacts];
    const deletedContactsSummary: Array<{ nameToDelete: string; phoneToDelete: string }> = [];

    for (const query of normalizedDeleteQueries) {
      const matches = availableContacts.filter((contact) =>
        this.matchesDeleteQuery(contact, query)
      );

      if (matches.length === 0) {
        throw new NotFoundException(
          `No Google contact matches delete criteria (name="${query.nameToDelete ?? ''}", phone="${query.phoneToDelete ?? ''}").`
        );
      }

      if (matches.length > 1) {
        throw new ConflictException(
          `Delete criteria is ambiguous. Found ${matches.length} contacts for (name="${query.nameToDelete ?? ''}", phone="${query.phoneToDelete ?? ''}").`
        );
      }

      const matchedContact = matches[0];
      if (!matchedContact) {
        throw new Error('Unexpected empty delete candidate.');
      }

      await this.googlePeoplePort.deleteContact(accessToken, {
        resourceName: matchedContact.resourceName
      });

      const indexToRemove = availableContacts.findIndex(
        (contact) => contact.resourceName === matchedContact.resourceName
      );
      if (indexToRemove >= 0) {
        availableContacts.splice(indexToRemove, 1);
      }

      deletedContactsSummary.push({
        nameToDelete: query.nameToDelete ?? '',
        phoneToDelete: query.phoneToDelete ?? ''
      });
    }

    return {
      action: 'deleted',
      requestedCount: normalizedDeleteQueries.length,
      contacts: deletedContactsSummary
    };
  }

  private async listAllContacts(accessToken: string): Promise<GoogleContact[]> {
    const contacts: GoogleContact[] = [];
    const seenPageTokens = new Set<string>();

    let pageToken: string | undefined;

    while (true) {
      const page = await this.googlePeoplePort.listContacts(accessToken, 200, pageToken);
      contacts.push(...page.contacts);

      const nextPageToken = page.nextPageToken?.trim();
      if (!nextPageToken) {
        break;
      }

      if (seenPageTokens.has(nextPageToken)) {
        throw new Error('Detected repeated Google People API nextPageToken while listing contacts for delete.');
      }

      seenPageTokens.add(nextPageToken);
      pageToken = nextPageToken;
    }

    return contacts;
  }

  private normalizeDeleteQuery(
    query: { nameToDelete?: string; phoneToDelete?: string },
    index: number
  ): { nameToDelete?: string; phoneToDelete?: string } {
    const nameToDelete = this.normalizeOptionalText(query.nameToDelete);
    const phoneToDelete = this.normalizeOptionalText(query.phoneToDelete);

    if (!nameToDelete && !phoneToDelete) {
      throw new BadRequestException(
        `Delete item at index ${index} must include at least one non-empty field: nameToDelete or phoneToDelete.`
      );
    }

    return {
      nameToDelete,
      phoneToDelete
    };
  }

  private matchesDeleteQuery(
    contact: GoogleContact,
    query: { nameToDelete?: string; phoneToDelete?: string }
  ): boolean {
    const nameMatches =
      !query.nameToDelete ||
      this.normalizeName(contact.displayName) === this.normalizeName(query.nameToDelete);

    if (!nameMatches) {
      return false;
    }

    if (!query.phoneToDelete) {
      return true;
    }

    const targetPhoneDigits = this.normalizePhoneDigits(query.phoneToDelete);
    return contact.phoneNumbers.some((candidate) =>
      this.phoneDigitsMatch(this.normalizePhoneDigits(candidate), targetPhoneDigits)
    );
  }

  private normalizeOptionalText(value: string | undefined): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private normalizeName(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  private normalizePhoneDigits(value: string): string {
    return value.replace(/\D+/g, '');
  }

  private phoneDigitsMatch(leftDigits: string, rightDigits: string): boolean {
    if (!leftDigits || !rightDigits) {
      return false;
    }

    if (leftDigits === rightDigits) {
      return true;
    }

    if (leftDigits.length < 7 || rightDigits.length < 7) {
      return false;
    }

    return leftDigits.endsWith(rightDigits) || rightDigits.endsWith(leftDigits);
  }
}
