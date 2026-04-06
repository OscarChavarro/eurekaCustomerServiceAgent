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
  MODE_SWITCH_ARIA: {
    en: 'Toggle mode',
    es: 'Cambiar modo'
  },
  FULL_SCREEN_ARIA: {
    en: 'Toggle full screen',
    es: 'Alternar pantalla completa'
  },
  TOGGLE_TIME_CHAT_ARIA: {
    en: 'Toggle time chat panel',
    es: 'Alternar panel de chat en modo tiempo'
  },
  OPEN_TIME_RANGE_SELECTOR_ARIA: {
    en: 'Open time range selector',
    es: 'Abrir selector de rango de tiempo'
  },
  MODE_CHAT_TAB_ARIA: {
    en: 'modo chat',
    es: 'modo chat'
  },
  MODE_TIME_TAB_ARIA: {
    en: 'modo time',
    es: 'modo time'
  },
  CHAT_MODE_LABEL: {
    en: 'chat mode',
    es: 'modo chat'
  },
  TIME_MODE_LABEL: {
    en: 'time mode',
    es: 'modo time'
  },
  CONVERSATION_LIST_ARIA: {
    en: 'Conversation list',
    es: 'Lista de conversaciones'
  },
  TIME_PANEL_ARIA: {
    en: 'Time panel',
    es: 'Panel de tiempo'
  },
  TIME_SPLITTER_ARIA: {
    en: 'Resize time panel',
    es: 'Redimensionar panel de tiempo'
  },
  TIME_PANEL_LOADING: {
    en: 'Loading timeline...',
    es: 'Cargando linea de tiempo...'
  },
  TIME_PANEL_ERROR: {
    en: 'Unable to load timeline.',
    es: 'No se pudo cargar la linea de tiempo.'
  },
  TIME_PANEL_DATE_LOCALE: {
    en: 'en-US',
    es: 'es-ES'
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
  OPEN_CONVERSATION_ACTIONS_ARIA: {
    en: 'Open conversation actions',
    es: 'Abrir acciones de la conversacion'
  },
  DELETE_CONVERSATION_ARIA: {
    en: 'Delete conversation',
    es: 'Eliminar conversacion'
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
  CONVERSATION_SYNCED_PLACEHOLDER: {
    en: 'Conversation synced from backend.',
    es: 'Conversacion sincronizada desde backend.'
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
    es: 'Crudo'
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
