'use client';

import {
  AccountRole,
  address,
  appendTransactionMessageInstruction,
  createSolanaRpc,
  createTransactionMessage,
  getBase58Decoder,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  isTransactionMessageWithSingleSendingSigner,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signAndSendTransactionMessageWithSigners,
  signTransactionMessageWithSigners,
} from '@solana/kit';
import { getTransferSolInstruction } from '@solana-program/system';
import { useConnectedWallet, useIsWalletReady } from '@solana/kit-plugin-wallet/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { BettingHeader } from '@/app/betting/BettingHeader';
import { WalletDialog } from '@/app/betting/WalletDialog';
import { WalletSpinner } from '@/app/betting/WalletSpinner';
import {
  ApiError,
  createIdempotencyKey,
  createPaymentOrder,
  getPaymentOrder,
  getWalletMe,
  submitPaymentOrder,
  walletMeQueryKey,
  type PaymentOrderResponse,
  type WalletProfileResponse,
} from '@/lib/api';
import { walletClient } from '@/lib/wallet';
import { useUiStore } from '@/store/ui/useUiStore';
import { PaymentDialog, type PaymentDialogMode } from './PaymentDialog';
import styles from './page.module.css';

const pageEntryDelay = 2_000;
const quickAmounts = [100, 500, 1_000, 5_000] as const;
const terminalPaymentStatuses = new Set([
  'CREDITED',
  'FAILED',
  'UNDERPAID',
  'OVERPAID',
  'EXPIRED',
  'REQUIRES_REVIEW',
]);

function getPaymentErrorMessage(error: unknown) {
  if (
    error instanceof Error &&
    /reject|cancel|denied/i.test(error.message)
  ) {
    return 'Payment was cancelled.';
  }
  return 'Could not complete the payment. Try again.';
}

function getStatusErrorMessage(status: string) {
  switch (status) {
    case 'UNDERPAID':
      return 'The payment amount was too low.';
    case 'OVERPAID':
      return 'The payment needs review.';
    case 'EXPIRED':
      return 'This payment quote has expired.';
    case 'REQUIRES_REVIEW':
      return 'The payment needs review.';
    default:
      return 'The payment could not be verified.';
  }
}

