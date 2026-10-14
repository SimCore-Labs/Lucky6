import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Lucky6 TV | Results & Statistics',
  description: 'Recent Lucky6 draw results and statistics.',
};

export default function TvLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
