const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function fetchJson<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<T> {
  const headers = new Headers(options?.headers);
  if (options?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}${endpoint}`, {
    credentials: 'include',
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new ApiError(
      errorBody?.message || `API request failed with status ${response.status}`,
      response.status,
    );
  }

  if (response.status === 204) return undefined as T;
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
  latestResult?: {
    id: string;
    drawNumber: number;
    resultAt: string | null;
    balls: { number: number; color: string; orderIndex: number }[];
    statistics?: {
      totalSum: number;
      has49: boolean;
      majorityColor: string | null;
    } | null;
  } | null;
}

export interface DrawResult {
  id: string;
  drawNumber: number;
  resultAt: string | null;
  balls: { number: number; color: string; orderIndex: number }[];
  totalSum: number;
  winningColor: string;
}

export interface DrawResultsResponse {
  results: DrawResult[];
  statistics: {
    drawsAnalyzed: number;
    hotNumbers: { number: number; count: number }[];
    lateNumbers: { number: number; delay: number }[];
    maxDelay: number;
    winningColors: Record<string, number>;
    sumBands: { LOW: number; MID: number; HIGH: number };
  };
}

export interface MarketResponse {
  id: string;
  type: string;
  title: string;
  description: string;
  payoutScheduleVersion?: number;
  maxStake?: string;
  maxGrossPayout?: string;
  payoutTiers?: {
    excludes49: Record<string, number>;
    includes49: Record<string, number>;
  };
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

export async function getDrawResults(
  limit = 10,
  signal?: AbortSignal,
): Promise<DrawResultsResponse> {
  return fetchJson<DrawResultsResponse>(
    `/draws/results?limit=${encodeURIComponent(limit)}`,
    { signal },
  );
}

export async function getMarkets(
  signal?: AbortSignal,
): Promise<MarketResponse[]> {
  return fetchJson<MarketResponse[]>('/markets', { signal });
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
  signatureEncoding: 'base58' | 'base64';
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

export async function logoutWallet() {
  return fetchJson<{ authenticated: false }>('/auth/logout', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export interface WalletProfileResponse {
  walletId: string;
  address: string;
  balance: string;
  currency?: string;
}

export interface PaymentQuoteResponse {
  credits: string;
  creditPriceUsd: string;
  solPriceUsd: number;
  priceObservedAt: string;
  expectedLamports: string;
  expectedSol: string;
  expiresInSeconds: number;
}

export interface PaymentOrderRequest {
  credits: number;
  idempotencyKey: string;
}

export interface PaymentOrderResponse {
  id: string;
  reference: string;
  status: string;
  credits: string;
  expectedLamports: string;
  expectedSol: string;
  treasuryAddress: string;
  createdAt: string;
  expiresAt: string;
}

export interface PaymentOrderSubmitRequest {
  signature: string;
}

export interface BetHistoryItem {
  id: string;
  status: string;
  stake: string;
  createdAt: string;
  drawId: string;
  drawNumber: number;
  selections?: Array<{
    marketTitle: string;
    marketType: string;
    selectionId: string;
    selectionLabel: string;
    lockedOdds: string;
  }>;
  pickSixTicket?: {
    numbers: number[];
    matchedCount: number | null;
    winningTier: number | null;
    scheduleVersion: number;
  } | null;
  settlement?: {
    status: string;
    payout: string;
    createdAt: string;
  } | null;
}

export async function getWalletMe(signal?: AbortSignal) {
  return fetchJson<WalletProfileResponse>('/wallet/me', { signal });
}

export async function getPaymentQuote(payload: { credits: number }) {
  return fetchJson<PaymentQuoteResponse>(
    `/payments/quote?credits=${encodeURIComponent(payload.credits)}`,
  );
}

export async function createPaymentOrder(payload: PaymentOrderRequest) {
  return fetchJson<PaymentOrderResponse>('/payments/orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function submitPaymentOrder(
  orderId: string,
  payload: PaymentOrderSubmitRequest,
) {
  return fetchJson<{ id: string; status: string }>(
    `/payments/orders/${encodeURIComponent(orderId)}/submit`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export async function getPaymentOrder(orderId: string, signal?: AbortSignal) {
  return fetchJson<PaymentOrderResponse>(
    `/payments/orders/${encodeURIComponent(orderId)}`,
    { signal },
  );
}

export async function getMyBets(signal?: AbortSignal) {
  return fetchJson<BetHistoryItem[]>('/bets/mine', { signal });
}

export type CreateBetRequest =
  | {
      kind: 'SELECTION';
      drawId: string;
      stake: number;
      idempotencyKey: string;
      selectionId: string;
      oddsVersion: number;
    }
  | {
      kind: 'PICK_SIX';
      drawId: string;
      stake: number;
      idempotencyKey: string;
      numbers: number[];
    };

export async function createAuthenticatedBet(payload: CreateBetRequest) {
  return fetchJson<{
    id: string;
    status: string;
    stake: string;
    drawId: string;
    selectionLabel?: string;
    lockedOdds?: string;
    oddsVersion?: number;
    maximumGrossPayout?: string;
    numbers?: number[];
    scheduleVersion?: number;
    tierMultipliers?: Record<number, number>;
  }>('/bets', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
