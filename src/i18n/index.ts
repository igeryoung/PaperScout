import type { Locale } from '@/lib/locale';
import { messages as enMessages, type Messages } from './en';
import { messages as zhTwMessages } from './zh-TW';

const CATALOGS: Record<Locale, Messages> = {
  en: enMessages,
  'zh-TW': zhTwMessages,
};

export function getMessages(locale: Locale): Messages {
  return CATALOGS[locale];
}

export type { Messages } from './en';
