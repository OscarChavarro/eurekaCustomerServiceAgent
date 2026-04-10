import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  ContactsApiService,
  type BackendContact
} from '../api/services/contacts-api.service';

@Injectable({ providedIn: 'root' })
export class ContactsDirectoryStore {
  private readonly contactsApiService = inject(ContactsApiService);
  private readonly contactsState = signal<BackendContact[]>([]);
  private readonly loadingState = signal<boolean>(false);
  private readonly loadedState = signal<boolean>(false);
  private readonly errorState = signal<boolean>(false);
  private inFlightLoadPromise: Promise<void> | null = null;

  public readonly contacts = this.contactsState.asReadonly();
  public readonly isLoading = this.loadingState.asReadonly();
  public readonly isLoaded = this.loadedState.asReadonly();
  public readonly hasError = this.errorState.asReadonly();
  public readonly count = computed(() => this.contactsState().length);

  public async ensureLoaded(): Promise<void> {
    if (this.loadedState()) {
      return;
    }

    if (this.inFlightLoadPromise) {
      await this.inFlightLoadPromise;
      return;
    }

    this.loadingState.set(true);
    this.errorState.set(false);

    const request = firstValueFrom(this.contactsApiService.getContacts(1000))
      .then((response) => {
        const contacts = Array.isArray(response.contacts) ? response.contacts : [];
        this.contactsState.set(contacts);
        this.loadedState.set(true);
        this.errorState.set(false);
      })
      .catch((error: unknown) => {
        this.contactsState.set([]);
        this.loadedState.set(false);
        this.errorState.set(true);
        console.error('Unable to preload contacts directory from backend /contacts', error);
      })
      .finally(() => {
        this.loadingState.set(false);
        this.inFlightLoadPromise = null;
      });

    this.inFlightLoadPromise = request;
    await request;
  }
}
