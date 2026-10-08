'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getCurrentDraw,
  getMarkets,
  placeBet,
  requestAuthNonce,
  verifyAuthSignature,
} from '@/lib/api';
import { useUiStore } from '@/store/ui/useUiStore';
import styles from './page.module.css';

const colorHexMap: Record<string, string> = {
  BLUE: '#3a86ff',
  YELLOW: '#ffbe0b',
  RED: '#ff006e',
  GREEN: '#38b000',
  BLACK: '#212529',
};

export default function HomePage() {
  const queryClient = useQueryClient();
  const selectedBet = useUiStore((s) => s.selectedBet);
  const selectBet = useUiStore((s) => s.selectBet);
  const clearBet = useUiStore((s) => s.clearBet);
  const stakeInput = useUiStore((s) => s.stakeInput);
  const setStakeInput = useUiStore((s) => s.setStakeInput);

  const [walletState, setWalletState] = useState<{
    connected: boolean;
    address: string | null;
    walletId: string | null;
    balance: string;
  }>({
    connected: false,
    address: null,
    walletId: null,
    balance: '0',
  });

  const [authLoading, setAuthLoading] = useState(false);
  const [betFeedback, setBetFeedback] = useState<string | null>(null);

  // Poll current draw
  const currentDraw = useQuery({
    queryKey: ['current-draw'],
    queryFn: ({ signal }) => getCurrentDraw(signal),
    refetchInterval: 5000,
  });

  // Poll active markets
  const marketsQuery = useQuery({
    queryKey: ['markets'],
    queryFn: ({ signal }) => getMarkets(signal),
    refetchInterval: 10000,
  });

  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!currentDraw.data?.closeAt) return;
    const interval = setInterval(() => {
      const diff = Math.max(
        0,
        Math.floor(
          (new Date(currentDraw.data.closeAt).getTime() - Date.now()) / 1000,
        ),
      );
      setTimeLeft(diff);
    }, 1000);
    return () => clearInterval(interval);
  }, [currentDraw.data?.closeAt]);

  // Wallet Connect & Auth simulation / Kit integration
  const handleConnectWallet = async () => {
    setAuthLoading(true);
    try {
      const mockAddress = '7XwS31J45x1L4a9pM2k8Y3vQ9r5t1u8w7e6r5t4y3u2i';
      const nonceRes = await requestAuthNonce(mockAddress);
      const verifyRes = await verifyAuthSignature({
        address: mockAddress,
        signature: 'mock_signed_challenge_signature_' + Date.now(),
        nonce: nonceRes.nonce,
      });

      setWalletState({
        connected: true,
        address: verifyRes.address,
        walletId: verifyRes.walletId,
        balance: verifyRes.balance,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Wallet authentication failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  const betMutation = useMutation({
    mutationFn: placeBet,
    onSuccess: (data) => {
      setBetFeedback(`Bet #${data.id.slice(0, 8)} placed successfully!`);
      clearBet();
      queryClient.invalidateQueries({ queryKey: ['current-draw'] });
      if (walletState.walletId) {
        const newBal = (
          BigInt(walletState.balance) - BigInt(stakeInput)
        ).toString();
        setWalletState((s) => ({ ...s, balance: newBal }));
      }
    },
    onError: (err) => {
      setBetFeedback(err instanceof Error ? err.message : 'Failed to place bet.');
    },
  });

  const handleConfirmBet = () => {
    if (!walletState.walletId || !walletState.connected) {
      alert('Please connect your Solana wallet first.');
      return;
    }
    if (!selectedBet || !currentDraw.data?.id) return;

    setBetFeedback(null);
    betMutation.mutate({
      walletId: walletState.walletId,
      drawId: currentDraw.data.id,
      selectionId: selectedBet.selectionId,
      stake: Number(stakeInput),
      idempotencyKey: `bet_${Date.now()}_${Math.random()}`,
    });
  };

  const formatCountdown = (seconds: number | null) => {
    if (seconds === null) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="Lucky Six home">
          <span className={styles.brandMark}>6</span>
          <span>Lucky Six</span>
        </Link>
        <nav className={styles.navigation} aria-label="Main navigation">
          <a className={styles.activeLink} href="#draw">Draw</a>
          <a href="#markets">Markets</a>
          <a href="#rules">Rules</a>
        </nav>
        {walletState.connected ? (
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.88rem', color: '#edbb68' }}>
              {walletState.balance} Credits
            </span>
            <button className={styles.walletButton} type="button">
              {walletState.address?.slice(0, 4)}...{walletState.address?.slice(-4)}
            </button>
          </div>
        ) : (
          <button
            className={styles.walletButton}
            type="button"
            onClick={handleConnectWallet}
            disabled={authLoading}
          >
            {authLoading ? 'Signing challenge...' : 'Connect Solana Wallet'}
          </button>
        )}
      </header>

      <section className={styles.intro} id="draw">
        <div className={styles.introCopy}>
          <p className={styles.kicker}>Real-time Web3 5-Minute Draw</p>
          <h1>Six numbers.<br />Dynamic odds.</h1>
          <p className={styles.lede}>
            Select your markets, place bets using SIM credits, and watch the draw live every 5 minutes.
          </p>
        </div>
        <aside className={styles.connection} aria-live="polite">
          <span className={`${styles.connectionDot} ${styles.online}`} />
          <div>
            <strong>Draw #{currentDraw.data?.drawNumber ?? 10001}</strong>
            <p>
              Status: {currentDraw.data?.status ?? 'OPEN'} | Cutoff in:{' '}
              {formatCountdown(timeLeft)}
            </p>
          </div>
        </aside>
      </section>

      <section className={styles.drawPanel} aria-labelledby="draw-title">
        <div className={styles.drawHeading}>
          <div>
            <p className={styles.sectionLabel}>Live Draw Results</p>
            <h2 id="draw-title">
              {currentDraw.data?.balls.length
                ? 'Draw Complete'
                : 'Waiting for Ball Reveal'}
            </h2>
          </div>
          <span className={styles.phaseBadge}>
            {currentDraw.data?.status ?? 'OPEN'}
          </span>
        </div>
        <div className={styles.ballRow}>
          {Array.from({ length: 6 }).map((_, idx) => {
            const ball = currentDraw.data?.balls[idx];
            return (
              <span
                className={styles.ball}
                key={idx}
                style={{
                  backgroundColor: ball ? colorHexMap[ball.color] || '#333' : 'rgba(255,255,255,0.05)',
                  border: ball ? 'none' : '1px solid rgba(255,255,255,0.1)',
                  color: '#fff',
                  fontWeight: 'bold',
                }}
              >
                <span>{ball ? ball.number : '—'}</span>
              </span>
            );
          })}
        </div>
      </section>

      {/* Betting Slip Area */}
      {selectedBet && (
        <section
          style={{
            margin: '24px 0',
            padding: '20px',
            background: '#18263a',
            borderRadius: '12px',
            border: '1px solid #74a9ff',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#f3f4ef' }}>
                {selectedBet.marketTitle}: {selectedBet.selectionLabel}
              </h3>
              <p style={{ margin: '4px 0 0', color: '#74a9ff', fontWeight: 'bold' }}>
                Offered Odds: @{selectedBet.odds.toFixed(2)} (v{selectedBet.oddsVersion})
              </p>
            </div>
            <button
              onClick={clearBet}
              style={{ background: 'transparent', border: 'none', color: '#e48679', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
          <div style={{ marginTop: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
            <label style={{ fontSize: '0.9rem', color: '#aab6c5' }}>Stake (Credits):</label>
            <input
              type="number"
              value={stakeInput}
              onChange={(e) => setStakeInput(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #aab6c5',
                background: '#101a2a',
                color: '#fff',
                width: '100px',
              }}
            />
            <button
              onClick={handleConfirmBet}
              disabled={betMutation.isPending}
              style={{
                padding: '10px 20px',
                borderRadius: '6px',
                border: 'none',
                background: '#edbb68',
                color: '#101a2a',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              {betMutation.isPending ? 'Placing Bet...' : 'Confirm Bet'}
            </button>
          </div>
          {betFeedback && (
            <p style={{ marginTop: '12px', color: '#edbb68', fontSize: '0.9rem' }}>
              {betFeedback}
            </p>
          )}
        </section>
      )}

      {/* Markets Section */}
      <section className={styles.lowerGrid} id="markets">
        {marketsQuery.data?.map((m) => (
          <article className={styles.infoPanel} key={m.id}>
            <p className={styles.sectionLabel}>{m.title}</p>
            <p style={{ fontSize: '0.88rem', color: '#aab6c5', margin: '4px 0 12px' }}>
              {m.description}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '8px' }}>
              {m.selections.slice(0, 12).map((s) => (
                <button
                  key={s.id}
                  onClick={() =>
                    selectBet({
                      marketId: m.id,
                      marketTitle: m.title,
                      selectionId: s.id,
                      selectionValue: s.value,
                      selectionLabel: s.label,
                      odds: s.currentOdds,
                      oddsVersion: s.oddsVersion,
                    })
                  }
                  style={{
                    padding: '8px',
                    borderRadius: '6px',
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: selectedBet?.selectionId === s.id ? '#74a9ff' : 'rgba(255,255,255,0.03)',
                    color: selectedBet?.selectionId === s.id ? '#101a2a' : '#fff',
                    textAlign: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>{s.label}</div>
                  <div style={{ fontSize: '0.85rem', color: selectedBet?.selectionId === s.id ? '#101a2a' : '#edbb68', marginTop: '2px' }}>
                    @{s.currentOdds.toFixed(2)}
                  </div>
                </button>
              ))}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
