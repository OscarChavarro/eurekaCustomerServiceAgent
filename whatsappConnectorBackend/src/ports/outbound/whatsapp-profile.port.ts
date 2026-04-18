export type BinaryImage = {
  bytes: Buffer;
  mimeType: string;
};

export type FetchProfileImageResult =
  | { status: 'ok'; image: BinaryImage }
  | { status: 'not_found' }
  | { status: 'connection_error' };

export interface WhatsappProfilePort {
  fetchProfileImage(phoneNumberWithCountryCode: string): Promise<FetchProfileImageResult>;
}

export const WHATSAPP_PROFILE_PORT = Symbol('WHATSAPP_PROFILE_PORT');
