import { Injectable, inject } from '@angular/core';

import {
  PhonePrefixCacheService,
  type PhonePrefixAreaCacheEntry
} from '../../core/api/services/phone-prefix-cache.service';
import { FrontendSecretsService } from '../../core/api/services/frontend-secrets.service';
import { PhoneCountryI18nService } from '../../core/i18n/services/phone-country-i18n.service';
import {
  canonicalizePhoneNumber,
  normalizeConversationSourceId
} from '../../core/phone/phone-normalization.utils';

export type RecommendedNameConversationInput = {
  phoneNumbers: string[];
  chatConversationId: string | null;
  firstMessageDate?: string | null;
};

@Injectable({ providedIn: 'root' })
export class RecommendedNesContactNameService {
  private readonly phonePrefixCacheService = inject(PhonePrefixCacheService);
  private readonly phoneCountryI18nService = inject(PhoneCountryI18nService);
  private readonly frontendSecretsService = inject(FrontendSecretsService);

  public async buildRecommendedName(conversation: RecommendedNameConversationInput): Promise<string> {
    const phone = this.resolvePhone(conversation);
    const countryName = await this.resolveCountryNameInSpanish(phone);
    const referenceDate = this.resolveReferenceDate(conversation.firstMessageDate);
    const formattedDate = this.buildFormattedDate(referenceDate);
    const prospectPreffix = this.frontendSecretsService.contactsProspectPreffix;

    return `${prospectPreffix}${countryName} ${formattedDate}`;
  }

  private resolvePhone(conversation: RecommendedNameConversationInput): string | null {
    const firstPhone = conversation.phoneNumbers.find(
      (phone) => typeof phone === 'string' && phone.trim().length > 0
    );
    if (firstPhone) {
      return firstPhone.trim();
    }

    const conversationId = conversation.chatConversationId?.trim() ?? '';
    if (!conversationId) {
      return null;
    }

    const normalizedConversationId = normalizeConversationSourceId(conversationId);
    const canonicalConversationPhone = canonicalizePhoneNumber(normalizedConversationId);

    return canonicalConversationPhone?.normalizedValue ?? null;
  }

  private async resolveCountryNameInSpanish(phone: string | null): Promise<string> {
    if (!phone) {
      return 'Desconocido';
    }

    const areaInfo = await this.phonePrefixCacheService.resolveAreaInfo(phone);
    if (!areaInfo?.countryCode) {
      return 'Desconocido';
    }

    const countryName = this.phoneCountryI18nService.getCountryName(areaInfo.countryCode, 'es');
    if (!countryName) {
      return 'Desconocido';
    }

    if (countryName === 'Estados Unidos') {
      return this.formatUsaStateLabel(areaInfo);
    }

    return countryName;
  }

  private formatUsaStateLabel(areaInfo: PhonePrefixAreaCacheEntry): string {
    const stateName = (areaInfo.subzoneName ?? areaInfo.subzone ?? '').trim();
    if (!stateName) {
      return 'USA';
    }

    return `USA (${stateName})`;
  }

  private buildFormattedDate(date: Date): string {
    const year = date.getFullYear();
    const monthNumber = String(date.getMonth() + 1).padStart(2, '0');
    const dayOfMonth = String(date.getDate()).padStart(2, '0');
    const monthAlpha = this.monthAlphaByIndex(date.getMonth());

    return `${year}_${monthNumber}${monthAlpha}${dayOfMonth}`;
  }

  private resolveReferenceDate(firstMessageDate: string | null | undefined): Date {
    if (typeof firstMessageDate === 'string' && firstMessageDate.trim().length > 0) {
      const parsedDate = new Date(firstMessageDate);
      if (!Number.isNaN(parsedDate.getTime())) {
        return parsedDate;
      }
    }

    return new Date();
  }

  private monthAlphaByIndex(index: number): string {
    const monthNames: string[] = [
      'ene',
      'feb',
      'mar',
      'abr',
      'may',
      'jun',
      'jul',
      'ago',
      'sep',
      'oct',
      'nov',
      'dic'
    ];

    return monthNames[index] ?? 'mes';
  }
}
