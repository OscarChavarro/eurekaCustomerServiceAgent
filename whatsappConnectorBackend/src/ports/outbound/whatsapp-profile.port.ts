export type BinaryImage = {
  bytes: Buffer;
  mimeType: string;
};

export interface WhatsappProfilePort {
  fetchProfileImage(phoneNumberWithCountryCode: string): Promise<BinaryImage | null>;
}

export const WHATSAPP_PROFILE_PORT = Symbol('WHATSAPP_PROFILE_PORT');
