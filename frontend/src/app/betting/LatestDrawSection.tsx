'use client';

import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import {
  ApiError,
  getCurrentDraw,
  getDrawResults,
  type CurrentDrawResponse,
  type DrawResult,
} from '@/lib/api';
import styles from './latest-draw-section.module.css';

const fallbackRefreshInterval = 5 * 60_000;
const liveDrawRefreshInterval = 3_000;
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

gsap.registerPlugin(useGSAP);

function formatCountdown(milliseconds: number | null): string {
  if (milliseconds === null) return '--:--';
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(
    totalSeconds % 60,
  ).padStart(2, '0')}`;
}

function ballColorClass(color: string, number: number): string {
  if (number === 49 || color === 'BLACK') return styles.blackBall;
  if (color === 'RED') return styles.redBall;
  if (color === 'BLUE') return styles.blueBall;
  if (color === 'GREEN') return styles.greenBall;
  if (color === 'YELLOW') return styles.yellowBall;
  return [styles.redBall, styles.blueBall, styles.greenBall][(number - 1) % 3];
}

export function LatestDrawSection() {
  const [latestDraw, setLatestDraw] = useState<DrawResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveDraw, setLiveDraw] = useState<CurrentDrawResponse | null>(null);
  const [liveDrawLoading, setLiveDrawLoading] = useState(true);
  const [liveDrawUnavailable, setLiveDrawUnavailable] = useState(false);
  const [now, setNow] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);
  const timerRef = useRef<HTMLDivElement>(null);

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
        const results = await getDrawResults(1, controller.signal);
        if (active) {
          setLatestDraw(results.results[0] ?? null);
          setError(null);
        }
      } catch (cause) {
        if (active && !controller.signal.aborted) {
          setError(
            cause instanceof ApiError
              ? cause.message
              : 'Latest draw is temporarily unavailable. Retrying shortly.',
          );
        }
      } finally {
        refreshInProgress = false;
        if (active) setLoading(false);
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

    socket.on('connect', refreshOnDrawCompleted);
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
      socket.off('connect', refreshOnDrawCompleted);
      socket.off('draw.completed', refreshOnDrawCompleted);
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    let active = true;
    let timeoutId: number | undefined;
    let controller: AbortController | undefined;

    const refreshLiveDraw = async () => {
      controller = new AbortController();
      try {
        const currentDraw = await getCurrentDraw(controller.signal);
        if (active) {
          setLiveDraw(currentDraw);
          setLiveDrawUnavailable(false);
        }
      } catch (cause) {
        if (active && !controller.signal.aborted) {
          if (cause instanceof ApiError && cause.status === 404) {
            setLiveDraw(null);
            setLiveDrawUnavailable(false);
          } else {
            setLiveDrawUnavailable(true);
          }
        }
      } finally {
        if (active) setLiveDrawLoading(false);
        if (active) {
          timeoutId = window.setTimeout(
            refreshLiveDraw,
            liveDrawRefreshInterval,
          );
        }
      }
    };

    void refreshLiveDraw();
    return () => {
      active = false;
      controller?.abort();
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    let timeoutId: number;
    const updateTime = () => setNow(Date.now());
    const scheduleNextTick = () => {
      timeoutId = window.setTimeout(() => {
        updateTime();
        scheduleNextTick();
      }, 1_000 - (Date.now() % 1_000));
    };

    updateTime();
    scheduleNextTick();
    return () => window.clearTimeout(timeoutId);
  }, []);

  const balls = latestDraw
    ? [...latestDraw.balls].sort(
        (first, second) => first.orderIndex - second.orderIndex,
      )
    : [];
  const countdownTarget = liveDraw
    ? new Date(
        liveDraw.status === 'OPEN' ? liveDraw.closeAt : liveDraw.drawAt,
      ).getTime()
    : null;
  const countdown =
    countdownTarget === null ? null : countdownTarget - now;
  const isFinalCountdown =
    countdown !== null && countdown > 0 && countdown <= 10_000;

  useGSAP(
    () => {
      if (!latestDraw || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return;
      }

      gsap.fromTo(
        `.${styles.ball}`,
        { autoAlpha: 0, y: 28, scale: 0.72, rotate: -8 },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          rotate: 0,
          duration: 0.48,
          ease: 'back.out(1.7)',
          stagger: { each: 0.09 },
          clearProps: 'transform,opacity,visibility',
        },
      );
    },
    { dependencies: [latestDraw?.id], scope: sectionRef, revertOnUpdate: true },
  );

  useGSAP(
    () => {
      if (
        !isFinalCountdown ||
        !timerRef.current ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        return;
      }

      gsap.to(timerRef.current, {
        opacity: 0.42,
        scale: 1.06,
        duration: 0.45,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
        transformOrigin: 'center',
      });
    },
    {
      dependencies: [isFinalCountdown],
      scope: sectionRef,
      revertOnUpdate: true,
    },
  );

  return (
    <section
      ref={sectionRef}
      className={styles.section}
      aria-labelledby="latest-draw-heading"
      aria-busy={loading || liveDrawLoading}
    >
      <h2 className={styles.heading} id="latest-draw-heading">
        {latestDraw ? (
          `LATEST DRAW #${latestDraw.drawNumber}`
        ) : (
          <>
            LATEST DRAW
            {loading && <span className={styles.headingSkeleton} aria-hidden="true" />}
          </>
        )}
      </h2>
      {balls.length > 0 ? (
        <div className={styles.balls} aria-label="Latest drawn numbers">
          {balls.map((ball) => (
            <span
              className={`${styles.ball} ${ballColorClass(ball.color, ball.number)}`}
              key={`${latestDraw?.id}-${ball.orderIndex}`}
              aria-label={`Number ${ball.number}`}
            >
              {ball.number}
            </span>
          ))}
        </div>
      ) : loading ? (
        <div className={styles.balls} aria-label="Loading latest draw">
          {Array.from({ length: 6 }, (_, index) => (
            <span className={`${styles.ball} ${styles.loadingBall}`} key={index} />
          ))}
        </div>
      ) : error ? (
        <p className={styles.message} role="alert">{error}</p>
      ) : (
        <p className={styles.message}>No completed draws yet.</p>
      )}
      {liveDrawLoading ? (
        <div className={styles.timerSkeletonGroup} aria-label="Loading countdown">
          <span className={styles.timerSkeletonLabel} aria-hidden="true" />
          <span className={styles.timerSkeletonValue} aria-hidden="true" />
        </div>
      ) : (
        <div
          className={`${styles.timer} ${isFinalCountdown ? styles.urgentTimer : ''}`}
          aria-label="Draw countdown"
          ref={timerRef}
        >
          <span>
            {liveDraw?.status === 'OPEN' ? 'DRAW CLOSES IN' : 'NEXT DRAW EVENT IN'}
          </span>
          <strong aria-live="off">
            {liveDrawUnavailable ? 'Unavailable' : formatCountdown(countdown)}
          </strong>
        </div>
      )}
    </section>
  );
}
