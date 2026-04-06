export type TimeRangeSelectorLanguage = 'es' | 'en';

export type TimeRangeSelectorText = {
  title: string;
  fromLabel: string;
  toLabel: string;
  cancelLabel: string;
  applyLabel: string;
  presetsTitle: string;
  previousMonthAria: string;
  nextMonthAria: string;
  monthLabel: string;
  yearLabel: string;
  presets: {
    lastMinute: string;
    lastHour: string;
    lastDay: string;
    lastWeek: string;
    lastMonth: string;
    last3Months: string;
    lastYear: string;
  };
  weekdaysShort: string[];
};

const TEXTS: Record<TimeRangeSelectorLanguage, TimeRangeSelectorText> = {
  en: {
    title: 'Select time range',
    fromLabel: 'From',
    toLabel: 'To',
    cancelLabel: 'Cancel',
    applyLabel: 'Apply time range',
    presetsTitle: 'Relative time ranges',
    previousMonthAria: 'Previous month',
    nextMonthAria: 'Next month',
    monthLabel: 'Month',
    yearLabel: 'Year',
    presets: {
      lastMinute: 'Last minute',
      lastHour: 'Last hour',
      lastDay: 'Last day',
      lastWeek: 'Last week',
      lastMonth: 'Last month',
      last3Months: 'Last 3 months',
      lastYear: 'Last year'
    },
    weekdaysShort: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  },
  es: {
    title: 'Seleccionar rango de tiempo',
    fromLabel: 'Desde',
    toLabel: 'Hasta',
    cancelLabel: 'Cancelar',
    applyLabel: 'Aplicar rango de tiempo',
    presetsTitle: 'Rangos de tiempo relativos',
    previousMonthAria: 'Mes anterior',
    nextMonthAria: 'Mes siguiente',
    monthLabel: 'Mes',
    yearLabel: 'Año',
    presets: {
      lastMinute: 'Último minuto',
      lastHour: 'Última hora',
      lastDay: 'Último día',
      lastWeek: 'Última semana',
      lastMonth: 'Último mes',
      last3Months: 'Últimos 3 meses',
      lastYear: 'Último año'
    },
    weekdaysShort: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
  }
};

export function getTimeRangeSelectorText(language: string | null | undefined): TimeRangeSelectorText {
  return language === 'es' ? TEXTS.es : TEXTS.en;
}
