import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Lucky Six',
    short_name: 'Lucky Six',
    description: 'The next draw starts here.',
    start_url: '/',
    display: 'standalone',
    background_color: '#101a2a',
    theme_color: '#101a2a',
  };
}
