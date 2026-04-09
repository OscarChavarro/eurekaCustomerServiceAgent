import { Inject, Injectable } from '@nestjs/common';
import type { GoogleContact, GooglePeoplePort } from '../../ports/outbound/google/google-people.port';
import { TOKENS } from '../../ports/tokens';
import { ResolveGoogleAccessTokenService } from '../../services/resolve-google-access-token.service';

export type ListGoogleContactsCommand = {
  pageSize: number;
};

export type ListGoogleContactsResult = {
  contacts: Array<{
    names: string[];
    phoneNumbers: string[];
  }>;
};

@Injectable()
export class ListGoogleContactsUseCase {
  constructor(
    private readonly resolveGoogleAccessTokenService: ResolveGoogleAccessTokenService,
    @Inject(TOKENS.GooglePeoplePort)
    private readonly googlePeoplePort: GooglePeoplePort
  ) {}

  public async execute(command: ListGoogleContactsCommand): Promise<ListGoogleContactsResult> {
    const accessToken = await this.resolveGoogleAccessTokenService.execute();

    const collected: GoogleContact[] = [];
    let pageToken: string | undefined;
    let loops = 0;

    do {
      const page = await this.googlePeoplePort.listContacts(accessToken, command.pageSize, pageToken);
      collected.push(...page.contacts);
      pageToken = page.nextPageToken;
      loops += 1;
    } while (pageToken && loops < 10);

    return {
      contacts: collected.map((contact) => ({
        names: contact.displayName ? [contact.displayName] : [],
        phoneNumbers: contact.phoneNumbers
      }))
    };
  }
}
