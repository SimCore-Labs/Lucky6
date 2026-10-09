'use client';

import { useEffect, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ApiError, getCurrentDraw, type CurrentDrawResponse } from '@/lib/api';
import styles from './page.module.css';

gsap.registerPlugin(useGSAP);

const ballNumbers = Array.from({ length: 49 }, (_, index) => index + 1);
const emptySlots = Array.from({ length: 6 }, (_, index) => index);
const ballColors = ['red', 'blue', 'green'] as const;

function colorClass(number: number): string {
  if (number === 49) return styles.blackBall;
  return styles[`${ballColors[(number - 1) % ballColors.length]}Ball`];
}

function resultColorClass(color: string, number: number): string {
  if (number === 49 || color === 'BLACK') return styles.blackBall;
  if (color === 'YELLOW') return styles.legacyYellowBall;
  if (color === 'RED') return styles.redBall;
  if (color === 'BLUE') return styles.blueBall;
  if (color === 'GREEN') return styles.greenBall;
  return colorClass(number);
}

function getCountdownTarget(draw: CurrentDrawResponse | null): number | null {
  if (!draw) return null;
  const target = draw.status === 'OPEN' ? draw.closeAt : draw.drawAt;
  return new Date(target).getTime();
}

function formatCountdown(milliseconds: number | null): string {
  if (milliseconds === null) return '--:--';
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function HomePage() {
  const stageRef = useRef<HTMLElement>(null);
  const resultKeyRef = useRef<string | null>(null);
  const hasShownResultsRef = useRef(false);
  const vacuumedDrawRef = useRef<string | null>(null);
  const ballRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [draw, setDraw] = useState<CurrentDrawResponse | null>(null);
  const [shownBalls, setShownBalls] = useState<CurrentDrawResponse['balls']>(
    [],
  );
  const [revealToken, setRevealToken] = useState<string | null>(null);
  const [selectedNumbers, setSelectedNumbers] = useState<Set<number>>(
    () => new Set(),
  );
  const [now, setNow] = useState(0);

  const displayedResult =
    draw?.latestResult ??
    (draw?.balls.length === 6
      ? { id: draw.id, balls: draw.balls }
      : null);
  const orderedResults =
    displayedResult?.balls.length === 6
      ? [...displayedResult.balls].sort(
          (first, second) => first.orderIndex - second.orderIndex,
        )
      : [];
  const resultKey =
    orderedResults.length === 6
      ? `${displayedResult?.id}:${orderedResults.map((ball) => ball.number).join(',')}`
      : '';
  const countdownTarget = getCountdownTarget(draw);
  const countdown = countdownTarget === null ? null : countdownTarget - now;
  const vacuumTimeReached =
    Boolean(draw) &&
    draw?.status !== 'OPEN' &&
    countdown !== null &&
    countdown <= 0;
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let timeoutId: number | undefined;
    let controller: AbortController | undefined;

    const loadCurrentDraw = async () => {
      controller = new AbortController();
      try {
        const currentDraw = await getCurrentDraw(controller.signal);
        if (active) {
          setDraw(currentDraw);
          setLoadError(null);
        }
      } catch (error) {
        if (active && !controller.signal.aborted) {
          if (error instanceof ApiError && error.status === 404) {
            setDraw(null);
            setLoadError(null);
          } else {
            setLoadError('The draw feed is unavailable. Retrying shortly.');
          }
        }
      } finally {
        if (active) {
          timeoutId = window.setTimeout(loadCurrentDraw, 3_000);
        }
      }
    };

    void loadCurrentDraw();
    return () => {
      active = false;
      controller?.abort();
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    const updateTime = () => setNow(Date.now());
    updateTime();
    const intervalId = window.setInterval(updateTime, 1_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useGSAP(
    () => {
      if (!resultKey || !draw || resultKeyRef.current === resultKey) return;

      resultKeyRef.current = resultKey;
      const revealBalls = () => {
        hasShownResultsRef.current = true;
        setShownBalls(orderedResults);
        setRevealToken(resultKey);
      };

      if (!hasShownResultsRef.current) {
        revealBalls();
        return;
      }

      vacuumedDrawRef.current = draw.id;
      const visibleBalls = ballRefs.current.filter(
        (ball): ball is HTMLDivElement => ball !== null,
      );
      if (visibleBalls.length === 0) {
        revealBalls();
        return;
      }

      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        revealBalls();
        return;
      }

      gsap.to(visibleBalls, {
        scale: 0.08,
        y: -78,
        opacity: 0,
        rotation: 150,
        duration: 0.34,
        stagger: 0.16,
        ease: 'power3.in',
        onComplete: revealBalls,
      });
    },
    {
      scope: stageRef,
      dependencies: [resultKey],
      revertOnUpdate: true,
    },
  );

  useGSAP(
    () => {
      if (!revealToken) return;
      const incomingBalls = ballRefs.current.filter(
        (ball): ball is HTMLDivElement => ball !== null,
      );
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      gsap.fromTo(
        incomingBalls,
        { scale: 0.15, y: 48, opacity: 0 },
        {
          scale: 1,
          y: 0,
          opacity: 1,
          duration: 0.48,
          stagger: 0.3,
          ease: 'back.out(1.7)',
        },
      );
    },
    {
      scope: stageRef,
      dependencies: [revealToken],
      revertOnUpdate: true,
    },
  );

  useGSAP(
    () => {
      if (
        !draw ||
        !vacuumTimeReached ||
        shownBalls.length === 0 ||
        vacuumedDrawRef.current === draw.id
      ) {
        return;
      }

      vacuumedDrawRef.current = draw.id;
      const visibleBalls = ballRefs.current.filter(
        (ball): ball is HTMLDivElement => ball !== null,
      );
      if (visibleBalls.length === 0) {
        setShownBalls([]);
        return;
      }

      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setShownBalls([]);
        return;
      }

      gsap.to(visibleBalls, {
        scale: 0.08,
        y: -78,
        opacity: 0,
        rotation: 150,
        duration: 0.34,
        stagger: 0.16,
        ease: 'power3.in',
        onComplete: () => setShownBalls([]),
      });
    },
    {
      scope: stageRef,
      dependencies: [draw?.id, vacuumTimeReached, shownBalls.length],
      revertOnUpdate: true,
    },
  );

  const toggleNumber = (number: number) => {
    setSelectedNumbers((current) => {
      const next = new Set(current);
      if (next.has(number)) next.delete(number);
      else next.add(number);
      return next;
    });
  };

  return (
    <main className={styles.page} ref={stageRef}>
      <section className={styles.drawStage} aria-label="Current draw">
        <div className={styles.drawBalls}>
          {emptySlots.map((slot) => {
            const ball = shownBalls[slot];
            return (
              <div
                className={`${styles.drawBall} ${
                  ball
                    ? resultColorClass(ball.color, ball.number)
                    : styles.emptyBall
                }`}
                key={slot}
                ref={(element) => {
                  ballRefs.current[slot] = element;
                }}
                aria-label={ball ? `Drawn number ${ball.number}` : 'Result pending'}
              >
                {ball?.number ?? ''}
              </div>
            );
          })}
        </div>
        <p className={styles.countdown} aria-live="off">
          {formatCountdown(countdown)}
        </p>
        {loadError && (
          <p className={styles.errorMessage} role="alert">
            {loadError}
          </p>
        )}
        <span className={styles.screenReaderOnly} aria-live="polite">
          {draw ? `Draw ${draw.drawNumber}: ${draw.status}` : 'Waiting for the draw'}
        </span>
      </section>

      <section className={styles.numberPicker} aria-label="Choose numbers">
        <div className={styles.numberGrid}>
          {ballNumbers.map((number) => {
            const selected = selectedNumbers.has(number);
            return (
              <button
                aria-label={`Number ${number}${selected ? ', selected' : ''}`}
                aria-pressed={selected}
                className={`${styles.numberBall} ${colorClass(number)} ${
                  selected ? styles.selectedBall : ''
                }`}
                key={number}
                onClick={() => toggleNumber(number)}
                type="button"
              >
                {number}
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}
