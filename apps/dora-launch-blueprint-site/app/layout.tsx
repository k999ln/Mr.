import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'avocadomini 立ち上げ設計書',
  description: '10個のBOTをひとつの指令で動かすavocadominiの立ち上げ設計、課金構造、公開条件。',
  openGraph: {
    title: 'avocadomini 立ち上げ設計書',
    description: '10 TOOLS / ONE COMMAND — 人間は、やりたいことを。AIは、残り全部を。',
    images: [{ url: '/og.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'avocadomini 立ち上げ設計書',
    description: '10 TOOLS / ONE COMMAND',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
