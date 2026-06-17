import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Suspense } from 'react';
import './globals.css';
import { AppHeader, AppHeaderPlaceholder } from '@/components/app-header';
import { AppFooter } from '@/components/app-footer';
import { getLocale } from '@/lib/locale';
import { getMessages } from '@/i18n';
import { env } from '@/lib/env';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getMessages(locale);
  // OG/Twitter image tags emitted by app/opengraph-image.tsx need an absolute
  // base URL to resolve against; APP_BASE_URL in prod, localhost in dev.
  const baseUrl = env.APP_BASE_URL ?? 'http://localhost:3000';
  return {
    metadataBase: new URL(baseUrl),
    title: t.metadata.title,
    description: t.metadata.description,
    openGraph: {
      type: 'website',
      siteName: t.metadata.title,
      title: t.metadata.title,
      description: t.metadata.description,
      locale,
    },
    twitter: {
      card: 'summary_large_image',
      title: t.metadata.title,
      description: t.metadata.description,
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Suspense fallback={<AppHeaderPlaceholder locale={locale} />}>
          <AppHeader locale={locale} />
        </Suspense>
        <div className="flex-1">{children}</div>
        <AppFooter locale={locale} />
      </body>
    </html>
  );
}
