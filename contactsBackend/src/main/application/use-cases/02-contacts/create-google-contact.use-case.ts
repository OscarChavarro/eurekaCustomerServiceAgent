import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { GooglePeoplePort } from '../../ports/outbound/google/google-people.port';
import { TOKENS } from '../../ports/tokens';
import { ResolveGoogleAccessTokenService } from '../../services/resolve-google-access-token.service';

export type CreateGoogleContactCommand = {
  names?: string[];
  emailAddresses?: string[];
  phoneNumbers?: string[];
  biographies?: string[];
};

export type CreateGoogleContactResult = {
  action: 'created';
  contact: {
    resourceName: string;
    names: string[];
    emailAddresses: string[];
    phoneNumbers: string[];
    biographies: string[];
  };
};

@Injectable()
export class CreateGoogleContactUseCase {
  constructor(
    private readonly resolveGoogleAccessTokenService: ResolveGoogleAccessTokenService,
    @Inject(TOKENS.GooglePeoplePort)
    private readonly googlePeoplePort: GooglePeoplePort
  ) {}

  public async execute(command: CreateGoogleContactCommand): Promise<CreateGoogleContactResult> {
    const names = this.normalizeOptionalTextArray(command.names);
    const emailAddresses = this.normalizeOptionalTextArray(command.emailAddresses);
    const phoneNumbers = this.normalizeOptionalTextArray(command.phoneNumbers);
    const biographies = this.normalizeOptionalTextArray(command.biographies);

    if (
      !this.hasAtLeastOneValue(names) &&
      !this.hasAtLeastOneValue(emailAddresses) &&
      !this.hasAtLeastOneValue(phoneNumbers) &&
      !this.hasAtLeastOneValue(biographies)
    ) {
      throw new BadRequestException(
        'At least one value must be provided in names, emailAddresses, phoneNumbers, or biographies.'
      );
    }

    const accessToken = await this.resolveGoogleAccessTokenService.execute();
    const created = await this.googlePeoplePort.createContact(accessToken, {
      ...(names !== undefined ? { names } : {}),
      ...(emailAddresses !== undefined ? { emailAddresses } : {}),
      ...(phoneNumbers !== undefined ? { phoneNumbers } : {}),
      ...(biographies !== undefined ? { biographies } : {})
    });

    return {
      action: 'created',
      contact: {
        resourceName: created.resourceName,
        names: created.names,
        emailAddresses: created.emailAddresses,
        phoneNumbers: created.phoneNumbers,
        biographies: created.biographies
      }
    };
  }

  private normalizeOptionalTextArray(values: string[] | undefined): string[] | undefined {
    if (!Array.isArray(values)) {
      return undefined;
    }

    return values.map((value) => value.trim()).filter((value) => value.length > 0);
  }

  private hasAtLeastOneValue(values: string[] | undefined): boolean {
    return Array.isArray(values) && values.length > 0;
  }
}
