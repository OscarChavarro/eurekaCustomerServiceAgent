import { Inject, Injectable } from '@nestjs/common';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp = require('sharp');
import { Configuration } from 'src/config/configuration';
import { CONTACTS_BACKEND_PORT, ContactsBackendPort } from 'src/ports/outbound/contacts-backend.port';
import { WHATSAPP_PROFILE_PORT, WhatsappProfilePort } from 'src/ports/outbound/whatsapp-profile.port';

export type ProfileImageResult = {
  bytes: Buffer;
  mimeType: string;
};

export type ProfileImageSize = 'original' | 'small';
export type GetProfileImageUseCaseResult =
  | { status: 'ok'; image: ProfileImageResult }
  | { status: 'invalid_phone' }
  | { status: 'not_found' }
  | { status: 'connection_error' };

export type UpdateAllProfileImagesUseCaseResult = {
  contactsCount: number;
  rawPhoneNumbersCount: number;
  uniquePhoneNumbersCount: number;
  updatedCount: number;
  unchangedCount: number;
  notFoundCount: number;
  connectionErrorCount: number;
  invalidPhoneCount: number;
};

type FetchProfileImageFlowOptions = {
  cachedOnly: boolean;
  forceRefresh: boolean;
};

type FetchProfileImageFlowResult =
  | { status: 'ok'; image: ProfileImageResult; updatedStorage: boolean }
  | { status: 'invalid_phone' }
  | { status: 'not_found' }
  | { status: 'connection_error' };

@Injectable()
export class GetProfileImageUseCase {
  constructor(
    private readonly configuration: Configuration,
    @Inject(CONTACTS_BACKEND_PORT)
    private readonly contactsBackendPort: ContactsBackendPort,
    @Inject(WHATSAPP_PROFILE_PORT)
    private readonly whatsappProfilePort: WhatsappProfilePort
  ) {}

  async execute(
    phoneNumberRaw: string | null | undefined,
    size: ProfileImageSize = 'original',
    cachedOnly = false
  ): Promise<GetProfileImageUseCaseResult> {
    const result = await this.fetchProfileImageFlow(phoneNumberRaw, size, {
      cachedOnly,
      forceRefresh: false
    });

    if (result.status !== 'ok') {
      return result;
    }

    return {
      status: 'ok',
      image: result.image
    };
  }

