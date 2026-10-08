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

export type BallColor = 'BLUE' | 'YELLOW' | 'RED' | 'GREEN' | 'BLACK';

export interface ServiceHealth {
  service: string;
  status: 'ok';
}

export interface DrawCompletedEvent {
  drawId: string;
  completedAt: string;
}
