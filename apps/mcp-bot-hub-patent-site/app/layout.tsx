import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://mcp-bot-hub-patent.kirin-999.chatgpt.site'),
  title: 'MCP BOTハブ 特許戦略メモ',
  description:
    '複数BOTの外部効果検証、寄与記録、成果連動精算を一体化するシステムの特許戦略メモ。',
  openGraph: {
    title: 'MCP BOTハブ 特許戦略メモ',
    description: '外部効果の検証 × 成果連動精算。分散自動化の技術的な権利化戦略。',
    images: [{ url: '/og.png', width: 1672, height: 942, alt: 'MCP BOTハブ 特許戦略メモ' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MCP BOTハブ 特許戦略メモ',
    description: '外部効果の検証 × 成果連動精算',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
