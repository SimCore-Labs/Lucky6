import type { Metadata, Viewport } from 'next';
import { Providers } from '@/providers/Providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Lucky Six | A little luck. A live draw.',
  description:
    'Follow the live Lucky Six draw, explore the markets, and watch each result unfold.',
};

export const viewport: Viewport = {
  themeColor: '#0b1421',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
