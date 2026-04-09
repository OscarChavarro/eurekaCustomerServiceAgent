export type GoogleContact = {
  resourceName: string;
  etag?: string;
  displayName: string;
  phoneNumbers: string[];
};

export type ListGoogleContactsResult = {
  contacts: GoogleContact[];
  nextPageToken?: string;
};

export type CreateGoogleContactCommand = {
  displayName: string;
  phoneNumber: string;
};

export type UpdateGoogleContactCommand = {
  resourceName: string;
  etag: string;
  displayName: string;
  phoneNumber: string;
};

export interface GooglePeoplePort {
  listContacts(accessToken: string, pageSize: number, pageToken?: string): Promise<ListGoogleContactsResult>;
  createContact(accessToken: string, command: CreateGoogleContactCommand): Promise<GoogleContact>;
  updateContact(accessToken: string, command: UpdateGoogleContactCommand): Promise<GoogleContact>;
}
