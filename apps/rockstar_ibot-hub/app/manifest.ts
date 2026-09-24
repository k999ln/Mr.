import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Mr. Automation Hub',
    short_name: 'Mr.',
    description: '自動化ツールと仕事の共通ワークスペース。',
    start_url: '/',
    display: 'standalone',
    background_color: '#f6f7f4',
    theme_color: '#161712',
    orientation: 'any',
    categories: ['productivity', 'business', 'lifestyle'],
    icons: [
      {
        src: '/favicon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
