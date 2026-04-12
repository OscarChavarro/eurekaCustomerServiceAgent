import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { PatchGoogleContactCommand as PatchGoogleContactPortCommand, GooglePeoplePort } from '../../ports/outbound/google/google-people.port';
import { TOKENS } from '../../ports/tokens';
import { ResolveGoogleAccessTokenService } from '../../services/resolve-google-access-token.service';

export type PatchGoogleContactCommand = {
  resourceName: string;
  names?: string[];
  emailAddresses?: string[];
  phoneNumbers?: string[];
  biographies?: string[];
};

export type PatchGoogleContactResult = {
  action: 'updated';
  contact: {
    resourceName: string;
    names: string[];
    emailAddresses: string[];
    phoneNumbers: string[];
    biographies: string[];
  };
};

@Injectable()
export class PatchGoogleContactUseCase {
  constructor(
    private readonly resolveGoogleAccessTokenService: ResolveGoogleAccessTokenService,
    @Inject(TOKENS.GooglePeoplePort)
    private readonly googlePeoplePort: GooglePeoplePort
  ) {}

  public async execute(command: PatchGoogleContactCommand): Promise<PatchGoogleContactResult> {
    const resourceName = command.resourceName.trim();
    if (resourceName.length === 0) {
      throw new BadRequestException('Path parameter "resourceName" must be a non-empty string.');
    }

    const namesProvided = Array.isArray(command.names);
    const emailAddressesProvided = Array.isArray(command.emailAddresses);
    const phoneNumbersProvided = Array.isArray(command.phoneNumbers);
    const biographiesProvided = Array.isArray(command.biographies);

    if (!namesProvided && !emailAddressesProvided && !phoneNumbersProvided && !biographiesProvided) {
      throw new BadRequestException(
        'Provide at least one field to update: names, emailAddresses, phoneNumbers, or biographies.'
      );
    }

    const patchCommand: PatchGoogleContactPortCommand = { resourceName };

    if (namesProvided) {
      patchCommand.names = this.normalizeProvidedTextArray(command.names);
    }

    if (emailAddressesProvided) {
      patchCommand.emailAddresses = this.normalizeProvidedTextArray(command.emailAddresses);
    }

    if (phoneNumbersProvided) {
      patchCommand.phoneNumbers = this.normalizeProvidedTextArray(command.phoneNumbers);
    }

    if (biographiesProvided) {
      patchCommand.biographies = this.normalizeProvidedTextArray(command.biographies);
    }

    const accessToken = await this.resolveGoogleAccessTokenService.execute();
    const updated = await this.googlePeoplePort.patchContact(accessToken, patchCommand);

    return {
      action: 'updated',
      contact: {
        resourceName: updated.resourceName,
        names: updated.names,
        emailAddresses: updated.emailAddresses,
        phoneNumbers: updated.phoneNumbers,
        biographies: updated.biographies
      }
    };
  }

  private normalizeProvidedTextArray(values: string[] | undefined): string[] {
    if (!Array.isArray(values)) {
      return [];
    }

    return values.map((value) => value.trim()).filter((value) => value.length > 0);
  }
}
