export class NameNormalizer {
  removeWhatsAppPrefix(value: string): string {
    return value.replace(/^WhatsApp\s-\s/i, '').trim();
  }

  removeExtension(fileName: string): string {
    const index: number = fileName.lastIndexOf('.');
    return index >= 0 ? fileName.slice(0, index) : fileName;
  }

  normalizeForMatch(value: string): string {
    const withoutPrefix: string = this.removeWhatsAppPrefix(value);
    const decomposed: string = withoutPrefix.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const replaced: string = decomposed.replace(/[^A-Za-z0-9]+/g, '_');
    return replaced.replace(/_+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
  }

  buildCsvTargetFileName(phoneNumber: string): string {
    return `${phoneNumber}.csv`;
  }

  buildMediaTargetFolderName(phoneNumber: string): string {
    return phoneNumber;
  }

  buildMediaTargetFileName(fileName: string, conversationName: string): string {
    const extensionIndex: number = fileName.lastIndexOf('.');
    const extension: string = extensionIndex >= 0 ? fileName.slice(extensionIndex) : '';
    const baseName: string = extensionIndex >= 0 ? fileName.slice(0, extensionIndex) : fileName;

    const rawConversation: string = this.removeWhatsAppPrefix(conversationName);
    const escapedConversation: string = this.escapeRegExp(rawConversation);

    const pattern: RegExp = new RegExp(`^(.+?)\\s-\\s${escapedConversation}\\s-\\s(.+)$`, 'i');
    const match: RegExpExecArray | null = pattern.exec(baseName);

    if (match !== null) {
      return `${match[1]} - ${match[2]}${extension}`;
    }

    return `${this.removeWhatsAppPrefix(baseName)}${extension}`;
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
