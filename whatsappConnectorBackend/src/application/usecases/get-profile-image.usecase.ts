import { Inject, Injectable } from '@nestjs/common';
import jpeg from 'jpeg-js';
import { WHATSAPP_PROFILE_PORT, WhatsappProfilePort } from 'src/ports/outbound/whatsapp-profile.port';

export type ProfileImageResult = {
  bytes: Buffer;
  mimeType: string;
};

@Injectable()
export class GetProfileImageUseCase {
  constructor(
    @Inject(WHATSAPP_PROFILE_PORT)
    private readonly whatsappProfilePort: WhatsappProfilePort
  ) {}

  async execute(phoneNumberRaw: string | null | undefined): Promise<ProfileImageResult> {
    try {
      const normalizedPhone = this.normalizePhoneNumber(phoneNumberRaw);
      if (!normalizedPhone) {
        return this.buildFallbackImage();
      }

      const profileImage = await this.whatsappProfilePort.fetchProfileImage(normalizedPhone);
      if (!profileImage || profileImage.bytes.length === 0) {
        return this.buildFallbackImage();
      }

      return profileImage;
    } catch {
      return this.buildFallbackImage();
    }
  }

  private normalizePhoneNumber(raw: string | null | undefined): string | null {
    if (typeof raw !== 'string') {
      return null;
    }

    const digits = raw.replace(/\D+/g, '');
    if (digits.length === 0) {
      return null;
    }

    return `+${digits}`;
  }

  private buildFallbackImage(): ProfileImageResult {
    const width = 64;
    const height = 64;
    const rgba = Buffer.alloc(width * height * 4);

    for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
      const offset = pixelIndex * 4;
      rgba[offset] = 0xff;
      rgba[offset + 1] = 0x80;
      rgba[offset + 2] = 0x80;
      rgba[offset + 3] = 0xff;
    }

    const encoded = jpeg.encode({ data: rgba, width, height }, 90);

    return {
      bytes: encoded.data,
      mimeType: 'image/jpeg'
    };
  }
}
