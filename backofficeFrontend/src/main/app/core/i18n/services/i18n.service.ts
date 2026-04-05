import { Injectable } from '@angular/core';
import {
  TRANSLATIONS_BY_NAMESPACE,
  type TranslationKey,
  type TranslationNamespace
} from '../translations/translations-by-namespace.const';
import type { SupportedLanguage } from '../types/supported-language.type';

@Injectable({
  providedIn: 'root'
})
export class I18nService {
  get(id: TranslationKey, language: SupportedLanguage): string {
    const [namespaceRaw, keyRaw] = id.split('.', 2);
    const namespace = namespaceRaw as TranslationNamespace;
    const namespaceTranslations = TRANSLATIONS_BY_NAMESPACE[namespace];
    const key = keyRaw as keyof typeof namespaceTranslations;
    const translation = namespaceTranslations[key];

    if (!translation) {
      throw new Error(`[I18nService] Missing translation for key "${id}".`);
    }

    return translation[language];
  }
}
