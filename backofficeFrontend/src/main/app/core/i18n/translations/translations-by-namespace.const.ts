import { SHELL_TRANSLATIONS } from './shell.translations';

export const TRANSLATIONS_BY_NAMESPACE = {
  shell: SHELL_TRANSLATIONS
} as const;

export type TranslationNamespace = keyof typeof TRANSLATIONS_BY_NAMESPACE;
type NamespaceTranslations<N extends TranslationNamespace> = (typeof TRANSLATIONS_BY_NAMESPACE)[N];
type NamespaceTranslationKey<N extends TranslationNamespace> = Extract<
  keyof NamespaceTranslations<N>,
  string
>;

export type TranslationKey = {
  [N in TranslationNamespace]: `${N}.${NamespaceTranslationKey<N>}`;
}[TranslationNamespace];