  async updateAllProfileImages(): Promise<UpdateAllProfileImagesUseCaseResult> {
    const contacts = await this.contactsBackendPort.listContacts();
    const uniquePhones = new Set<string>();
    let rawPhoneNumbersCount = 0;
    let invalidPhoneCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;
    let notFoundCount = 0;
    let connectionErrorCount = 0;

    for (const contact of contacts) {
      for (const rawPhone of contact.phoneNumbers) {
        rawPhoneNumbersCount += 1;
        const normalizedPhone = this.normalizePhoneNumber(rawPhone);
        if (!normalizedPhone) {
          invalidPhoneCount += 1;
          continue;
        }

        uniquePhones.add(normalizedPhone);
      }
    }

    for (const normalizedPhone of uniquePhones) {
      const result = await this.fetchProfileImageFlow(normalizedPhone, 'original', {
        cachedOnly: false,
        forceRefresh: true
      });

      if (result.status === 'ok') {
        if (result.updatedStorage) {
          updatedCount += 1;
        } else {
          unchangedCount += 1;
        }
        continue;
      }

      if (result.status === 'not_found') {
        notFoundCount += 1;
        continue;
      }

      if (result.status === 'connection_error') {
        connectionErrorCount += 1;
        continue;
      }

      invalidPhoneCount += 1;
    }

    return {
      contactsCount: contacts.length,
      rawPhoneNumbersCount,
      uniquePhoneNumbersCount: uniquePhones.size,
      updatedCount,
      unchangedCount,
      notFoundCount,
      connectionErrorCount,
      invalidPhoneCount
    };
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

  private async fetchProfileImageFlow(
    phoneNumberRaw: string | null | undefined,
    size: ProfileImageSize,
    options: FetchProfileImageFlowOptions
  ): Promise<FetchProfileImageFlowResult> {
    const normalizedPhone = this.normalizePhoneNumber(phoneNumberRaw);
    if (!normalizedPhone) {
      return { status: 'invalid_phone' };
    }

    const phoneFolderPath = this.buildPhoneFolderPath(normalizedPhone);

    if (!options.forceRefresh) {
      const cachedImage = await this.readCachedImageForToday(phoneFolderPath, size);
      if (cachedImage) {
        return { status: 'ok', image: cachedImage, updatedStorage: false };
      }

      if (size === 'small') {
        const cachedOriginal = await this.readCachedImageForToday(phoneFolderPath, 'original');
        if (cachedOriginal) {
          const smallFromCached = await this.buildSmallImage(cachedOriginal);
          await this.saveSmallImageForToday(phoneFolderPath, smallFromCached);
          return { status: 'ok', image: smallFromCached, updatedStorage: true };
        }
      }
    }

    if (options.cachedOnly) {
      return { status: 'not_found' };
    }

    const profileImageResult = await this.whatsappProfilePort.fetchProfileImage(normalizedPhone);
    if (profileImageResult.status === 'connection_error') {
      return { status: 'connection_error' };
    }
    if (profileImageResult.status !== 'ok') {
      return { status: 'not_found' };
    }

    const profileImage = profileImageResult.image;
    if (profileImage.bytes.length === 0) {
      return { status: 'not_found' };
    }

    const latestCachedOriginal = await this.readLatestCachedOriginalImage(phoneFolderPath);
    const isNewImage = !latestCachedOriginal || !latestCachedOriginal.bytes.equals(profileImage.bytes);
    const smallImage = await this.buildSmallImage(profileImage);

    if (isNewImage) {
      await this.saveImageForToday(phoneFolderPath, profileImage);
      await this.saveSmallImageForToday(phoneFolderPath, smallImage);
    }

    return {
      status: 'ok',
      image: size === 'small' ? smallImage : profileImage,
      updatedStorage: isNewImage
    };
  }

  private buildPhoneFolderPath(normalizedPhoneNumber: string): string {
    const phoneDigits = normalizedPhoneNumber.slice(1);
    return resolve(process.cwd(), this.configuration.profileImagesBaseFolderPath, phoneDigits);
  }

  private async readCachedImageForToday(
    folderPath: string,
    size: ProfileImageSize
  ): Promise<ProfileImageResult | null> {
    const datePrefix = this.todayFileNamePrefix();
    const candidateNames = await this.listFileNamesInFolder(folderPath);

    const matchingNames = size === 'small'
      ? candidateNames.filter((name) => name === `${datePrefix}_small.jpg`)
      : candidateNames.filter((name) => name.startsWith(`${datePrefix}.`) && !name.includes('_small.'));

    const latest = matchingNames.sort().pop();
    if (!latest) {
      return null;
    }

    return this.readCachedImageByFileName(folderPath, latest);
  }

  private async readLatestCachedOriginalImage(folderPath: string): Promise<ProfileImageResult | null> {
    const candidateNames = await this.listFileNamesInFolder(folderPath);
    const latestOriginal = candidateNames
      .filter((name) => !name.includes('_small.'))
      .sort()
      .pop();

    if (!latestOriginal) {
      return null;
    }

    return this.readCachedImageByFileName(folderPath, latestOriginal);
  }

  private async listFileNamesInFolder(folderPath: string): Promise<string[]> {
    let entries: import('node:fs').Dirent<string>[];
    try {
      entries = await readdir(folderPath, { withFileTypes: true, encoding: 'utf8' });
    } catch {
      return [];
    }

    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  }

  private async readCachedImageByFileName(
    folderPath: string,
    fileName: string
  ): Promise<ProfileImageResult | null> {
    const filePath = join(folderPath, fileName);
    let bytes: Buffer;
    try {
      bytes = await readFile(filePath);
    } catch {
      return null;
    }

    if (bytes.length === 0) {
      return null;
    }

    return {
      bytes,
      mimeType: this.mimeTypeFromFileName(fileName)
    };
  }

  private async saveImageForToday(folderPath: string, image: ProfileImageResult): Promise<void> {
    await mkdir(folderPath, { recursive: true });
    const extension = this.extensionFromMimeType(image.mimeType);
    const fileName = `${this.todayFileNamePrefix()}.${extension}`;
    const filePath = join(folderPath, fileName);
    await writeFile(filePath, image.bytes);
  }

  private async saveSmallImageForToday(folderPath: string, image: ProfileImageResult): Promise<void> {
    await mkdir(folderPath, { recursive: true });
    const fileName = `${this.todayFileNamePrefix()}_small.jpg`;
    const filePath = join(folderPath, fileName);
    await writeFile(filePath, image.bytes);
  }

  private todayFileNamePrefix(): string {
    const now = new Date();
    const year = now.getFullYear();
    const monthNumber = String(now.getMonth() + 1).padStart(2, '0');
    const monthAlpha = this.monthShortEn(now.getMonth());
    const day = String(now.getDate()).padStart(2, '0');

    return `${year}_${monthNumber}${monthAlpha}${day}`;
  }

  private monthShortEn(monthIndex: number): string {
    const names = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    return names[monthIndex] ?? 'mon';
  }

  private extensionFromMimeType(mimeTypeRaw: string): string {
    const mimeType = mimeTypeRaw.toLowerCase().split(';')[0]?.trim() ?? 'image/jpeg';

    if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
      return 'jpg';
    }
    if (mimeType === 'image/png') {
      return 'png';
    }
    if (mimeType === 'image/gif') {
      return 'gif';
    }
    if (mimeType === 'image/webp') {
      return 'webp';
    }
    if (mimeType.startsWith('image/')) {
      return mimeType.slice('image/'.length).replace(/[^\w.+-]/g, '') || 'img';
    }

    return 'img';
  }

  private async buildSmallImage(original: ProfileImageResult): Promise<ProfileImageResult> {
    const resized = await sharp(original.bytes)
      .resize({
        width: 64,
        height: 64,
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 85 })
      .toBuffer();

    return {
      bytes: resized,
      mimeType: 'image/jpeg'
    };
  }

  private mimeTypeFromFileName(fileName: string): string {
    const segments = fileName.split('.');
    const extension = (segments.length > 1 ? segments[segments.length - 1] : '').toLowerCase();
    if (extension === 'jpg' || extension === 'jpeg') {
      return 'image/jpeg';
    }
    if (extension === 'png') {
      return 'image/png';
    }
    if (extension === 'gif') {
      return 'image/gif';
    }
    if (extension === 'webp') {
      return 'image/webp';
    }

    return 'application/octet-stream';
  }
}
