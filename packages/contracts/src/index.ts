export type DrawStatus =
  | 'SCHEDULED'
  | 'OPEN'
  | 'CLOSING'
  | 'CLOSED'
  | 'DRAWING'
  | 'RESULT_READY'
  | 'SETTLEMENT_PENDING'
  | 'SETTLED';

export type BetStatus = 'ACCEPTED' | 'WON' | 'LOST' | 'REFUNDED';

export type PaymentStatus =
  | 'PENDING'
  | 'SUBMITTED'
  | 'CONFIRMING'
  | 'VERIFIED'
  | 'CREDITED'
  | 'EXPIRED'
  | 'FAILED'
  | 'UNDERPAID'
  | 'OVERPAID'
  | 'REQUIRES_REVIEW';

export type LedgerEntryType =
  | 'CREDIT_PURCHASE'
  | 'BONUS_CREDIT'
  | 'BET_STAKE'
  | 'BET_REFUND'
  | 'BET_WIN'
  | 'ADJUSTMENT';

export type BallColor = 'BLUE' | 'YELLOW' | 'RED' | 'GREEN' | 'BLACK';

export type MarketType =
  | 'INDIVIDUAL_NUMBER'
  | 'BLACK_JACKPOT'
  | 'COLOR_MAJORITY'
  | 'COLOR_COUNT'
  | 'TOTAL_SUM'
  | 'SUM_HIGH_MID_LOW'
  | 'SUM_ODD_EVEN'
  | 'FIRST_BALL_COLOR'
  | 'LAST_BALL_COLOR';

export type RealtimeEvent =
  | 'draw.created'
  | 'draw.open'
  | 'draw.closing'
  | 'draw.closed'
  | 'draw.started'
  | 'draw.result'
  | 'markets.updated'
  | 'odds.updated'
  | 'settlement.started'
  | 'settlement.completed'
  | 'wallet.updated'
  | 'jackpot.updated';

export interface ServiceHealth {
  service: string;
  status: 'ok';
}

export interface DrawBallDto {
  number: number;
  color: BallColor;
  orderIndex: number;
}

export interface DrawStatisticDto {
  totalSum: number;
  has49: boolean;
  majorityColor: BallColor | null;
}

export interface DrawDto {
  id: string;
  drawNumber: number;
  status: DrawStatus;
  openAt: string;
  closeAt: string;
  drawAt: string;
  resultAt?: string | null;
  balls: DrawBallDto[];
  statistics?: DrawStatisticDto | null;
}

export interface MarketSelectionDto {
  id: string;
  marketId: string;
  value: string;
  label: string;
  currentOdds: number;
  oddsVersion: number;
}

export interface MarketDto {
  id: string;
  type: MarketType;
  title: string;
  description: string;
  active: boolean;
  selections: MarketSelectionDto[];
}

export interface BetSelectionDto {
  selectionId: string;
  marketType: MarketType;
  value: string;
  lockedOdds: number;
}

export interface BetDto {
  id: string;
  walletId: string;
  drawId: string;
  stake: string; // BigInt serialized as string
  status: BetStatus;
  potentialPayout: string;
  createdAt: string;
  selections: BetSelectionDto[];
}

export interface PlaceBetDto {
  drawId: string;
  selectionId: string;
  stake: number | string;
  idempotencyKey?: string;
}

export interface PaymentOrderDto {
  id: string;
  reference: string;
  walletAddress: string;
  expectedLamports: string;
  creditsToIssue: string;
  status: PaymentStatus;
  createdAt: string;
  expiresAt: string;
}

export interface CreatePaymentOrderDto {
  creditPackageAmount: number;
}

export interface AuthNonceRequestDto {
  address: string;
}

export interface AuthNonceResponseDto {
  nonce: string;
  message: string;
  expiresAt: string;
}

export interface AuthVerifyRequestDto {
  address: string;
  signature: string;
  nonce: string;
}

export interface AuthVerifyResponseDto {
  authenticated: boolean;
  address: string;
  walletId: string;
}

export interface WalletDto {
  id: string;
  address: string;
  balance: string;
}

export interface LedgerEntryDto {
  id: string;
  type: LedgerEntryType;
  amount: string;
  reference?: string | null;
  createdAt: string;
}

// Event Schemas
export interface DrawCreatedEvent {
  drawId: string;
  drawNumber: number;
  openAt: string;
  closeAt: string;
  drawAt: string;
}

export interface DrawCompletedEvent {
  drawId: string;
  drawNumber: number;
  completedAt: string;
  balls: DrawBallDto[];
  statistics: DrawStatisticDto;
}

export interface SettlementCompletedEvent {
  drawId: string;
  drawNumber: number;
  settledBetsCount: number;
  totalPayout: string;
  completedAt: string;
}