export default function TopUpPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [amountInput, setAmountInput] = useState('100');
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [isPreparingPayment, setIsPreparingPayment] = useState(false);
  const [isAwaitingWallet, setIsAwaitingWallet] = useState(false);
  const [isSubmittingSignature, setIsSubmittingSignature] = useState(false);
  const [walletDialogOpen, setWalletDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<PaymentDialogMode>('closed');
  const [order, setOrder] = useState<PaymentOrderResponse | null>(null);
  const [dialogMessage, setDialogMessage] = useState<string | null>(null);
  const [hasSubmittedPayment, setHasSubmittedPayment] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);
  const paymentCancelledRef = useRef(false);
  const connectedWallet = useConnectedWallet(walletClient);
  const isWalletReady = useIsWalletReady(walletClient);
  const queryClient = useQueryClient();
  const setWalletProfile = useUiStore((state) => state.setWalletProfile);
  const walletSession = useQuery({
    queryKey: walletMeQueryKey,
    queryFn: async ({ signal }) => {
      try {
        return await getWalletMe(signal);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    enabled: isWalletReady,
    retry: false,
  });
  const walletProfile = walletSession.data;
  const isWalletAuthenticated = Boolean(
    connectedWallet?.signer &&
      walletProfile &&
      connectedWallet.account.address === walletProfile.address,
  );
  const walletActionLabel = walletProfile
    ? connectedWallet?.signer
      ? 'Switch wallet'
      : 'Reconnect wallet'
    : connectedWallet?.signer
      ? 'Verify wallet'
      : 'Connect wallet';
  const walletActionDescription = walletProfile
    ? connectedWallet?.signer
      ? 'Use the wallet linked to your Lucky6 account to continue.'
      : 'Reconnect the wallet linked to your Lucky6 account to continue.'
    : connectedWallet?.signer
      ? 'Verify your wallet to continue.'
      : 'Connect your wallet to continue.';
  const selectedAmount = Number(amountInput);
  const activeOrderId = order?.id;
  const isAmountValid =
    /^[1-9]\d*$/.test(amountInput) &&
    selectedAmount >= 100 &&
    selectedAmount <= 100_000;

  useEffect(() => {
    const timeoutId = window.setTimeout(
      () => setIsLoading(false),
      pageEntryDelay,
    );
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!activeOrderId || !hasSubmittedPayment) return;
    const paymentOrderId = activeOrderId;

    let active = true;
    let timeoutId: number | undefined;
    const controller = new AbortController();

    async function refreshOrder() {
      try {
        const latestOrder = await getPaymentOrder(
          paymentOrderId,
          controller.signal,
        );
        if (!active) return;
        setOrder(latestOrder);
        setStatusError(null);
        if (latestOrder.status === 'CREDITED') {
          setHasSubmittedPayment(false);
          setDialogMode('success');
          await queryClient.invalidateQueries({ queryKey: walletMeQueryKey });
          const updatedProfile =
            queryClient.getQueryData<WalletProfileResponse | null>(
              walletMeQueryKey,
            );
          if (updatedProfile) {
            setWalletProfile({
              walletId: updatedProfile.walletId,
              address: updatedProfile.address,
              balance: updatedProfile.balance,
            });
          }
        } else if (terminalPaymentStatuses.has(latestOrder.status)) {
          setHasSubmittedPayment(false);
          setDialogMessage(getStatusErrorMessage(latestOrder.status));
          setDialogMode('error');
        }
      } catch {
        if (active) setStatusError('Checking payment status…');
      } finally {
        if (active) {
          timeoutId = window.setTimeout(() => void refreshOrder(), 4_000);
        }
      }
    }

    void refreshOrder();
    return () => {
      active = false;
      controller.abort();
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [
    activeOrderId,
    hasSubmittedPayment,
    queryClient,
    setWalletProfile,
  ]);

  async function requestPaymentOrder() {
    if (!isAmountValid) return;
    if (!isWalletAuthenticated) {
      setWalletDialogOpen(true);
      return;
    }

    setIsCreatingOrder(true);
    setDialogMessage(null);
    setStatusError(null);
    try {
      const idempotencyKey =
        idempotencyKeyRef.current ?? createIdempotencyKey();
      idempotencyKeyRef.current = idempotencyKey;
      const nextOrder = await createPaymentOrder({
        credits: selectedAmount,
        idempotencyKey,
      });
      idempotencyKeyRef.current = null;
      setOrder(nextOrder);
      setDialogMode('review');
    } catch (error) {
      setDialogMessage(
        error instanceof Error
          ? error.message
          : 'Could not prepare your top-up. Please try again.',
      );
      setDialogMode('error');
    } finally {
      setIsCreatingOrder(false);
    }
  }

  async function payForOrder() {
    if (!order || !connectedWallet?.signer || !walletProfile) return;
    if (connectedWallet.account.address !== walletProfile.address) {
      setDialogMessage('Reconnect the wallet used for this top-up.');
      setDialogMode('error');
      return;
    }

    paymentCancelledRef.current = false;
    setIsPreparingPayment(true);
    setDialogMode('processing');
    setDialogMessage(null);
    setStatusError(null);

    let signature: string;
    try {
      const rpc = createSolanaRpc(
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
          'https://api.mainnet-beta.solana.com',
      );
      const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
      const version = connectedWallet.supportedTransactionVersions.has('legacy')
        ? 'legacy'
        : connectedWallet.supportedTransactionVersions.has(0)
          ? 0
          : null;
      if (version === null) {
        throw new Error('This wallet does not support Solana transactions.');
      }

      const transfer = getTransferSolInstruction({
        source: connectedWallet.signer,
        destination: address(order.treasuryAddress),
        amount: BigInt(order.expectedLamports),
      });
      const paymentInstruction = {
        ...transfer,
        accounts: [
          ...transfer.accounts,
          { address: address(order.reference), role: AccountRole.READONLY },
        ],
      };
      const transactionMessage = appendTransactionMessageInstruction(
        paymentInstruction,
        setTransactionMessageLifetimeUsingBlockhash(
          latestBlockhash,
          setTransactionMessageFeePayerSigner(
            connectedWallet.signer,
            createTransactionMessage({ version }),
          ),
        ),
      );
      if (paymentCancelledRef.current) {
        setIsPreparingPayment(false);
        return;
      }

      setIsPreparingPayment(false);
      setIsAwaitingWallet(true);
      if (isTransactionMessageWithSingleSendingSigner(transactionMessage)) {
        const signatureBytes =
          await signAndSendTransactionMessageWithSigners(transactionMessage);
        signature = getBase58Decoder().decode(signatureBytes);
      } else {
        const signedTransaction =
          await signTransactionMessageWithSigners(transactionMessage);
        signature = getSignatureFromTransaction(signedTransaction);
        setIsAwaitingWallet(false);
        setIsSubmittingSignature(true);
        try {
          await rpc
            .sendTransaction(getBase64EncodedWireTransaction(signedTransaction))
            .send();
        } catch {
          setStatusError('Checking transaction status…');
        }
      }
    } catch (error) {
      if (!paymentCancelledRef.current) {
        setDialogMessage(getPaymentErrorMessage(error));
        setDialogMode('error');
      }
      setIsPreparingPayment(false);
      setIsAwaitingWallet(false);
      setIsSubmittingSignature(false);
      return;
    }

    setIsPreparingPayment(false);
    setIsAwaitingWallet(false);
    setIsSubmittingSignature(true);
    try {
      const submittedOrder = await submitPaymentOrder(order.id, { signature });
      setOrder((current) =>
        current?.id === submittedOrder.id
          ? { ...current, status: submittedOrder.status }
          : current,
      );
    } catch {
      setStatusError('Checking payment status…');
    } finally {
      setIsSubmittingSignature(false);
      setHasSubmittedPayment(true);
    }
  }

  function closePaymentDialog() {
    if (isAwaitingWallet) return;
    if (isPreparingPayment) paymentCancelledRef.current = true;
    setDialogMode('closed');
    setDialogMessage(null);
    if (!hasSubmittedPayment && !isSubmittingSignature) setOrder(null);
  }

  if (isLoading) {
    return (
      <main className={styles.loadingPage} aria-busy="true">
        <div className={styles.loadingContent} role="status">
          <WalletSpinner label="Loading top-up page" />
        </div>
      </main>
    );
  }

  return (
    <div className={styles.page}>
      <BettingHeader />
      <main className={styles.content}>
        <h1 id="top-up-heading">Top up</h1>
        <section className={styles.panel} aria-labelledby="top-up-heading">
          <div className={styles.panelContent}>
            <div className={styles.amountOptions} role="group" aria-label="Top-up amount">
              {quickAmounts.map((amount) => (
                <button
                  className={`${styles.amountOption} ${
                    selectedAmount === amount ? styles.selectedAmount : ''
                  }`}
                  type="button"
                  key={amount}
                  aria-pressed={selectedAmount === amount}
                  onClick={() => {
                    setAmountInput(String(amount));
                    idempotencyKeyRef.current = null;
                  }}
                >
                  <span className={styles.creditAmount}>
                    <Image
                      src="/dice.png"
                      alt=""
                      aria-hidden="true"
                      width={22}
                      height={22}
                    />
                    <strong>{amount.toLocaleString()}</strong>
                  </span>
                  <span className={styles.creditLabel}>credits</span>
                  <small>{(amount / 100).toFixed(2)} USD</small>
                </button>
              ))}
            </div>
            <label className={styles.manualAmount}>
              <span>Or enter an amount</span>
              <input
                type="number"
                min="100"
                max="100000"
                step="1"
                inputMode="numeric"
                value={amountInput}
                aria-invalid={amountInput.length > 0 && !isAmountValid}
                onChange={(event) => {
                  setAmountInput(event.currentTarget.value);
                  idempotencyKeyRef.current = null;
                }}
              />
              <small>Enter 100–100,000 credits.</small>
            </label>
            {!isWalletAuthenticated && !walletSession.isError && (
              <div className={styles.walletPrompt}>
                <button
                  className={styles.connectButton}
                  type="button"
                  onClick={() => setWalletDialogOpen(true)}
                >
                  {walletActionLabel}
                </button>
                <span>{walletActionDescription}</span>
              </div>
            )}
            {walletSession.isError && (
              <p className={styles.quoteError} role="alert">
                {walletSession.error instanceof Error
                  ? walletSession.error.message
                  : 'Could not check your wallet session.'}
              </p>
            )}
            <div className={styles.continueRow}>
              <button
                className={styles.continueButton}
                type="button"
                disabled={
                  isCreatingOrder ||
                  isPreparingPayment ||
                  isSubmittingSignature ||
                  hasSubmittedPayment ||
                  !isAmountValid ||
                  !isWalletAuthenticated
                }
                aria-busy={
                  isCreatingOrder ||
                  isPreparingPayment ||
                  isSubmittingSignature ||
                  hasSubmittedPayment
                }
                onClick={() => void requestPaymentOrder()}
              >
                {(isCreatingOrder ||
                  isPreparingPayment ||
                  isSubmittingSignature ||
                  hasSubmittedPayment) && (
                  <WalletSpinner
                    label={
                      hasSubmittedPayment || isSubmittingSignature
                        ? 'Checking payment'
                        : isPreparingPayment
                          ? 'Preparing payment'
                          : 'Preparing top-up'
                    }
                    size="small"
                  />
                )}
                Continue
              </button>
            </div>
          </div>
        </section>
      </main>
      <WalletDialog
        open={walletDialogOpen}
        onClose={() => setWalletDialogOpen(false)}
        sessionError={
          walletSession.error instanceof Error
            ? walletSession.error.message
            : null
        }
      />
      <PaymentDialog
        open={dialogMode !== 'closed'}
        mode={dialogMode}
        order={order}
        credits={selectedAmount}
        message={dialogMessage}
        statusError={statusError}
        isPreparingPayment={isPreparingPayment}
        isAwaitingWallet={isAwaitingWallet}
        onClose={closePaymentDialog}
        onPay={() => void payForOrder()}
      />
    </div>
  );
}
