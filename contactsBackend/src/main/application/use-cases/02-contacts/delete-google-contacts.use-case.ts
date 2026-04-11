import { Injectable } from '@nestjs/common';

export type DeleteGoogleContactsCommand = {
  contactsToDelete: Array<{
    nameToDelete?: string;
    phoneToDelete?: string;
  }>;
};

export type DeleteGoogleContactsResult = {
  action: 'deleted';
  mode: 'simulated';
  requestedCount: number;
  contacts: Array<{
    nameToDelete: string;
    phoneToDelete: string;
  }>;
};

@Injectable()
export class DeleteGoogleContactsUseCase {
  public async execute(command: DeleteGoogleContactsCommand): Promise<DeleteGoogleContactsResult> {
    const contacts = command.contactsToDelete.map((contact) => ({
      nameToDelete: contact.nameToDelete ?? '',
      phoneToDelete: contact.phoneToDelete ?? ''
    }));

    console.log('[contacts/delete] Simulated delete request (Google People API disabled)', {
      requestedCount: contacts.length,
      contacts
    });

    return {
      action: 'deleted',
      mode: 'simulated',
      requestedCount: contacts.length,
      contacts
    };
  }
}
