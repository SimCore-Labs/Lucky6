'use client';

import ArrowBack from '@mui/icons-material/ArrowBack';
import { useState } from 'react';
import Link from 'next/link';
import type {
  BetHistoryItem,
  WalletProfileResponse,
  WalletTransaction,
} from '@/lib/api';
import { useUiStore } from '@/store/ui/useUiStore';
import { WalletSpinner } from './WalletSpinner';
import { BettingInitiator } from './BettingInitiator';
import styles from './betting-hub.module.css';

type BetsTab = 'slip' | 'active' | 'settled';

interface BettingHubProps {
  section: 'bets' | 'profile';
  wallet: WalletProfileResponse | null | undefined;
  walletLoading: boolean;
  walletError: Error | null;
  bets: BetHistoryItem[];
  betsLoading: boolean;
  betsError: Error | null;
  transactions: WalletTransaction[];
  transactionsLoading: boolean;
  transactionsError: Error | null;
  onPlay: () => void;
}

function formatCredits(value: string) {
  if (!/^-?\d+$/.test(value)) return '—';
  return BigInt(value).toLocaleString('en-US');
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : date.toLocaleString();
}

function betLabel(bet: BetHistoryItem) {
  if (bet.pickSixTicket) {
    return `Pick six · ${bet.pickSixTicket.numbers.join(', ')}`;
  }
  if (bet.pickNumberTicket) {
    const market =
      bet.pickNumberTicket.marketType === 'PICK_NUMBERS_APPEAR'
        ? 'Numbers appear'
        : 'Numbers absent';
    return `${market} · ${bet.pickNumberTicket.numbers.join(', ')}`;
  }
  return (
    bet.selections
      ?.map((selection) => `${selection.marketTitle}: ${selection.selectionLabel}`)
      .join(' · ') ?? 'Bet details unavailable'
  );
}

