import type { TranslationValue } from '../types/translation-value.type';

export const SHELL_TRANSLATIONS = {
  LANGUAGE_SELECTOR_ARIA: {
    en: 'Language selector',
    es: 'Selector de idioma'
  },
  MAIN_MENU_ARIA: {
    en: 'Main menu',
    es: 'Menu principal'
  },
  CONVERSATION_LIST_ARIA: {
    en: 'Conversation list',
    es: 'Lista de conversaciones'
  },
  NEW_CONVERSATION_ARIA: {
    en: 'New conversation',
    es: 'Nueva conversacion'
  },
  SEARCH_CONVERSATION_ARIA: {
    en: 'Search conversation',
    es: 'Buscar conversacion'
  },
  CONVERSATION_MESSAGES_ARIA: {
    en: 'Conversation messages',
    es: 'Mensajes de la conversacion'
  },
  REACTIONS_ARIA: {
    en: 'Reactions',
    es: 'Reacciones'
  },
  OPEN_REACTIONS_MENU_ARIA: {
    en: 'Open reactions menu',
    es: 'Abrir menu de reacciones'
  },
  ATTACH_FILE_ARIA: {
    en: 'Attach file',
    es: 'Adjuntar archivo'
  },
  SEND_MESSAGE_ARIA: {
    en: 'Send message',
    es: 'Enviar mensaje'
  },
  WRITE_MESSAGE_ARIA: {
    en: 'Type a message',
    es: 'Escribe un mensaje'
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
