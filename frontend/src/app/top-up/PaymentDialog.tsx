'use client';

import CheckRounded from '@mui/icons-material/CheckRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import { Dialog } from '@mui/material';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import type { PaymentOrderResponse } from '@/lib/api';
import { WalletSpinner } from '@/app/betting/WalletSpinner';
import styles from './payment-dialog.module.css';

gsap.registerPlugin(useGSAP);

export type PaymentDialogMode =
  | 'closed'
  | 'review'
  | 'processing'
  | 'success'
  | 'error';

export function PaymentDialog({
  open,
  mode,
  order,
  credits,
  message,
  statusError,
  isPreparingPayment,
  isAwaitingWallet,
  onClose,
  onPay,
}: {
  open: boolean;
  mode: PaymentDialogMode;
  order: PaymentOrderResponse | null;
  credits: number;
  message: string | null;
  statusError: string | null;
  isPreparingPayment: boolean;
  isAwaitingWallet: boolean;
  onClose: () => void;
  onPay: () => void;
}) {
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const successIconRef = useRef<HTMLSpanElement>(null);
  const confettiRefs = useRef<HTMLSpanElement[]>([]);

  useEffect(() => {
    if (!open || mode !== 'review' || !order) return;
    const expiresAt = order.expiresAt;

    function updateCountdown() {
      setSecondsRemaining(
        Math.max(
          0,
          Math.ceil((Date.parse(expiresAt) - Date.now()) / 1_000),
        ),
      );
    }

    updateCountdown();
    const intervalId = window.setInterval(updateCountdown, 1_000);
    return () => window.clearInterval(intervalId);
  }, [open, mode, order]);

  useGSAP(
    () => {
      if (!open || mode !== 'success') return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      gsap.fromTo(
        successIconRef.current,
        { scale: 0.35, rotation: -18, autoAlpha: 0 },
        {
          scale: 1,
          rotation: 0,
          autoAlpha: 1,
          duration: 0.48,
          ease: 'back.out(1.8)',
        },
      );
      gsap.fromTo(
        confettiRefs.current,
        { x: 0, y: 0, scale: 0.8, autoAlpha: 1 },
        {
          x: (index) => Math.cos((index / 6) * Math.PI * 2) * 78,
          y: (index) => Math.sin((index / 6) * Math.PI * 2) * 70,
          scale: 0,
          rotation: (index) => (index % 2 === 0 ? 135 : -135),
          autoAlpha: 0,
          duration: 0.72,
          stagger: 0.018,
          ease: 'power2.out',
        },
      );
    },
    { dependencies: [open, mode], scope: contentRef, revertOnUpdate: true },
  );

  function handleClose() {
    if (!isAwaitingWallet) onClose();
  }

  const countdown = `${String(Math.floor(secondsRemaining / 60)).padStart(2, '0')}:${String(secondsRemaining % 60).padStart(2, '0')}`;
  const displayCredits = order
    ? Number(order.credits).toLocaleString()
    : credits.toLocaleString();
  const displayUsd = order
    ? `${(Number(order.credits) / 100).toFixed(2)} USD`
    : `${(credits / 100).toFixed(2)} USD`;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      aria-labelledby="payment-dialog-title"
      slotProps={{ paper: { className: styles.dialog } }}
    >
      <div className={styles.content} ref={contentRef}>
        {!isAwaitingWallet && (
          <button
            className={styles.closeButton}
            type="button"
            aria-label="Close dialog"
            onClick={handleClose}
          >
            <CloseRounded fontSize="small" />
          </button>
        )}

        {mode === 'review' && order && (
          <>
            <h2 id="payment-dialog-title">Review top up</h2>
            <p className={styles.creditAmount}>
              <Image src="/dice.png" alt="" width={24} height={24} />
              <strong>{displayCredits}</strong>
              <span>credits</span>
            </p>
            <div className={styles.paymentAmount}>
              <span>Amount to pay</span>
              <strong>
                <Image
                  src="/solana-logo.svg"
                  alt=""
                  width={25}
                  height={22}
                />
                {order.expectedSol} SOL
              </strong>
            </div>
            <div className={styles.usdAmount}>
              <span>Total</span>
              <span>{displayUsd}</span>
            </div>
            <p className={styles.expiry}>
              {secondsRemaining > 0 ? (
                <>
                  Quote valid for <time>{countdown}</time>
                </>
              ) : (
                'Quote expired'
              )}
            </p>
            <button
              className={styles.primaryButton}
              type="button"
              disabled={secondsRemaining === 0}
              onClick={onPay}
            >
              Pay {order.expectedSol} SOL
            </button>
          </>
        )}

        {mode === 'processing' && (
          <div className={styles.feedback}>
            <WalletSpinner
              label={
                isPreparingPayment
                  ? 'Preparing payment'
                  : isAwaitingWallet
                    ? 'Waiting for wallet'
                    : 'Checking payment'
              }
            />
            <h2 id="payment-dialog-title">
              {isPreparingPayment
                ? 'Preparing payment'
                : isAwaitingWallet
                  ? 'Confirm in your wallet'
                  : 'Confirming payment'}
            </h2>
            <p>
              {statusError ??
                (isPreparingPayment
                  ? 'Preparing your transaction.'
                  : 'Your credits will appear after confirmation.')}
            </p>
            {!isAwaitingWallet && !isPreparingPayment && (
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={handleClose}
              >
                Close
              </button>
            )}
          </div>
        )}

        {mode === 'success' && (
          <div className={styles.feedback} role="status">
            <span className={styles.successAnimation}>
              <span className={styles.successIcon} ref={successIconRef}>
                <CheckRounded fontSize="large" />
              </span>
              {Array.from({ length: 6 }, (_, index) => (
                <span
                  className={styles.confetti}
                  key={index}
                  ref={(element) => {
                    if (element) confettiRefs.current[index] = element;
                  }}
                />
              ))}
            </span>
            <h2 id="payment-dialog-title">Top up successful</h2>
            <p>{displayCredits} credits added.</p>
            <button
              className={styles.primaryButton}
              type="button"
              onClick={handleClose}
            >
              Done
            </button>
          </div>
        )}

        {mode === 'error' && (
          <div className={styles.feedback} role="alert">
            <span className={styles.errorIcon}>
              <ErrorOutlineRounded fontSize="large" />
            </span>
            <h2 id="payment-dialog-title">Payment unsuccessful</h2>
            <p>{message ?? 'Could not complete the payment. Try again.'}</p>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={handleClose}
            >
              Close
            </button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
