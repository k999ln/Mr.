import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  applicationName: 'Mr. Automation Hub',
  title: 'Mr. — 自動化ツールと仕事のハブ',
  description: '内製・外部ツールを管理し、案件の提案と納品準備を進める共通ワークスペース。',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/favicon.svg', apple: '/favicon.svg' },
  appleWebApp: { capable: true, title: 'Mr.', statusBarStyle: 'black-translucent' },
  openGraph: {
    title: 'Mr. Automation Hub',
    description: '自動化ツール、仕事、成果をひとつのハブで。',
    images: ['/avocadomini-og.png'],
  },
};

export const viewport: Viewport = {
  themeColor: '#161712',
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
