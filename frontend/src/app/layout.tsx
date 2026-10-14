import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Lucky6 | Live Draws',
  description: 'Follow Lucky6 live draws and keep your lucky numbers close.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
