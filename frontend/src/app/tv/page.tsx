'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { io } from 'socket.io-client';
import { ApiError, getDrawResults, type DrawResultsResponse } from '@/lib/api';
import styles from './page.module.css';

const fallbackRefreshInterval = 5 * 60_000;
const recentSlots = Array.from({ length: 5 }, (_, index) => index);
const colorOrder = ['DRAW', 'RED', 'BLUE', 'GREEN', 'YELLOW'] as const;
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function ballColorClass(color: string, number: number): string {
  if (number === 49 || color === 'BLACK') return styles.blackBall;
  if (color === 'RED') return styles.redBall;
  if (color === 'BLUE') return styles.blueBall;
  if (color === 'GREEN') return styles.greenBall;
  if (color === 'YELLOW') return styles.yellowBall;
  return [styles.redBall, styles.blueBall, styles.greenBall][(number - 1) % 3];
}

function colorClass(color: string): string {
  return styles[color.toLowerCase()] ?? styles.neutralColor;
}

function getSumRange(total: number): 'LOW' | 'MID' | 'HIGH' {
  if (total <= 120) return 'LOW';
  if (total <= 170) return 'MID';
  return 'HIGH';
}

export default function TvResultsPage() {
  const [data, setData] = useState<DrawResultsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);

  useEffect(() => {
    let active = true;
    let refreshInProgress = false;
    let refreshQueued = false;
    let controller: AbortController | undefined;

    const refresh = async () => {
      if (!active) return;
      if (refreshInProgress) {
        refreshQueued = true;
        return;
      }

      refreshInProgress = true;
      controller = new AbortController();
      try {
        const results = await getDrawResults(10, controller.signal);
        if (active) {
          setData(results);
          setError(null);
        }
      } catch (cause) {
        if (active && !controller.signal.aborted) {
          setError(
            cause instanceof ApiError
              ? cause.message
              : 'Results are temporarily unavailable. Retrying shortly.',
          );
        }
      } finally {
        refreshInProgress = false;
        if (active && refreshQueued) {
          refreshQueued = false;
          void refresh();
        }
      }
    };

    const socket = io(new URL(apiUrl).origin, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
    });
    const refreshOnDrawCompleted = () => {
      void refresh();
    };
    const handleConnected = () => {
      setSocketConnected(true);
      void refresh();
    };
    const handleDisconnected = () => setSocketConnected(false);

    socket.on('connect', handleConnected);
    socket.on('disconnect', handleDisconnected);
    socket.on('connect_error', handleDisconnected);
    socket.on('draw.completed', refreshOnDrawCompleted);

    const fallbackIntervalId = window.setInterval(
      refreshOnDrawCompleted,
      fallbackRefreshInterval,
    );
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshOnDrawCompleted();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    void refresh();
    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(fallbackIntervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      socket.off('connect', handleConnected);
      socket.off('disconnect', handleDisconnected);
      socket.off('connect_error', handleDisconnected);
      socket.off('draw.completed', refreshOnDrawCompleted);
      socket.disconnect();
    };
  }, []);

  const results = data?.results ?? [];
  const statistics = data?.statistics;
  const colors = statistics?.winningColors;
  const colorEntries = colorOrder
    .map((color) => ({ color, count: colors?.[color] ?? 0 }))
    .filter((item) => item.count > 0);

  return (
    <main className={styles.tvPage}>
      <header className={styles.tvHeader}>
        <Link className={styles.wordmark} href="/" aria-label="Lucky6 home">
          LUCKY<span>6</span>
        </Link>
        <h1>Results &amp; statistics</h1>
        <span className={styles.liveLabel}>
          <i className={socketConnected ? styles.connectedDot : styles.disconnectedDot} />
          {socketConnected ? 'LIVE' : 'RECONNECTING'}
        </span>
      </header>

      <div className={styles.board}>
        <section className={styles.resultsSection} aria-labelledby="results-title">
          <h2 className={styles.sectionTitle} id="results-title">RESULTS</h2>
          <div className={styles.resultsTable} role="table" aria-label="Recent Lucky6 results">
            <div className={styles.tableHeading} role="row">
              <span role="columnheader">DRAW</span>
              <span role="columnheader">NUMBERS</span>
              <span role="columnheader">SUM</span>
              <span role="columnheader">WINNING COLOUR</span>
            </div>
            {results.map((result, index) => (
              <div
                className={`${styles.resultRow} ${index % 2 === 0 ? styles.rowEven : ''}`}
                key={result.id}
                role="row"
              >
                <strong className={styles.drawNumber} role="cell">
                  #{result.drawNumber}
                </strong>
                <div className={styles.balls} role="cell" aria-label="Drawn numbers">
                  {result.balls.map((ball) => (
                    <span
                      className={`${styles.ball} ${ballColorClass(ball.color, ball.number)}`}
                      key={`${result.id}-${ball.orderIndex}`}
                    >
                      {ball.number}
                    </span>
                  ))}
                </div>
                <div className={styles.sumCell} role="cell">
                  <strong>{result.totalSum}</strong>
                  <span>{getSumRange(result.totalSum)}</span>
                </div>
                <span
                  className={`${styles.winningColor} ${colorClass(result.winningColor)}`}
                  role="cell"
                >
                  {result.winningColor === 'DRAW'
                    ? 'Draw'
                    : result.winningColor.charAt(0) +
                      result.winningColor.slice(1).toLowerCase()}
                </span>
              </div>
            ))}
            {!data && !error && (
              <p className={styles.message}>Loading results…</p>
            )}
            {error && (
              <p className={styles.message} role="alert">{error}</p>
            )}
            {data && results.length === 0 && !error && (
              <p className={styles.message}>No completed draws yet.</p>
            )}
          </div>
          <p className={styles.tableNote}>
            Sum range: Low 15–120 · Mid 121–170 · High 171–280
          </p>
        </section>

        <aside className={styles.statistics} aria-labelledby="statistics-title">
          <h2 className={styles.sectionTitle} id="statistics-title">STATISTICS</h2>

          <section className={`${styles.statSection} ${styles.lateSection}`}>
            <h3 className={styles.statHeading}>MOST DELAYED NUMBERS</h3>
            <div className={styles.numberStats}>
              {recentSlots.map((slot) => {
                const item = statistics?.lateNumbers[slot];
                return item ? (
                  <div className={styles.numberStat} key={item.number}>
                    <span className={`${styles.ball} ${ballColorClass('', item.number)}`}>
                      {item.number}
                    </span>
                    <strong>{item.delay}</strong>
                    <small>{item.delay === 1 ? 'draw' : 'draws'}</small>
                  </div>
                ) : (
                  <div className={styles.numberStat} key={`late-${slot}`}>
                    <span className={styles.statPlaceholder}>—</span>
                    <strong>—</strong>
                    <small>draws</small>
                  </div>
                );
              })}
            </div>
            <div className={styles.statSummary}>
              <span>MAXIMUM DELAY</span>
              <strong>
                {statistics && statistics.drawsAnalyzed > 0
                  ? statistics.maxDelay
                  : '—'}
              </strong>
            </div>
          </section>

          <section className={`${styles.statSection} ${styles.hotSection}`}>
            <h3 className={styles.statHeading}>HOT NUMBERS · LAST {statistics?.drawsAnalyzed ?? 20} DRAWS</h3>
            <div className={styles.numberStats}>
              {recentSlots.map((slot) => {
                const item = statistics?.hotNumbers[slot];
                return item ? (
                  <div className={styles.numberStat} key={item.number}>
                    <span className={`${styles.ball} ${ballColorClass('', item.number)}`}>
                      {item.number}
                    </span>
                    <strong>{item.count}</strong>
                    <small>{item.count === 1 ? 'time' : 'times'}</small>
                  </div>
                ) : (
                  <div className={styles.numberStat} key={`hot-${slot}`}>
                    <span className={styles.statPlaceholder}>—</span>
                    <strong>—</strong>
                    <small>times</small>
                  </div>
                );
              })}
            </div>
          </section>

          <section className={`${styles.statSection} ${styles.sumSection}`}>
            <h3 className={styles.statHeading}>SUM RANGE · LAST {statistics?.drawsAnalyzed ?? 20} DRAWS</h3>
            <div className={styles.categoryStats}>
              {(['LOW', 'MID', 'HIGH'] as const).map((range) => (
                <div className={styles.categoryStat} key={range}>
                  <strong>{statistics?.sumBands[range] ?? '—'}</strong>
                  <span>{range}</span>
                </div>
              ))}
            </div>
          </section>

          <section className={`${styles.statSection} ${styles.colorSection}`}>
            <h3 className={styles.statHeading}>WINNING COLOUR · LAST {statistics?.drawsAnalyzed ?? 20} DRAWS</h3>
            <div className={styles.categoryStats}>
              {colorEntries.length > 0
                ? colorEntries.map(({ color, count }) => (
                    <div className={styles.categoryStat} key={color}>
                      <strong className={colorClass(color)}>{count}</strong>
                      <span>{color === 'DRAW' ? 'DRAW' : color}</span>
                    </div>
                  ))
                : <p className={styles.noStats}>Waiting for completed results.</p>}
            </div>
          </section>
        </aside>
      </div>

    </main>
  );
}
