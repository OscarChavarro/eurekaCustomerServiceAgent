export type ContactRecord = {
  resourceName: string;
  names: string[];
  phoneNumbers: string[];
};

export interface ContactsPort {
  listContacts(pageSize: number): Promise<ContactRecord[]>;
}