function statusLabel(status: string) {
  if (status === 'ACCEPTED') return 'Open';
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function transactionLabel(type: string) {
  switch (type) {
    case 'CREDIT_PURCHASE':
      return 'Credits purchased';
    case 'BONUS_CREDIT':
      return 'Bonus credits';
    case 'BET_STAKE':
      return 'Bet placed';
    case 'BET_REFUND':
      return 'Bet refunded';
    case 'BET_WIN':
      return 'Winnings';
    case 'ADJUSTMENT':
      return 'Balance adjustment';
    default:
      return 'Wallet transaction';
  }
}

function WalletRequired({
  loading,
  error,
  onConnect,
}: {
  loading: boolean;
  error: Error | null;
  onConnect: () => void;
}) {
  if (loading) {
    return (
      <div className={styles.state} role="status">
        <WalletSpinner label="Checking wallet" />
      </div>
    );
  }
  if (error) {
    return (
      <p className={styles.error} role="alert">
        Could not check your wallet: {error.message}
      </p>
    );
  }
  return (
    <div className={styles.state}>
      <p>Connect your wallet to view your account.</p>
      <button className={styles.primaryButton} type="button" onClick={onConnect}>
        Connect wallet
      </button>
    </div>
  );
}

function BetDetails({
  bet,
  onBack,
}: {
  bet: BetHistoryItem;
  onBack: () => void;
}) {
  return (
    <section className={styles.panel} aria-labelledby="bet-detail-title">
      <button className={styles.backButton} type="button" onClick={onBack}>
        <ArrowBack fontSize="small" />
        <span>All bets</span>
      </button>
      <div className={styles.detailHeading}>
        <div>
          <p className={styles.eyebrow}>Draw #{bet.drawNumber}</p>
          <h1 id="bet-detail-title">Bet ticket</h1>
        </div>
        <span className={`${styles.status} ${styles[`status${bet.status}`] ?? ''}`}>
          {statusLabel(bet.status)}
        </span>
      </div>
      <dl className={styles.detailList}>
        <div>
          <dt>Selection</dt>
          <dd>{betLabel(bet)}</dd>
        </div>
        <div>
          <dt>Stake</dt>
          <dd>{formatCredits(bet.stake)} credits</dd>
        </div>
        {bet.pickSixTicket && (
          <div>
            <dt>Matched numbers</dt>
            <dd>{bet.pickSixTicket.matchedCount ?? '—'}</dd>
          </div>
        )}
        {bet.pickNumberTicket && (
          <div>
            <dt>Matched numbers</dt>
            <dd>{bet.pickNumberTicket.matchedCount ?? '—'}</dd>
          </div>
        )}
        <div>
          <dt>Placed</dt>
          <dd>{formatDate(bet.createdAt)}</dd>
        </div>
        {bet.settlement && (
          <div>
            <dt>Return</dt>
            <dd>{formatCredits(bet.settlement.payout)} credits</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function BetList({
  bets,
  loading,
  error,
  onSelect,
}: {
  bets: BetHistoryItem[];
  loading: boolean;
  error: Error | null;
  onSelect: (bet: BetHistoryItem) => void;
}) {
  if (loading) {
    return (
      <div className={styles.state} role="status">
        <WalletSpinner label="Loading bets" />
      </div>
    );
  }
  if (error) {
    return (
      <p className={styles.error} role="alert">
        Could not load your bets: {error.message}
      </p>
    );
  }
  if (bets.length === 0) {
    return <p className={styles.emptyState}>No bets here yet.</p>;
  }

  return (
    <div className={styles.ticketList}>
      {bets.map((bet) => (
        <button
          className={styles.ticket}
          type="button"
          key={bet.id}
          onClick={() => onSelect(bet)}
        >
          <span className={styles.ticketTop}>
            <span className={styles.eyebrow}>Draw #{bet.drawNumber}</span>
            <span className={`${styles.status} ${styles[`status${bet.status}`] ?? ''}`}>
              {statusLabel(bet.status)}
            </span>
          </span>
          <strong className={styles.ticketSelection}>{betLabel(bet)}</strong>
          <span className={styles.ticketBottom}>
            <span>Stake {formatCredits(bet.stake)}</span>
            <span>{formatDate(bet.createdAt)}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function BettingHub({
  section,
  wallet,
  walletLoading,
  walletError,
  bets,
  betsLoading,
  betsError,
  transactions,
  transactionsLoading,
  transactionsError,
  onPlay,
}: BettingHubProps) {
  const selectedBets = useUiStore((state) => state.selectedBets);
  const setWalletModalOpen = useUiStore((state) => state.setWalletModalOpen);
  const [activeTab, setActiveTab] = useState<BetsTab>(
    selectedBets.length > 0 ? 'slip' : 'active',
  );
  const [selectedBet, setSelectedBet] = useState<BetHistoryItem | null>(null);

  if (section === 'profile') {
    if (!wallet) {
      return (
        <section className={styles.pageSection} aria-labelledby="profile-title">
          <h1 id="profile-title">Profile</h1>
          <WalletRequired
            loading={walletLoading}
            error={walletError}
            onConnect={() => setWalletModalOpen(true)}
          />
        </section>
      );
    }

    return (
      <section className={styles.pageSection} aria-labelledby="profile-title">
        <h1 id="profile-title">Profile</h1>
        <section className={styles.profileCard} aria-label="Wallet">
          <span className={styles.eyebrow}>Wallet balance</span>
          <strong>{formatCredits(wallet.balance)} credits</strong>
          <span className={styles.walletAddress}>
            {wallet.address.slice(0, 6)}…{wallet.address.slice(-6)}
          </span>
          <Link className={styles.secondaryButton} href="/top-up">
            Top up
          </Link>
        </section>
        <section className={styles.transactions} aria-labelledby="transactions-title">
          <h2 id="transactions-title">Transactions</h2>
          {transactionsLoading ? (
            <div className={styles.state} role="status">
              <WalletSpinner label="Loading transactions" />
            </div>
          ) : transactionsError ? (
            <p className={styles.error} role="alert">
              Could not load transactions: {transactionsError.message}
            </p>
          ) : transactions.length === 0 ? (
            <p className={styles.emptyState}>No transactions yet.</p>
          ) : (
            <ul className={styles.transactionList}>
              {transactions.map((transaction) => {
                const amount = /^-?\d+$/.test(transaction.amount)
                  ? BigInt(transaction.amount)
                  : null;
                return (
                  <li className={styles.transaction} key={transaction.id}>
                    <span className={styles.transactionCopy}>
                      <strong>{transactionLabel(transaction.type)}</strong>
                      <time dateTime={transaction.createdAt}>
                        {formatDate(transaction.createdAt)}
                      </time>
                    </span>
                    <strong className={styles.transactionAmount}>
                      {amount === null
                        ? '—'
                        : `${amount > BigInt(0) ? '+' : ''}${amount.toLocaleString('en-US')}`}
                    </strong>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </section>
    );
  }

  if (selectedBet) {
    return (
      <section className={styles.pageSection}>
        <BetDetails bet={selectedBet} onBack={() => setSelectedBet(null)} />
      </section>
    );
  }

  const activeBets = bets.filter((bet) => bet.status === 'ACCEPTED');
  const settledBets = bets.filter((bet) => bet.status !== 'ACCEPTED');
  const displayedBets = activeTab === 'active' ? activeBets : settledBets;

  return (
    <section className={styles.pageSection} aria-labelledby="bets-title">
      <div className={styles.pageHeading}>
        <h1 id="bets-title">Bets</h1>
        <button className={styles.textButton} type="button" onClick={onPlay}>
          Play
        </button>
      </div>
      <div className={styles.tabs} role="tablist" aria-label="Bet categories">
        {(
          [
            ['slip', `Slip${selectedBets.length ? ` ${selectedBets.length}` : ''}`],
            ['active', `Active${activeBets.length ? ` ${activeBets.length}` : ''}`],
            ['settled', 'Settled'],
          ] as const
        ).map(([tab, label]) => (
          <button
            className={`${styles.tab} ${activeTab === tab ? styles.selectedTab : ''}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            key={tab}
            onClick={() => setActiveTab(tab)}
          >
            {label}
          </button>
        ))}
      </div>
      {activeTab === 'slip' ? (
        <>
          {selectedBets.length === 0 && (
            <div className={styles.slipEmpty}>
              <p>Your slip is empty.</p>
              <button
                className={styles.primaryButton}
                type="button"
                onClick={onPlay}
              >
                Choose a game
              </button>
            </div>
          )}
          {selectedBets.length > 0 && <BettingInitiator />}
        </>
      ) : wallet ? (
        <BetList
          bets={displayedBets}
          loading={betsLoading}
          error={betsError}
          onSelect={setSelectedBet}
        />
      ) : (
        <WalletRequired
          loading={walletLoading}
          error={walletError}
          onConnect={() => setWalletModalOpen(true)}
        />
      )}
    </section>
  );
}
