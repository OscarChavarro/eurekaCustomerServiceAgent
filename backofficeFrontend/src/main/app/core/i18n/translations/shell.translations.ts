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
  MODE_CONTACTS_TAB_ARIA: {
    en: 'contacts mode',
    es: 'modo contactos'
  },
  CHAT_MODE_LABEL: {
    en: 'chat mode',
    es: 'modo chat'
  },
  TIME_MODE_LABEL: {
    en: 'time mode',
    es: 'modo time'
  },
  CONTACTS_MODE_LABEL: {
    en: 'contacts mode',
    es: 'modo contactos'
  },
  CONVERSATION_LIST_ARIA: {
    en: 'Conversation list',
    es: 'Lista de conversaciones'
  },
  CONTACTS_PANEL_ARIA: {
    en: 'Contacts panel',
    es: 'Panel de contactos'
  },
  CONTACTS_TABLE_TITLE: {
    en: 'Contacts',
    es: 'Contactos'
  },
  CONTACTS_TABLE_CONTACT_NAME_HEADER: {
    en: 'Contact name',
    es: 'Nombre de contacto'
  },
  CONTACTS_TABLE_PHONE_NUMBERS_HEADER: {
    en: 'Phone numbers',
    es: 'Numeros de telefono'
  },
  CONTACTS_TABLE_COUNTRY_HEADER: {
    en: 'Country',
    es: 'Pais'
  },
  CONTACTS_WORKBOOK_TABS_ARIA: {
    en: 'Contacts workbook tabs',
    es: 'Pestanas de libro de contactos'
  },
  CONTACTS_WORKBOOK_CONTACTS_WITH_CONVERSATIONS: {
    en: 'Contacts with conversations',
    es: 'Contactos con conversaciones'
  },
  CONTACTS_WORKBOOK_PROSPECTS: {
    en: 'Prospects',
    es: 'Prospectos'
  },
  CONTACTS_WORKBOOK_CONVERSATIONS_WITHOUT_CONTACTS: {
    en: 'Conversations with no contacts',
    es: 'Conversaciones sin contactos'
  },
  CONTACTS_WORKBOOK_CONTACTS_WITHOUT_CONVERSATIONS: {
    en: 'Contacts without conversations',
    es: 'Contactos sin conversaciones'
  },
  CONTACTS_TABLE_LOADING: {
    en: 'Loading contacts...',
    es: 'Cargando contactos...'
  },
  CONTACTS_TABLE_ERROR: {
    en: 'Unable to load contacts.',
    es: 'No se pudieron cargar los contactos.'
  },
  CONTACTS_TABLE_EMPTY: {
    en: 'No contacts available.',
    es: 'No hay contactos disponibles.'
  },
  CONTACTS_TABLE_UNKNOWN_NAME: {
    en: '(No name)',
    es: '(Sin nombre)'
  },
  CONTACTS_NAME_TOOLTIP_NON_COMPLIANT: {
    en: 'Check cell data format',
    es: 'Revisa el formato de datos de la celda'
  },
  CONTACTS_NAME_TOOLTIP_REPEATED: {
    en: 'Warning: repeated!',
    es: 'Advertencia: repetido!'
  },
  CONTACTS_BLUE_ACTION_INVALID_PHONE_FORMAT: {
    en: 'Can not add, check phone number format',
    es: 'No se puede agregar, revisa el formato del telefono'
  },
  CONTACTS_SORT_ASC: {
    en: 'Sort ascending',
    es: 'Orden ascendente'
  },
  CONTACTS_SORT_DESC: {
    en: 'Sort descending',
    es: 'Orden descendente'
  },
  CONTACTS_SORT_DISABLED: {
    en: 'Disable sorting',
    es: 'Desactivar orden'
  },
  CONTACTS_DELETE_ENTRY_ARIA: {
    en: 'Delete contact entry',
    es: 'Eliminar entrada de contacto'
  },
  CONTACTS_DELETE_MODAL_TITLE: {
    en: 'Delete contact entry',
    es: 'Eliminar entrada de contacto'
  },
  CONTACTS_DELETE_MODAL_MESSAGE: {
    en: 'Are you sure you want to delete this entry?',
    es: 'Estas seguro de querer eliminar esta entrada?'
  },
  CONTACTS_DELETE_MODAL_CONFIRM: {
    en: 'Delete',
    es: 'Borrar'
  },
  CONTACTS_DELETE_MODAL_CANCEL: {
    en: 'Cancel',
    es: 'Cancelar'
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
  OPEN_CONVERSATION_CONTACT_ARIA: {
    en: 'Open contact in contacts view',
    es: 'Abrir contacto en la vista de contactos'
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
    en: 'Loading conversation messages...',
    es: 'Cargando mensajes de la conversación...'
  },
  AI_LABEL: {
    en: 'AI',
    es: 'IA'
  },
  AUDIO_AI_TRANSCRIPTION: {
    en: 'AI transcription:',
    es: 'Transcripción IA:'
  },
  AUDIO_RESOURCE_URL_FAILED: {
    en: 'Resource URL failed',
    es: 'URL de recurso fallida'
  },
  AUDIO_TOOLTIP_COPIED: {
    en: 'Copied',
    es: 'Copiado'
  },
  AUDIO_COPY_ENCODED_URL_ARIA: {
    en: 'Copy encoded URL',
    es: 'Copiar URL codificada'
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
  STAGE_NORMALIZE: {
    en: 'Normalize',
    es: 'Normalizar'
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
  },
  EMBED_SELECT_BLOCK_HINT: {
    en: 'Select one of the blocks on the left and the N nearest messages will appear here.',
    es: 'Selecciona alguno de los bloques a la izquierda y acá aparecerán los N mensajes más cercanos.'
  }
} as const satisfies Record<string, TranslationValue>;
