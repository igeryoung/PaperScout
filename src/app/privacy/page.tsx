import 'server-only';

import { getLocale } from '@/lib/locale';
import { PlaceholderPage } from '@/components/placeholder-page';

export default async function PrivacyPage() {
  const locale = await getLocale();
  return <PlaceholderPage locale={locale} page="privacy" />;
}
