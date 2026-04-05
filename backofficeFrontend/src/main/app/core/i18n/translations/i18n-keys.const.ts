import type { TranslationValue } from '../types/translation-value.type';
import {
  TRANSLATIONS_BY_NAMESPACE,
  type TranslationNamespace
} from './translations-by-namespace.const';

type NamespaceKeyMap<N extends TranslationNamespace, T extends Record<string, TranslationValue>> = {
  [K in keyof T]: `${N}.${Extract<K, string>}`;
};

function createNamespaceKeys<
  N extends TranslationNamespace,
  T extends Record<string, TranslationValue>
>(namespace: N, translations: T): NamespaceKeyMap<N, T> {
  const entries = Object.keys(translations).map((key) => [key, `${namespace}.${key}`]);
  return Object.fromEntries(entries) as NamespaceKeyMap<N, T>;
}

export const I18N_KEYS = {
  shell: createNamespaceKeys('shell', TRANSLATIONS_BY_NAMESPACE.shell)
} as const;
