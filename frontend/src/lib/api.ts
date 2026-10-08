import { z } from 'zod';

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const apiHealthSchema = z.object({
  status: z.literal('ok'),
  checks: z.object({
    database: z.literal('ok'),
    redis: z.literal('ok'),
  }),
});

export type ApiHealth = z.infer<typeof apiHealthSchema>;

export async function getApiHealth(signal?: AbortSignal): Promise<ApiHealth> {
  if (!apiBaseUrl) {
    throw new Error('NEXT_PUBLIC_API_URL is not configured.');
  }

  const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/health`, {
    signal,
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`API health check failed (${response.status}).`);
  }

  return apiHealthSchema.parse(await response.json());
}
