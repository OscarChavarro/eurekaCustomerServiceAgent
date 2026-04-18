export type ContactEntry = {
  names: string[];
  phoneNumbers: string[];
};

export interface ContactsBackendPort {
  assertHealth(): Promise<void>;
  listContacts(): Promise<ContactEntry[]>;
}

export const CONTACTS_BACKEND_PORT = Symbol('CONTACTS_BACKEND_PORT');
