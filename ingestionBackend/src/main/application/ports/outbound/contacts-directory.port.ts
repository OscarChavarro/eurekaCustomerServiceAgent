export type ContactDirectoryContact = {
  names: string[];
  phoneNumbers: string[];
};

export interface ContactsDirectoryPort {
  checkHealth(): Promise<void>;
  listContacts(): Promise<ContactDirectoryContact[]>;
}
