'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createAuthenticatedBet,
  getCurrentDraw,
  getMarkets,
  getWalletMe,
  ApiError,
  type MarketResponse,
} from '@/lib/api';
import { GameBall } from '@/components/game/GameBall';
import { useUiStore } from '@/store/ui/useUiStore';
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from '@mui/material';
import styles from './betting-page.module.css';

type PickMode = 'numbers' | 'color';
type ColorChoice = 'RED' | 'BLUE' | 'GREEN' | 'BLACK';

interface TicketPreview {
  mode: PickMode;
  numbers?: number[];
  color?: ColorChoice;
  count?: number;
  stake: string;
  idempotencyKey: string;
}

const colors: { value: ColorChoice; label: string; css: string }[] = [
  { value: 'RED', label: 'Red', css: 'red' },
  { value: 'BLUE', label: 'Blue', css: 'blue' },
  { value: 'GREEN', label: 'Green', css: 'green' },
  { value: 'BLACK', label: 'Black', css: 'black' },
];

export function BettingPage() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<PickMode>('numbers');
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
  const [selectedColor, setSelectedColor] = useState<ColorChoice>('RED');
  const [colorCount, setColorCount] = useState<number | null>(null);
  const [stake, setStake] = useState('50');
  const [ticket, setTicket] = useState<TicketPreview | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [placingBet, setPlacingBet] = useState(false);
  const [betError, setBetError] = useState('');
  const walletProfile = useUiStore((state) => state.walletProfile);
  const setWalletProfile = useUiStore((state) => state.setWalletProfile);
  const showToast = useUiStore((state) => state.showToast);
  const drawQuery = useQuery({
    queryKey: ['draw', 'current'],
    queryFn: ({ signal }) => getCurrentDraw(signal),
  });
  const marketsQuery = useQuery({
    queryKey: ['markets'],
    queryFn: ({ signal }) => getMarkets(signal),
  });

  const toggleNumber = (number: number) => {
    setSelectedNumbers((current) => {
      if (current.includes(number)) return current.filter((item) => item !== number);
      if (current.length === 6) {
        showToast('Pick six distinct numbers, then add your ticket.', 'info');
        return current;
      }
      return [...current, number].sort((first, second) => first - second);
    });
  };

  const addTicket = () => {
    if (mode === 'numbers') {
      if (selectedNumbers.length !== 6) {
        showToast('Select exactly six different numbers from 1 to 49.', 'error');
        return;
      }
      setTicket({
        mode,
        numbers: [...selectedNumbers],
        stake,
        idempotencyKey: crypto.randomUUID(),
      });
    } else {
      if (colorCount === null) {
        showToast('Choose a color and its exact count first.', 'error');
        return;
      }
      setTicket({
        mode,
        color: selectedColor,
        count: colorCount,
        stake,
        idempotencyKey: crypto.randomUUID(),
      });
    }
    showToast('Ticket preview added to your slip.', 'success');
  };

  const currentMarket = (type: string) =>
    marketsQuery.data?.find((market) => market.type === type);
  const selectedMarketSelection = (preview: TicketPreview, markets: MarketResponse[]) => {
    if (preview.mode !== 'color' || preview.color === undefined || preview.count === undefined) {
      return undefined;
    }
    const market = markets.find((item) => item.type === 'COLOR_COUNT');
    const value = `${preview.color}:${preview.count}`;
    return market?.selections.find((selection) => selection.value === value);
  };
  const pickSixMultiplier = (preview: TicketPreview) => {
    if (preview.mode !== 'numbers' || !preview.numbers) return undefined;
    const schedule = currentMarket('PICK_SIX')?.payoutTiers;
    const tier = preview.numbers.includes(49) ? schedule?.includes49 : schedule?.excludes49;
    return tier?.['3'];
  };
  const stakeValue = Number(ticket?.stake ?? stake);
  const activeSelection =
    ticket && marketsQuery.data ? selectedMarketSelection(ticket, marketsQuery.data) : undefined;
  const displayedMultiplier =
    ticket?.mode === 'numbers'
      ? pickSixMultiplier(ticket)
      : activeSelection?.currentOdds;
  const potentialReturn =
    displayedMultiplier !== undefined && Number.isSafeInteger(stakeValue)
      ? Math.floor(stakeValue * displayedMultiplier * 100) / 100
      : null;
  const canPlaceBet =
    Boolean(ticket) &&
    Number.isSafeInteger(stakeValue) &&
    stakeValue > 0 &&
    stakeValue <= 50 &&
    Boolean(drawQuery.data?.status === 'OPEN') &&
    (ticket?.mode === 'numbers'
      ? Boolean(currentMarket('PICK_SIX')?.payoutTiers)
      : Boolean(activeSelection));

  const confirmBet = async () => {
    if (!ticket || !drawQuery.data || !walletProfile) {
      setConfirmOpen(false);
      showToast(
        walletProfile ? 'The draw is unavailable. Try again shortly.' : 'Connect and sign in with a wallet first.',
        'error',
      );
      return;
    }
    const stakeAmount = Number(ticket.stake);
    if (!Number.isSafeInteger(stakeAmount) || stakeAmount < 1 || stakeAmount > 50) {
      setBetError('Stake must be a whole number between 1 and 50 credits.');
      return;
    }
    if (drawQuery.data.status !== 'OPEN' || new Date(drawQuery.data.closeAt) <= new Date()) {
      setBetError('Betting is closed for this draw. Refresh to see the next draw.');
      return;
    }

    setPlacingBet(true);
    setBetError('');
    try {
      if (ticket.mode === 'numbers') {
        await createAuthenticatedBet({
          kind: 'PICK_SIX',
          drawId: drawQuery.data.id,
          stake: stakeAmount,
          idempotencyKey: ticket.idempotencyKey,
          numbers: ticket.numbers ?? [],
        });
      } else {
        const selection = marketsQuery.data
          ? selectedMarketSelection(ticket, marketsQuery.data)
          : undefined;
        if (!selection) {
          throw new Error('This exact color-count selection is not currently available.');
        }
        await createAuthenticatedBet({
          kind: 'SELECTION',
          drawId: drawQuery.data.id,
          stake: stakeAmount,
          idempotencyKey: ticket.idempotencyKey,
          selectionId: selection.id,
          oddsVersion: selection.oddsVersion,
        });
      }
      const profile = await getWalletMe();
      setWalletProfile(profile);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['bets', 'mine'] }),
        queryClient.invalidateQueries({ queryKey: ['wallet', 'session'] }),
      ]);
      setConfirmOpen(false);
      setTicket(null);
      showToast('Bet accepted. Your balance has been updated.', 'success');
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        await queryClient.invalidateQueries({ queryKey: ['markets'] });
      }
      setBetError(
        error instanceof ApiError && error.status === 409
          ? 'The market changed. Review the latest price and confirm again.'
          : error instanceof Error
            ? error.message
            : 'Could not place your bet.',
      );
    } finally {
      setPlacingBet(false);
    }
  };

  const ticketDescription = ticket?.mode === 'numbers'
    ? ticket.numbers?.join(' · ')
    : `${ticket?.color?.toLowerCase()} exactly ${ticket?.count} of 6`;
  const drawStatus = drawQuery.data
    ? `Draw #${drawQuery.data.drawNumber} · ${drawQuery.data.status.replaceAll('_', ' ').toLowerCase()}`
    : drawQuery.isError
      ? 'Draw service unavailable'
      : 'Loading draw…';

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumb}>
        <Link href="/">Lobby</Link><span aria-hidden="true">/</span><span>Ticket builder</span>
      </div>

      <header className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>LUCKY6 · TICKET BUILDER</span>
          <h1>Make your pick</h1>
          <p>Pick six numbers or predict an exact color count.</p>
        </div>
        <div className={styles.drawChip}><span />{drawStatus}</div>
      </header>

      <div className={styles.layout}>
        <section className={styles.builderCard} aria-label="Ticket selection">
          <div className={styles.modeTabs} role="tablist" aria-label="Ticket type">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'numbers'}
              className={mode === 'numbers' ? styles.tabActive : ''}
              onClick={() => setMode('numbers')}
            >
              <span className={styles.tabIcon}>6</span>
              Pick six
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'color'}
              className={mode === 'color' ? styles.tabActive : ''}
              onClick={() => setMode('color')}
            >
              <span className={styles.tabIcon}>◉</span>
              Exact color count
            </button>
          </div>

          {mode === 'numbers' ? (
            <div className={styles.numberPanel} role="tabpanel">
              <div className={styles.panelHeading}>
                <div>
                  <h2>Select six numbers</h2>
                  <p>Choose 6 different numbers from 1 to 49.</p>
                </div>
                <span className={styles.pickCount}><strong>{selectedNumbers.length}</strong> / 6</span>
              </div>
              <div className={styles.numberGrid} aria-label="Numbers 1 through 49">
                {Array.from({ length: 49 }, (_, index) => index + 1).map((number) => (
                  <GameBall
                    key={number}
                    number={number}
                    selected={selectedNumbers.includes(number)}
                    onClick={() => toggleNumber(number)}
                  />
                ))}
              </div>
              <div className={styles.numberActions}>
                <button type="button" className={styles.textButton} onClick={() => setSelectedNumbers([])}>
                  Clear selection
                </button>
                <span>{selectedNumbers.length === 6 ? 'Six selected · ready to preview' : `${6 - selectedNumbers.length} more to choose`}</span>
              </div>
            </div>
          ) : (
            <div className={styles.colorPanel} role="tabpanel">
              <div className={styles.panelHeading}>
                <div>
                  <h2>Choose an exact count</h2>
                  <p>Pick a color and its exact count among the six balls.</p>
                </div>
              </div>
              <div className={styles.colorOptions} role="radiogroup" aria-label="Choose a ball color">
                {colors.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    role="radio"
                    aria-checked={selectedColor === color.value}
                    className={`${styles.colorOption} ${selectedColor === color.value ? styles.colorSelected : ''}`}
                    onClick={() => {
                      setSelectedColor(color.value);
                      if (color.value === 'BLACK') setColorCount(1);
                    }}
                  >
                    <span className={`${styles.colorDot} ${styles[color.css]}`} />
                    {color.label}
                    {selectedColor === color.value && <span className={styles.checkMark}>✓</span>}
                  </button>
                ))}
              </div>
              <div className={styles.exactCountLabel}>Exactly this many</div>
              <div className={styles.countGrid} role="group" aria-label="Exact number of selected color">
                {Array.from({ length: 7 }, (_, count) => (
                  <button
                    key={count}
                    type="button"
                    className={colorCount === count ? styles.countActive : ''}
                    aria-pressed={colorCount === count}
                    disabled={selectedColor === 'BLACK' && count !== 1}
                    onClick={() => setColorCount(count)}
                  >
                    {count}
                  </button>
                ))}
              </div>
              <div className={styles.colorHint}>
                <span className={`${styles.colorDot} ${styles[colors.find((item) => item.value === selectedColor)?.css ?? 'red']}`} />
                {selectedColor === 'BLACK'
                  ? 'Black is the number 49 ball and can appear once.'
                  : `Select a count from zero to six for ${selectedColor.toLowerCase()}.`}
              </div>
            </div>
          )}

          <div className={styles.builderFooter}>
            <span className={styles.simNote}>Stake up to 50 SIM</span>
            <button className={styles.addButton} type="button" onClick={addTicket}>
              Add to slip <span aria-hidden="true">→</span>
            </button>
          </div>
        </section>

        <aside className={styles.slipColumn} aria-label="Bet slip">
          <section className={styles.slipCard}>
            <div className={styles.slipHeading}>
              <div>
                <span className={styles.eyebrow}>YOUR TICKET</span>
                <h2>Bet slip <span>01</span></h2>
              </div>
              {ticket && (
                <button className={styles.clearSlip} type="button" onClick={() => setTicket(null)}>
                  Clear
                </button>
              )}
            </div>

            {ticket ? (
              <div className={styles.ticketSummary}>
                <div className={styles.ticketSummaryTop}>
                  <span>{ticket.mode === 'numbers' ? 'Pick six' : 'Exact color count'}</span>
                  <span className={styles.previewBadge}>REVIEW</span>
                </div>
                {ticket.mode === 'numbers' ? (
                  <div className={styles.slipBalls}>
                    {ticket.numbers?.map((number) => (
                      <GameBall key={number} number={number} />
                    ))}
                  </div>
                ) : (
                  <div className={styles.colorTicket}>
                    <span className={`${styles.colorDot} ${styles[colors.find((item) => item.value === ticket.color)?.css ?? 'red']}`} />
                    <strong>{ticketDescription}</strong>
                  </div>
                )}
                <label className={styles.stakeLabel} htmlFor="sim-stake">Stake <span>SIM</span></label>
                <div className={styles.stakeControl}>
                  <span>◈</span>
                  <input
                    id="sim-stake"
                    type="number"
                    inputMode="decimal"
                    min="1"
                    step="1"
                    value={stake}
                    onChange={(event) => {
                      setStake(event.target.value);
                      setTicket((current) => current ? { ...current, stake: event.target.value } : null);
                    }}
                    aria-label="Stake in SIM credits"
                  />
                  <span>SIM</span>
                </div>
              </div>
            ) : (
              <div className={styles.emptySlip}>
                <span className={styles.slipGlyph}>＋</span>
                <strong>Your slip is clear</strong>
                <span>Select your ticket and add it here.</span>
              </div>
            )}

            <div className={styles.slipRule} />
            <div className={styles.slipTotal}>
              <span>{ticket?.mode === 'numbers' ? 'Return at 3 matches' : 'Potential return'}</span>
              <strong>
                {potentialReturn === null ? '—' : potentialReturn.toLocaleString()}{' '}
                <small>SIM</small>
              </strong>
            </div>
            <button
              className={styles.unavailableButton}
              type="button"
              disabled={!canPlaceBet}
              onClick={() => {
                if (!walletProfile) {
                  showToast('Connect wallet and sign in before placing a bet.', 'info');
                  return;
                }
                setBetError('');
                setConfirmOpen(true);
              }}
            >
              {!walletProfile ? 'Connect wallet to bet' : 'Review and place bet'}
            </button>
            <p className={styles.securityNote}>
              Final odds and draw availability are checked when you confirm.
            </p>
          </section>

          {marketsQuery.isError && (
            <div className={styles.infoCard}>
              <span className={styles.infoIcon}>!</span>
              <p><strong>Markets unavailable.</strong> Refresh and try again.</p>
            </div>
          )}
        </aside>
      </div>

      <Dialog
        open={confirmOpen}
        onClose={() => {
          if (!placingBet) setConfirmOpen(false);
        }}
        fullWidth
        maxWidth="xs"
        aria-labelledby="confirm-bet-title"
      >
        <DialogTitle id="confirm-bet-title">Confirm bet</DialogTitle>
        <DialogContent>
          <p>
            {ticket?.mode === 'numbers'
              ? `Pick six: ${ticket.numbers?.join(' · ')}`
              : ticketDescription}
          </p>
          <p>Stake: {ticket?.stake} SIM credits</p>
          <p>
            {ticket?.mode === 'numbers'
              ? `Return at 3 matches: ${potentialReturn?.toLocaleString() ?? 'unavailable'} SIM`
              : `Current odds: ${activeSelection?.currentOdds ?? 'unavailable'}x · potential return ${potentialReturn?.toLocaleString() ?? 'unavailable'} SIM`}
          </p>
          <p>
            Draw #{drawQuery.data?.drawNumber} closes{' '}
            {drawQuery.data ? new Date(drawQuery.data.closeAt).toLocaleTimeString() : '—'}.
          </p>
          {betError && <p role="alert">{betError}</p>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={placingBet}>Cancel</Button>
          <Button onClick={confirmBet} variant="contained" disabled={placingBet || !canPlaceBet}>
            {placingBet ? <CircularProgress size={18} /> : 'Confirm bet'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
