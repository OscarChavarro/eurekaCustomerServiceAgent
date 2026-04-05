import { Injectable, signal } from '@angular/core';

import type { SupportedLanguage } from '../types/supported-language.type';

@Injectable({
  providedIn: 'root'
})
export class I18nStateService {
  private readonly selectedLanguageState = signal<SupportedLanguage>('es');

  readonly selectedLanguage = this.selectedLanguageState.asReadonly();

  setLanguage(language: SupportedLanguage): void {
    this.selectedLanguageState.set(language);
  }
}
