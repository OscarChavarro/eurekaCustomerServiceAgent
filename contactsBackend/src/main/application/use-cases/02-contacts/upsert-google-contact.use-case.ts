import { Injectable } from '@nestjs/common';

export type UpsertGoogleContactCommand = {
  currentName?: string;
  currentPhoneNumber?: string;
  newName: string;
  newPhoneNumber: string;
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
  public async execute(command: UpsertGoogleContactCommand): Promise<UpsertGoogleContactResult> {
    const hasCurrentName = (command.currentName ?? '').trim().length > 0;
    const hasCurrentPhoneNumber = (command.currentPhoneNumber ?? '').trim().length > 0;
    const action: UpsertGoogleContactResult['action'] =
      hasCurrentName || hasCurrentPhoneNumber ? 'updated' : 'created';

    console.log('[contacts/upsert] Simulated upsert request (Google People API disabled)', {
      action,
      currentName: command.currentName ?? '',
      currentPhoneNumber: command.currentPhoneNumber ?? '',
      newName: command.newName,
      newPhoneNumber: command.newPhoneNumber
    });

    return {
      action,
      contact: {
        name: command.newName,
        phoneNumbers: command.newPhoneNumber ? [command.newPhoneNumber] : []
      }
    };
  }
}
