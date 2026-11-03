'use client';

import Close from '@mui/icons-material/Close';
import { Dialog } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ApiError,
  createIdempotencyKey,
  createAuthenticatedBet,
  getCurrentDraw,
  getMarkets,
  getWalletMe,
  type CreateBetRequest,
  walletMeQueryKey,
} from '@/lib/api';
import { useUiStore } from '@/store/ui/useUiStore';
import styles from './betting-initiator.module.css';
import { WalletSpinner } from './WalletSpinner';

const MAX_GROSS_PAYOUT = BigInt(1_000_000);

function payoutFor(stake: string, odds: number): bigint {
  if (!/^[1-9]\d*$/.test(stake) || !Number.isFinite(odds) || odds <= 0) {
    return BigInt(0);
  }
  const [whole, fraction = ''] = odds.toFixed(2).split('.');
  const oddsHundredths = BigInt(whole) * BigInt(100) + BigInt(fraction);
  return (BigInt(stake) * oddsHundredths) / BigInt(100);
}

function payoutWithinLimit(stake: string, odds: number): bigint {
  const payout = payoutFor(stake, odds);
  return payout > MAX_GROSS_PAYOUT ? MAX_GROSS_PAYOUT : payout;
}

function formatCredits(value: bigint): string {
  return value.toLocaleString('en-US');
}

function DiceAmount({ amount }: { amount: bigint }) {
  return (
    <span className={styles.diceAmount}>
      <Image src="/dice.png" alt="" aria-hidden="true" width={16} height={16} />
      <span>{formatCredits(amount)}</span>
    </span>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    return 'Odds updated. Check your bet and confirm again.';
  }
  return error instanceof Error ? error.message : 'Unable to place the bet.';
}

