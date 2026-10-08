const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function fetchJson<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(
      errorBody.message || `API request failed with status ${response.status}`,
    );
  }

  return response.json();
}

export interface CurrentDrawResponse {
  id: string;
  drawNumber: number;
  status: string;
  openAt: string;
  closeAt: string;
  drawAt: string;
  resultAt?: string | null;
  balls: { number: number; color: string; orderIndex: number }[];
  statistics?: {
    totalSum: number;
    has49: boolean;
    majorityColor: string | null;
  } | null;
}

export interface MarketResponse {
  id: string;
  type: string;
  title: string;
  description: string;
  selections: {
    id: string;
    value: string;
    label: string;
    currentOdds: number;
    oddsVersion: number;
  }[];
}

export async function getCurrentDraw(
  signal?: AbortSignal,
): Promise<CurrentDrawResponse> {
  return fetchJson<CurrentDrawResponse>('/draws/current', { signal });
}

export async function getMarkets(
  signal?: AbortSignal,
): Promise<MarketResponse[]> {
  return fetchJson<MarketResponse[]>('/markets', { signal });
}

export async function placeBet(payload: {
  walletId: string;
  drawId: string;
  selectionId: string;
  stake: number;
  idempotencyKey?: string;
}) {
  return fetchJson<{ id: string; status: string; stake: string }>(
    '/bets',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export async function requestAuthNonce(address: string) {
  return fetchJson<{ nonce: string; message: string; expiresAt: string }>(
    '/auth/nonce',
    {
      method: 'POST',
      body: JSON.stringify({ address }),
    },
  );
}

export async function verifyAuthSignature(payload: {
  address: string;
  signature: string;
  nonce: string;
}) {
  return fetchJson<{
    authenticated: boolean;
    address: string;
    walletId: string;
    balance: string;
  }>('/auth/verify', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
