'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { useRef } from 'react';
import styles from './wallet-spinner.module.css';

gsap.registerPlugin(useGSAP);

export function WalletSpinner({
  label,
  size = 'large',
}: {
  label: string;
  size?: 'small' | 'large';
}) {
  const spinnerRef = useRef<HTMLSpanElement>(null);
  const barsRef = useRef<HTMLSpanElement[]>([]);

  useGSAP(
    () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      gsap.to(barsRef.current, {
        scaleY: 0.34,
        y: 2,
        duration: 0.48,
        ease: 'sine.inOut',
        stagger: { each: 0.09, from: 'center' },
        repeat: -1,
        yoyo: true,
        transformOrigin: 'center center',
      });
    },
    { scope: spinnerRef },
  );

  return (
    <span
      className={`${styles.spinner} ${size === 'small' ? styles.small : styles.large}`}
      ref={spinnerRef}
      role="progressbar"
      aria-label={label}
    >
      {Array.from({ length: 5 }, (_, index) => (
        <span
          className={styles.bar}
          key={index}
          ref={(element) => {
            if (element) barsRef.current[index] = element;
          }}
        />
      ))}
    </span>
  );
}
