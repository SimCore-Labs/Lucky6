'use client';

import Close from '@mui/icons-material/Close';
import { Dialog } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  ApiError,
  createAuthenticatedBet,
  getCurrentDraw,
  getMarkets,
  getWalletMe,
  type CreateBetRequest,
  walletMeQueryKey,
} from '@/lib/api';
import { useUiStore } from '@/store/ui/useUiStore';
import styles from './betting-initiator.module.css';

function payoutFor(stake: string, odds: number): bigint {
  if (!/^[1-9]\d*$/.test(stake) || !Number.isFinite(odds) || odds <= 0) {
    return BigInt(0);
  }
  const [whole, fraction = ''] = odds.toFixed(2).split('.');
  const oddsHundredths = BigInt(whole) * BigInt(100) + BigInt(fraction);
  return (BigInt(stake) * oddsHundredths) / BigInt(100);
}

function formatCredits(value: bigint): string {
  return value.toLocaleString('en-US');
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    return 'The odds changed. Updated prices are loaded; review your bet again before confirming.';
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
  const potentialPayout = selectedBets.reduce(
    (total, bet) => total + payoutFor(bet.stake, bet.odds),
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
        Number(bet.stake) <= Number(bet.maxStake),
    );
  const hasEnoughBalance =
    walletQuery.data !== null &&
    walletQuery.data !== undefined &&
    totalStake <= BigInt(walletQuery.data.balance);

  async function submitBets() {
    const draw = drawQuery.data;
    if (!draw || !isDrawOpen) {
      setError('Betting is closed for the current draw.');
      void drawQuery.refetch();
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      for (const bet of selectedBets) {
        const idempotencyKey = bet.idempotencyKey ?? crypto.randomUUID();
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
              maxStake: selection.maxStake ?? '50',
            });
          }
          setError(
            'The odds changed. Updated prices are loaded; review the slip before confirming again.',
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
        <p className={styles.emptySlip}>Choose an outcome to prepare a bet.</p>
      ) : (
        <>
          <div className={styles.betRows}>
            {selectedBets.map((bet) => (
              <div className={styles.betRow} key={bet.key}>
                <div className={styles.betDetails}>
                  <strong>{bet.marketTitle}</strong>
                  <span>{bet.selectionLabel}</span>
                  <span>
                    Odds {bet.odds.toFixed(2)}× · Max stake {bet.maxStake}
                  </span>
                </div>
                <label className={styles.stakeField} htmlFor={`stake-${bet.key}`}>
                  <span>Stake</span>
                  <input
                    className={styles.stakeInput}
                    id={`stake-${bet.key}`}
                    type="number"
                    min="1"
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
              <output>{formatCredits(totalStake)} credits</output>
            </div>
            <div className={styles.payout}>
              <span>Max payout</span>
              <output>{formatCredits(potentialPayout)} credits</output>
            </div>
          </div>
          <p className={styles.separateBetsNote}>
            Each selection is a separate bet. Rainbow payouts are not combined
            as a parlay.
          </p>
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
                walletQuery.data == null ||
                !hasEnoughBalance ||
                isSubmitting
              }
              onClick={() => {
                setError(null);
                setReviewOpen(true);
              }}
            >
              {!isDrawOpen
                ? 'Betting unavailable'
                : walletQuery.data
                  ? 'Review bet'
                  : 'Connect wallet to bet'}
            </button>
          </div>
          {!hasEnoughBalance && walletQuery.data && (
            <p className={styles.errorMessage} role="alert">
              Total stake is greater than your available balance.
            </p>
          )}
        </>
      )}
      <Dialog
        open={reviewOpen}
        onClose={() => {
          if (!isSubmitting) setReviewOpen(false);
        }}
        aria-labelledby="bet-review-title"
        aria-describedby="bet-review-description"
      >
        <div className={styles.reviewDialog}>
          <button
            className={styles.closeButton}
            type="button"
            aria-label="Close bet review"
            disabled={isSubmitting}
            onClick={() => setReviewOpen(false)}
          >
            <Close fontSize="small" />
          </button>
          <h2 id="bet-review-title">Review your bet</h2>
          <p id="bet-review-description">
            Draw #{drawQuery.data?.drawNumber}. Confirming submits each
            selection as its own bet.
          </p>
          <ul className={styles.reviewList}>
            {selectedBets.map((bet) => (
              <li key={bet.key}>
                <div>
                  <strong>{bet.selectionLabel}</strong>
                  <span>
                    {bet.stake} credits at {bet.odds.toFixed(2)}×
                  </span>
                </div>
                <strong>
                  {formatCredits(payoutFor(bet.stake, bet.odds))} credits
                </strong>
              </li>
            ))}
          </ul>
          <div className={styles.reviewTotals}>
            <span>Total stake: {formatCredits(totalStake)} credits</span>
            <span>
              Maximum total return if all win: {formatCredits(potentialPayout)}{' '}
              credits
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
            {isSubmitting ? 'Placing bet…' : 'Confirm and place bet'}
          </button>
        </div>
      </Dialog>
    </section>
  );
}
