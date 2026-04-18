import { TestBed } from '@angular/core/testing';
import { signal, type WritableSignal } from '@angular/core';

import {
  ContactsApiService,
  type BackendContact
} from '../../../../main/app/core/api/services/contacts-api.service';
import { ContactsDirectoryStore } from '../../../../main/app/core/state/contacts-directory.store';
import {
  ContactNameRecomendationService,
  type BlueActionContactRow,
  type ContactsWorkbookTab
} from '../../../../main/app/shell/services/contact-name-recomendation.service';
import { RecommendedNesContactNameService } from '../../../../main/app/shell/services/recommended-nes-contact-name.service';

describe('ContactNameRecomendationService', () => {
  let service: ContactNameRecomendationService;
  let contactsState: WritableSignal<BackendContact[]>;
  let recommendedServiceMock: {
    buildRecommendedName: jest.Mock;
  };

  const targetTab: ContactsWorkbookTab = 'conversationsWithoutContacts';
  const row: BlueActionContactRow = {
    id: 'conversation-only|1',
    contactName: null,
    phoneNumbers: ['+573173828895'],
    resourceName: undefined,
    chatConversationId: '573173828895'
  };

  beforeEach(() => {
    contactsState = signal<BackendContact[]>([]);
    recommendedServiceMock = {
      buildRecommendedName: jest.fn(async () => 'Prospecto Argentina 2022_06jun29')
    };

    TestBed.configureTestingModule({
      providers: [
        ContactNameRecomendationService,
        {
          provide: ContactsApiService,
          useValue: {
            createContact: jest.fn(),
            patchContact: jest.fn()
          }
        },
        {
          provide: ContactsDirectoryStore,
          useValue: {
            contacts: contactsState
          }
        },
        {
          provide: RecommendedNesContactNameService,
          useValue: recommendedServiceMock
        }
      ]
    });

    service = TestBed.inject(ContactNameRecomendationService);
  });

  it('keeps the base recommended name when no duplicate exists', async () => {
    await service.preload(targetTab, row, null);

    expect(service.tooltipValue(targetTab, row)).toBe('Prospecto Argentina 2022_06jun29');
  });

  it('uses suffix B when base recommended name already exists', async () => {
    contactsState.set([
      buildContact('Prospecto Argentina 2022_06jun29')
    ]);

    await service.preload(targetTab, row, null);

    expect(service.tooltipValue(targetTab, row)).toBe('Prospecto Argentina 2022_06jun29 B');
  });

  it('uses suffix AA after exhausting B..Z', async () => {
    const baseName = 'Prospecto Argentina 2022_06jun29';
    const occupiedNames = [baseName, ...buildSuffixesFromBToZ(baseName)];
    contactsState.set(occupiedNames.map((name) => buildContact(name)));

    await service.preload(targetTab, row, null);

    expect(service.tooltipValue(targetTab, row)).toBe('Prospecto Argentina 2022_06jun29 AA');
  });

  it('uses next suffix even when base name is free if suffixed variants already exist', async () => {
    const baseName = 'Prospecto Argentina 2022_06jun29';
    contactsState.set([buildContact(`${baseName} A`), buildContact(`${baseName} B`)]);

    await service.preload(targetTab, row, null);

    expect(service.tooltipValue(targetTab, row)).toBe('Prospecto Argentina 2022_06jun29 C');
  });
});

function buildContact(name: string): BackendContact {
  return {
    resourceName: `contacts/${name}`,
    names: [name],
    phoneNumbers: []
  };
}

function buildSuffixesFromBToZ(baseName: string): string[] {
  const suffixes: string[] = [];

  for (let code = 66; code <= 90; code += 1) {
    suffixes.push(`${baseName} ${String.fromCharCode(code)}`);
  }

  return suffixes;
}
