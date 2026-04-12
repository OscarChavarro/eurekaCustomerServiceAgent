export type GoogleContact = {
  resourceName: string;
  etag?: string;
  displayName: string;
  names: string[];
  emailAddresses: string[];
  phoneNumbers: string[];
  biographies: string[];
};

export type ListGoogleContactsResult = {
  contacts: GoogleContact[];
  nextPageToken?: string;
};

export type CreateGoogleContactCommand = {
  names?: string[];
  emailAddresses?: string[];
  phoneNumbers?: string[];
  biographies?: string[];
};

export type PatchGoogleContactCommand = {
  resourceName: string;
  names?: string[];
  emailAddresses?: string[];
  phoneNumbers?: string[];
  biographies?: string[];
};

export type DeleteGoogleContactCommand = {
  resourceName: string;
};

export interface GooglePeoplePort {
  listContacts(accessToken: string, pageSize: number, pageToken?: string): Promise<ListGoogleContactsResult>;
  createContact(accessToken: string, command: CreateGoogleContactCommand): Promise<GoogleContact>;
  patchContact(accessToken: string, command: PatchGoogleContactCommand): Promise<GoogleContact>;
  deleteContact(accessToken: string, command: DeleteGoogleContactCommand): Promise<void>;
}