export function BettingInitiator() {
  const selectedBets = useUiStore((state) => state.selectedBets);
  const setBetStake = useUiStore((state) => state.setBetStake);
  const setBetIdempotencyKey = useUiStore(
    (state) => state.setBetIdempotencyKey,
  );
  const updateBetQuote = useUiStore((state) => state.updateBetQuote);
  const removeBet = useUiStore((state) => state.removeBet);
  const clearBets = useUiStore((state) => state.clearBets);
  const setWalletModalOpen = useUiStore((state) => state.setWalletModalOpen);
  const queryClient = useQueryClient();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const updateTime = () => setNow(Date.now());
    updateTime();
    const intervalId = window.setInterval(updateTime, 1_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const drawQuery = useQuery({
    queryKey: ['draw', 'current'],
    queryFn: ({ signal }) => getCurrentDraw(signal),
    refetchInterval: 1_000,
  });
  const walletQuery = useQuery({
    queryKey: walletMeQueryKey,
    queryFn: async ({ signal }) => {
      try {
        return await getWalletMe(signal);
      } catch (requestError) {
        if (requestError instanceof ApiError && requestError.status === 401) {
          return null;
        }
        throw requestError;
      }
    },
    retry: false,
  });

  const totalStake = selectedBets.reduce((total, bet) => {
    if (!/^[1-9]\d*$/.test(bet.stake)) return total;
    return total + BigInt(bet.stake);
  }, BigInt(0));
  const maximumTotalReturn = selectedBets.reduce(
    (total, bet) => total + payoutWithinLimit(bet.stake, bet.odds),
    BigInt(0),
  );
  const isDrawOpen =
    drawQuery.data?.status === 'OPEN' &&
    now < new Date(drawQuery.data.closeAt).getTime();
  const canReview =
    selectedBets.length > 0 &&
    selectedBets.every(
      (bet) =>
        /^[1-9]\d*$/.test(bet.stake) &&
        Number.isSafeInteger(Number(bet.stake)) &&
        BigInt(bet.stake) >= BigInt(bet.minStake) &&
        Number(bet.stake) <= Number(bet.maxStake),
    );
  const hasEnoughBalance =
    walletQuery.data !== null &&
    walletQuery.data !== undefined &&
    totalStake <= BigInt(walletQuery.data.balance);

  async function submitBets() {
    const draw = drawQuery.data;
    if (!draw || !isDrawOpen) {
      setError('Betting closed.');
      void drawQuery.refetch();
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      for (const bet of selectedBets) {
        const idempotencyKey =
          bet.idempotencyKey ?? createIdempotencyKey();
        if (!bet.idempotencyKey) {
          setBetIdempotencyKey(bet.key, idempotencyKey);
        }
        const payload: CreateBetRequest =
          bet.marketType === 'PICK_NUMBERS_APPEAR' ||
          bet.marketType === 'PICK_NUMBERS_ABSENT'
            ? {
                kind: 'PICK_NUMBERS',
                drawId: draw.id,
                stake: Number(bet.stake),
                idempotencyKey,
                marketType: bet.marketType,
                selectionId: bet.selectionId,
                oddsVersion: bet.oddsVersion,
                numbers: bet.numbers ?? [],
              }
            : {
                kind: 'SELECTION',
                drawId: draw.id,
                stake: Number(bet.stake),
                idempotencyKey,
                selectionId: bet.selectionId,
                oddsVersion: bet.oddsVersion,
              };
        await createAuthenticatedBet(payload);
        removeBet(bet.key);
      }
      clearBets();
      setReviewOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: walletMeQueryKey }),
        queryClient.invalidateQueries({ queryKey: ['bets'] }),
        drawQuery.refetch(),
      ]);
    } catch (submitError) {
      if (submitError instanceof ApiError && submitError.status === 409) {
        try {
          const markets = await getMarkets();
          queryClient.setQueryData(['markets'], markets);
          for (const bet of selectedBets) {
            const selection = markets
              .find((market) => market.type === bet.marketType)
              ?.selections.find((item) => item.id === bet.selectionId);
            if (!selection) {
              removeBet(bet.key);
              continue;
            }
            updateBetQuote(bet.key, {
              odds: selection.currentOdds,
              oddsVersion: selection.oddsVersion,
              minStake: selection.minStake ?? '10',
              maxStake: selection.maxStake ?? '999999',
            });
          }
          setError(
            'Odds updated. Check your bet and confirm again.',
          );
        } catch (refreshError) {
          setError(
            `Odds changed, but updated prices could not be loaded: ${errorMessage(refreshError)}`,
          );
        }
      } else {
        setError(errorMessage(submitError));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className={styles.panel} aria-label="Bet slip">
      {selectedBets.length === 0 ? (
        <p className={styles.emptySlip}>Select a bet</p>
      ) : (
        <>
          <div className={styles.betRows}>
            {selectedBets.map((bet) => (
              <div className={styles.betRow} key={bet.key}>
                <div className={styles.betDetails}>
                  <strong>{bet.marketTitle}</strong>
                  <span>{bet.selectionLabel}</span>
                  <div className={styles.betMeta}>
                    <span>Odds {bet.odds.toFixed(2)}×</span>
                    <span className={styles.maxStake}>
                      Max stake <DiceAmount amount={BigInt(bet.maxStake)} />
                    </span>
                  </div>
                </div>
                <label className={styles.stakeField} htmlFor={`stake-${bet.key}`}>
                  <span>Stake</span>
                  <input
                    className={styles.stakeInput}
                    id={`stake-${bet.key}`}
                    type="number"
                    min={bet.minStake}
                    max={bet.maxStake}
                    step="1"
                    inputMode="numeric"
                    value={bet.stake}
                    onChange={(event) =>
                      setBetStake(bet.key, event.currentTarget.value)
                    }
                    aria-label={`Stake for ${bet.selectionLabel}`}
                  />
                </label>
              </div>
            ))}
          </div>
          <div className={styles.betSummary}>
            <div className={styles.summaryItem}>
              <span>Total stake</span>
              <output><DiceAmount amount={totalStake} /></output>
            </div>
            <div className={styles.payout}>
              <span>Max return</span>
              <output><DiceAmount amount={maximumTotalReturn} /></output>
            </div>
          </div>
          {error && (
            <p className={styles.errorMessage} role="alert">
              {error}
            </p>
          )}
          {drawQuery.isError && (
            <p className={styles.errorMessage} role="alert">
              Could not load the current draw: {drawQuery.error.message}
            </p>
          )}
          {walletQuery.error && (
            <p className={styles.errorMessage} role="alert">
              Could not check wallet session: {walletQuery.error.message}
            </p>
          )}
          <div className={styles.actions}>
            <button
              className={styles.placeBetButton}
              type="button"
              disabled={
                !canReview ||
                !isDrawOpen ||
                drawQuery.isPending ||
                walletQuery.isPending ||
                walletQuery.isError ||
                (walletQuery.data != null && !hasEnoughBalance) ||
                isSubmitting
              }
              onClick={() => {
                setError(null);
                if (!walletQuery.data) {
                  setWalletModalOpen(true);
                  return;
                }
                setReviewOpen(true);
              }}
              aria-label={
                isSubmitting ||
                drawQuery.isPending ||
                walletQuery.isPending
                  ? 'Loading bet'
                  : undefined
              }
            >
              {isSubmitting || drawQuery.isPending || walletQuery.isPending ? (
                <WalletSpinner label="Loading bet" size="small" />
              ) : isDrawOpen ? (
                'Place bet'
              ) : (
                'Unavailable'
              )}
            </button>
          </div>
          {!hasEnoughBalance && walletQuery.data && (
            <p className={styles.errorMessage} role="alert">
              Insufficient balance.{' '}
              <Link className={styles.topUpLink} href="/top-up">
                Top up
              </Link>
            </p>
          )}
        </>
      )}
      <Dialog
        open={reviewOpen}
        onClose={() => {
          if (!isSubmitting) setReviewOpen(false);
        }}
        aria-labelledby="bet-confirmation-title"
        aria-describedby="bet-confirmation-description"
      >
        <div className={styles.reviewDialog}>
          <button
            className={styles.closeButton}
            type="button"
            aria-label="Close"
            disabled={isSubmitting}
            onClick={() => setReviewOpen(false)}
          >
            <Close fontSize="small" />
          </button>
          <h2 id="bet-confirmation-title">Confirm bet</h2>
          <p id="bet-confirmation-description">
            Draw #{drawQuery.data?.drawNumber}
          </p>
          <ul className={styles.reviewList}>
            {selectedBets.map((bet) => (
              <li key={bet.key}>
                <div>
                  <strong>{bet.selectionLabel}</strong>
                  <span>
                    <DiceAmount amount={BigInt(bet.stake)} /> at{' '}
                    {bet.odds.toFixed(2)}×
                  </span>
                </div>
                <strong>
                  <DiceAmount amount={payoutWithinLimit(bet.stake, bet.odds)} />
                </strong>
              </li>
            ))}
          </ul>
          <div className={styles.reviewTotals}>
            <span>Stake: <DiceAmount amount={totalStake} /></span>
            <span>
              Max return: <DiceAmount amount={maximumTotalReturn} />
            </span>
          </div>
          {error && (
            <p className={styles.errorMessage} role="alert">
              {error}
            </p>
          )}
          <button
            className={styles.placeBetButton}
            type="button"
            disabled={
              isSubmitting ||
              !canReview ||
              !isDrawOpen ||
              !hasEnoughBalance
            }
            onClick={() => void submitBets()}
          >
            {isSubmitting ? (
              <WalletSpinner label="Placing bet" size="small" />
            ) : (
              'Confirm bet'
            )}
          </button>
        </div>
      </Dialog>
    </section>
  );
}
