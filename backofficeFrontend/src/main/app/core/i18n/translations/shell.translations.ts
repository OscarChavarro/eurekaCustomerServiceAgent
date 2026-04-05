import type { TranslationValue } from '../types/translation-value.type';

export const SHELL_TRANSLATIONS = {
  LANGUAGE_SELECTOR_ARIA: {
    en: 'Language selector',
    es: 'Selector de idioma'
  },
  LANGUAGE_EN: {
    en: 'English',
    es: 'Ingles'
  },
  LANGUAGE_ES: {
    en: 'Spanish',
    es: 'Espanol'
  },
  CONVERSATIONS_TITLE: {
    en: 'Conversations',
    es: 'Conversaciones'
  },
  SIMULATION_CONVERSATION_NAME: {
    en: 'Simulation',
    es: 'Simulación'
  },
  ONLINE_STATUS: {
    en: 'Online',
    es: 'En linea'
  },
  SEARCH_OR_NEW_CHAT_PLACEHOLDER: {
    en: 'Search or start a new chat',
    es: 'Buscar o iniciar un nuevo chat'
  },
  WRITE_MESSAGE_PLACEHOLDER: {
    en: 'Type a message',
    es: 'Escribe un mensaje'
  },
  AI_LABEL: {
    en: 'AI',
    es: 'IA'
  },
  TYPING_LABEL: {
    en: 'writting',
    es: 'escribiendo'
  },
  STAGE_RAW: {
    en: 'Raw',
    es: 'Bruto'
  },
  STAGE_CLEAN: {
    en: 'Clean',
    es: 'Limpio'
  },
  STAGE_STRUCTURE: {
    en: 'Structure',
    es: 'Estructura'
  },
  STAGE_CHUNK: {
    en: 'Chunk',
    es: 'Bloque'
  },
  STAGE_EMBED: {
    en: 'Embed',
    es: 'Encaje'
  }
} as const satisfies Record<string, TranslationValue>;
