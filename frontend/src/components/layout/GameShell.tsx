'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AccountRole,
  appendTransactionMessageInstruction,
  createSolanaRpc,
  createTransactionMessage,
  getBase58Decoder,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signAndSendTransactionMessageWithSigners,
  address,
} from '@solana/kit';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Snackbar,
  TextField,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import {
  createPaymentOrder,
  getMyBets,
  getPaymentQuote,
  getPaymentOrder,
  getWalletMe,
  logoutWallet,
  submitPaymentOrder,
  type PaymentOrderResponse,
  type PaymentQuoteResponse,
} from '@/lib/api';
import { getTransferSolInstruction } from '@solana-program/system';
import { useWalletAccountTransactionSendingSigner } from '@solana/react';
import { bytesToBase64, walletClient } from '@/lib/wallet';
import {
  useConnectedWallet,
  useConnect,
  useDisconnect,
  useWallets,
} from '@solana/kit-plugin-wallet/react';
import { requestAuthNonce, verifyAuthSignature } from '@/lib/api';
import { useUiStore } from '@/store/ui/useUiStore';
import styles from './game-shell.module.css';

const navigation = [
  { href: '/', label: 'Lobby', symbol: '⌂' },
  { href: '/betting', label: 'Play', symbol: '◉' },
  { href: '/tv', label: 'TV', symbol: '▣' },
];

function shortAddress(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function formatCredits(balance: string) {
  const amount = Number(balance);
  return Number.isFinite(amount) ? amount.toLocaleString() : '—';
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    if ('status' in error && (error as { status?: number }).status === 404) {
      return fallback;
    }
    return error.message;
  }
  return fallback;
}

function PaymentSender({
  account,
  order,
  signature,
  disabled,
  onSignature,
  onBusyChange,
  onError,
  onSubmitted,
}: {
  account: NonNullable<ReturnType<typeof useConnectedWallet>>['account'];
  order: PaymentOrderResponse;
  signature: string;
  disabled: boolean;
  onSignature: (signature: string) => void;
  onBusyChange: (busy: boolean) => void;
  onError: (message: string) => void;
  onSubmitted: () => void;
}) {
  const signer = useWalletAccountTransactionSendingSigner(account, 'solana:mainnet');

  const pay = async () => {
    if (!signature && new Date(order.expiresAt).getTime() <= Date.now()) {
      onError('This payment order expired. Create a new order for a current price.');
      return;
    }
    onBusyChange(true);
    onError('');
    try {
      let transactionSignature = signature;
      if (!transactionSignature) {
        const rpc = createSolanaRpc(
          process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
            'https://api.mainnet-beta.solana.com',
        );
        const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
        const transfer = getTransferSolInstruction({
          source: signer,
          destination: address(order.treasuryAddress),
          amount: BigInt(order.expectedLamports),
        });
        const transferWithReference = {
          ...transfer,
          accounts: [
            ...transfer.accounts,
            { address: address(order.reference), role: AccountRole.READONLY },
          ],
        };
        const message = pipe(
          createTransactionMessage({ version: 'legacy' }),
          (value) => setTransactionMessageFeePayerSigner(signer, value),
          (value) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, value),
          (value) => appendTransactionMessageInstruction(transferWithReference, value),
        );
        const signatureBytes = await signAndSendTransactionMessageWithSigners(message);
        transactionSignature = getBase58Decoder().decode(signatureBytes);
        onSignature(transactionSignature);
      }

      await submitPaymentOrder(order.id, { signature: transactionSignature });
      onSubmitted();
    } catch (error) {
      onError(
        errorMessage(
          error,
          signature
            ? 'Could not submit the existing transaction for verification. Retry without sending again.'
            : 'Payment was not completed. Check your wallet and try again.',
        ),
      );
    } finally {
      onBusyChange(false);
    }
  };

  return (
    <Button variant="contained" onClick={pay} disabled={disabled}>
      {signature ? 'Retry verification' : 'Pay with Sol'}
    </Button>
  );
}

export function GameShell({ children }: Readonly<{ children: ReactNode }>) {
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const wallets = useWallets(walletClient);
  const connected = useConnectedWallet(walletClient);
  const connectAction = useConnect(walletClient);
  const disconnectAction = useDisconnect(walletClient);
  const walletProfile = useUiStore((state) => state.walletProfile);
  const setWalletProfile = useUiStore((state) => state.setWalletProfile);
  const showToast = useUiStore((state) => state.showToast);
  const toast = useUiStore((state) => state.toast);
  const clearToast = useUiStore((state) => state.clearToast);
  const [panel, setPanel] = useState<'wallet' | 'topup' | 'history' | null>(null);
  const [busy, setBusy] = useState(false);
  const [walletError, setWalletError] = useState('');
  const [topupAmount, setTopupAmount] = useState('100');
  const [quote, setQuote] = useState<PaymentQuoteResponse | null>(null);
  const [paymentOrder, setPaymentOrder] = useState<PaymentOrderResponse | null>(null);
  const [paymentSignature, setPaymentSignature] = useState('');
  const [paymentSubmitted, setPaymentSubmitted] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState('');
  const sessionQuery = useQuery({
    queryKey: ['wallet', 'session'],
    queryFn: ({ signal }) => getWalletMe(signal),
    retry: false,
  });
  const paymentStatusQuery = useQuery({
    queryKey: ['payments', paymentOrder?.id],
    queryFn: ({ signal }) => getPaymentOrder(paymentOrder!.id, signal),
    enabled: panel === 'topup' && Boolean(paymentOrder),
    retry: false,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'CREDITED' ||
        status === 'OVERPAID' ||
        status === 'EXPIRED' ||
        status === 'FAILED' ||
        status === 'UNDERPAID' ||
        status === 'REQUIRES_REVIEW'
        ? false
        : 3000;
    },
  });

  useEffect(() => {
    if (sessionQuery.data) {
      setWalletProfile(sessionQuery.data);
    }
  }, [sessionQuery.data, setWalletProfile]);

  useEffect(() => {
    if (paymentStatusQuery.data?.status === 'CREDITED') {
      void getWalletMe()
        .then(setWalletProfile)
        .catch((error: unknown) => {
          setPaymentMessage(errorMessage(error, 'Payment was credited, but balance refresh failed.'));
        });
    }
  }, [paymentStatusQuery.data?.status, setWalletProfile]);

  const historyQuery = useQuery({
    queryKey: ['bets', 'mine', walletProfile?.walletId],
    queryFn: ({ signal }) => getMyBets(signal),
    enabled: panel === 'history' && Boolean(walletProfile),
    retry: false,
  });

  const authenticate = async (address: string) => {
    const challenge = await requestAuthNonce(address);
    const signature = await walletClient.wallet.signMessage(
      new TextEncoder().encode(challenge.message),
    );
    const result = await verifyAuthSignature({
      address,
      nonce: challenge.nonce,
      signature: bytesToBase64(signature),
      signatureEncoding: 'base64',
    });
    setWalletProfile({
      walletId: result.walletId,
      address: result.address,
      balance: result.balance,
    });
    queryClient.setQueryData(['wallet', 'session'], result);
    setWalletError('');
    setPanel(null);
    showToast('Wallet authenticated. Balance is shown in SIM credits.', 'success');
  };

  const connectAndAuthenticate = async (wallet = connected?.wallet) => {
    setBusy(true);
    setWalletError('');
    try {
      const account = wallet
        ? connected?.account
        : (await connectAction.dispatchAsync(wallets[0])).at(0);
      if (!account) throw new Error('The wallet did not return an account.');
      await authenticate(account.address);
    } catch (error) {
      setWalletError(
        errorMessage(error, 'Wallet authentication is unavailable right now.'),
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    try {
      await logoutWallet();
      await disconnectAction.dispatchAsync();
      queryClient.removeQueries({ queryKey: ['wallet', 'session'] });
      setWalletProfile(null);
      setPanel(null);
    } catch (error) {
      setWalletError(errorMessage(error, 'Could not disconnect this wallet.'));
    } finally {
      setBusy(false);
    }
  };

  const handleQuote = async () => {
    if (!walletProfile) {
      setPanel('wallet');
      return;
    }
    setBusy(true);
    setPaymentMessage('');
    setQuote(null);
    setPaymentOrder(null);
    setPaymentSignature('');
    setPaymentSubmitted(false);
    try {
      const paymentQuote = await getPaymentQuote({
        credits: Number(topupAmount),
      });
      setQuote(paymentQuote);
    } catch (error) {
      setPaymentMessage(
        errorMessage(error, 'Payment service is unavailable. No top-up was made.'),
      );
    } finally {
      setBusy(false);
    }
  };

  const handleCreatePaymentOrder = async () => {
    setBusy(true);
    setPaymentMessage('');
    try {
      const order = await createPaymentOrder({
        credits: Number(topupAmount),
        idempotencyKey: crypto.randomUUID(),
      });
      setPaymentOrder(order);
      setPaymentSignature('');
      setPaymentSubmitted(false);
      setQuote(null);
    } catch (error) {
      setPaymentMessage(errorMessage(error, 'Could not create a payment order.'));
    } finally {
      setBusy(false);
    }
  };

  const handleNewTopup = () => {
    setQuote(null);
    setPaymentOrder(null);
    setPaymentSignature('');
    setPaymentSubmitted(false);
    setPaymentMessage('');
  };

  const showWalletPanel = () => {
    setWalletError('');
    setPanel('wallet');
  };
  const paymentStatus = paymentStatusQuery.data?.status ?? paymentOrder?.status;
  const terminalPaymentStatuses = [
    'CREDITED',
    'OVERPAID',
    'EXPIRED',
    'FAILED',
    'UNDERPAID',
    'REQUIRES_REVIEW',
  ];
  const paymentFlowActive =
    Boolean(paymentSignature || paymentSubmitted) &&
    !terminalPaymentStatuses.includes(paymentStatus ?? '');

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="Lucky Six lobby">
          <span className={styles.brandMark} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>lucky<span className={styles.brandAccent}>6</span></span>
        </Link>

        <nav className={styles.desktopNav} aria-label="Main navigation">
          {navigation.map((item) => (
            <Link
              className={`${styles.navLink} ${pathname === item.href ? styles.navActive : ''}`}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className={styles.headerActions}>
          {walletProfile ? (
            <>
              <button
                className={styles.balanceButton}
                type="button"
                onClick={() => {
                  setPaymentMessage('');
                  setQuote(null);
                  setPanel('topup');
                }}
                aria-label={`Top up. Balance ${formatCredits(walletProfile.balance)} SIM credits`}
              >
                <span className={styles.balanceAmount}>{formatCredits(walletProfile.balance)}</span>
                <span className={styles.balanceUnit}>SIM</span>
                <span className={styles.topupMark} aria-hidden="true">+</span>
              </button>
              <button
                className={styles.accountButton}
                type="button"
                onClick={() => setPanel('history')}
                aria-label={`Account ${shortAddress(walletProfile.address)}. Open bet history`}
              >
                <span className={styles.accountDot} />
                <span>{shortAddress(walletProfile.address)}</span>
              </button>
            </>
          ) : (
            <button className={styles.connectButton} type="button" onClick={showWalletPanel}>
              Connect wallet
            </button>
          )}
        </div>
      </header>

      <main className={styles.content}>{children}</main>

      <nav className={styles.mobileNav} aria-label="Main navigation">
        {navigation.map((item) => (
          <Link
            className={`${styles.mobileNavLink} ${pathname === item.href ? styles.mobileNavActive : ''}`}
            href={item.href}
            key={item.href}
          >
            <span aria-hidden="true">{item.symbol}</span>
            {item.label}
          </Link>
        ))}
        <button
          className={styles.mobileNavLink}
          type="button"
          onClick={() => setPanel(walletProfile ? 'history' : 'wallet')}
        >
          <span aria-hidden="true">♙</span>
          Account
        </button>
      </nav>

      <Dialog
        open={panel === 'wallet'}
        onClose={() => {
          if (!busy) setPanel(null);
        }}
        aria-labelledby="wallet-dialog-title"
        aria-describedby="wallet-dialog-description"
        fullWidth
        maxWidth="xs"
        slotProps={{ paper: { className: styles.dialogPaper } }}
      >
        <DialogTitle id="wallet-dialog-title" className={styles.dialogTitle}>
          {walletProfile ? 'Wallet connected' : 'Connect a wallet'}
        </DialogTitle>
        <DialogContent className={styles.dialogContent}>
          <p id="wallet-dialog-description" className={styles.dialogCopy}>
            Sign a one-time message to authenticate. The message does not authorize a transaction.
          </p>
          {walletError && <Alert severity="error">{walletError}</Alert>}
          {walletProfile ? (
            <div className={styles.connectedWallet}>
              <span className={styles.accountDot} />
              <div>
                <strong>{shortAddress(walletProfile.address)}</strong>
                <span>{formatCredits(walletProfile.balance)} SIM credits</span>
              </div>
            </div>
          ) : connected ? (
            <div className={styles.walletOption}>
              <span className={styles.walletIcon}>{connected.wallet.name.slice(0, 1)}</span>
              <div className={styles.walletDetails}>
                <strong>{connected.wallet.name}</strong>
                <span>{shortAddress(connected.account.address)}</span>
              </div>
              <Button
                variant="contained"
                onClick={() => connectAndAuthenticate(connected.wallet)}
                disabled={busy}
              >
                {busy ? <CircularProgress size={18} /> : 'Sign in'}
              </Button>
            </div>
          ) : wallets.length ? (
            <div className={styles.walletList}>
              {wallets.map((wallet) => (
                <button
                  className={styles.walletOption}
                  type="button"
                  key={wallet.name}
                  onClick={() => connectAndAuthenticate(wallet)}
                  disabled={busy}
                >
                  <span className={styles.walletIcon}>{wallet.name.slice(0, 1)}</span>
                  <span className={styles.walletDetails}>
                    <strong>{wallet.name}</strong>
                    <span>Solana wallet</span>
                  </span>
                  {busy ? <CircularProgress size={18} /> : <span aria-hidden="true">→</span>}
                </button>
              ))}
            </div>
          ) : (
            <div className={styles.emptyWallet}>
              <span className={styles.emptyWalletIcon}>◇</span>
              <strong>No compatible wallet found</strong>
              <span>Install a Solana Wallet Standard wallet, then refresh this page.</span>
            </div>
          )}
        </DialogContent>
        <DialogActions className={styles.dialogActions}>
          {walletProfile && (
            <Button color="inherit" onClick={handleDisconnect} disabled={busy}>
              Disconnect
            </Button>
          )}
          <Button color="inherit" onClick={() => setPanel(null)} disabled={busy}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={panel === 'topup'}
        onClose={() => {
          if (!busy) setPanel(null);
        }}
        aria-labelledby="topup-dialog-title"
        aria-describedby="topup-dialog-description"
        fullWidth
        maxWidth="xs"
        slotProps={{ paper: { className: styles.dialogPaper } }}
      >
        <DialogTitle id="topup-dialog-title" className={styles.dialogTitle}>Add credits</DialogTitle>
        <DialogContent className={styles.dialogContent}>
          <p id="topup-dialog-description" className={styles.dialogCopy}>
            100 credits = $1. Purchases use SOL; winnings are non-withdrawable credits.
          </p>
          {paymentMessage && (
            <Alert severity="error" className={styles.modalAlert}>
              {paymentMessage}
            </Alert>
          )}
          {quote && (
            <div className={styles.quoteSummary}>
              <span>Estimated payment · SOL/USD ${quote.solPriceUsd.toLocaleString()}</span>
              <strong>{quote.expectedSol} SOL</strong>
              <small>
                {quote.credits} credits · quote expires in {quote.expiresInSeconds} seconds
              </small>
            </div>
          )}
          {paymentOrder && (
            <div className={styles.quoteSummary}>
              <span>{paymentOrder.credits} credits · payment order</span>
              <strong>{paymentOrder.expectedSol} SOL</strong>
              <small>
                To {shortAddress(paymentOrder.treasuryAddress)} · expires{' '}
                {new Date(paymentOrder.expiresAt).toLocaleTimeString()}
              </small>
              {paymentSubmitted && (
                <small>
                  Payment status: {paymentStatusQuery.data?.status ?? 'SUBMITTED'}
                </small>
              )}
              {paymentSignature && (
                <small>
                  Transaction: {paymentSignature}
                </small>
              )}
            </div>
          )}
          {paymentOrder && connected && connected.account.address !== walletProfile?.address && (
            <Alert severity="warning">
              The connected wallet differs from the authenticated wallet. Reconnect and sign in with{' '}
              {walletProfile ? shortAddress(walletProfile.address) : 'your account wallet'}.
            </Alert>
          )}
          {paymentOrder && !paymentSubmitted && connected &&
            connected.account.address === walletProfile?.address && (
              <PaymentSender
                account={connected.account}
                order={paymentOrder}
                signature={paymentSignature}
                disabled={busy}
                onSignature={setPaymentSignature}
                onBusyChange={setBusy}
                onError={setPaymentMessage}
                onSubmitted={() => {
                  setPaymentSubmitted(true);
                  setPaymentMessage('');
                  showToast('Transaction submitted. Waiting for on-chain verification.', 'info');
                }}
              />
            )}
          {paymentOrder && paymentStatusQuery.data?.status === 'CREDITED' && (
            <Alert severity="success">
              Credits received. Your new balance is {formatCredits(walletProfile?.balance ?? '0')} SIM.
            </Alert>
          )}
          {paymentOrder && paymentStatusQuery.data?.status === 'OVERPAID' && (
            <Alert severity="error">
              The transfer amount did not match the order. Credits were not added; contact support with your transaction signature.
            </Alert>
          )}
          {paymentOrder && paymentStatusQuery.data?.status === 'UNDERPAID' && (
            <Alert severity="error">
              The transfer was below the quoted amount. Credits were not added; contact support with your transaction signature.
            </Alert>
          )}
          {paymentOrder && paymentStatusQuery.data?.status === 'FAILED' && (
            <Alert severity="error">
              The Solana transaction failed. No credits were added.
            </Alert>
          )}
          {paymentOrder && paymentStatusQuery.data?.status === 'REQUIRES_REVIEW' && (
            <Alert severity="error">
              The payment could not be matched safely. No credits were added; contact support with your transaction signature.
            </Alert>
          )}
          {paymentStatusQuery.data?.status === 'EXPIRED' && paymentSignature && (
            <Alert severity="error">
              The transaction arrived outside the payment window and was not credited. Contact support with the transaction signature above.
            </Alert>
          )}
          {paymentOrder && paymentStatusQuery.isError && (
            <Alert severity="error">
              Could not refresh payment status. Your submitted transaction remains linked to this order.
            </Alert>
          )}
          {paymentStatusQuery.data?.status === 'EXPIRED' && (
            <Alert severity="warning">This payment order expired. Create a new order for a current price.</Alert>
          )}
          <TextField
            label="Credits"
            type="number"
            value={topupAmount}
            disabled={paymentFlowActive}
            onChange={(event) => {
              setTopupAmount(event.target.value);
              handleNewTopup();
            }}
            slotProps={{ htmlInput: { min: 100, max: 100000, step: 1 } }}
            fullWidth
            size="small"
            className={styles.amountInput}
          />
        </DialogContent>
        <DialogActions className={styles.dialogActions}>
          <Button color="inherit" onClick={() => setPanel(null)} disabled={busy}>Close</Button>
          <Button
            color="inherit"
            onClick={handleNewTopup}
            disabled={busy || paymentFlowActive}
          >
            New order
          </Button>
          <Button
            variant="contained"
            onClick={quote ? handleCreatePaymentOrder : handleQuote}
            disabled={
              busy ||
              Boolean(paymentOrder) ||
              !Number.isInteger(Number(topupAmount)) ||
              Number(topupAmount) < 100 ||
              Number(topupAmount) > 100000
            }
          >
            {busy ? <CircularProgress size={18} /> : quote ? 'Create order' : 'Get quote'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={panel === 'history'}
        onClose={() => setPanel(null)}
        aria-labelledby="history-dialog-title"
        aria-describedby="history-dialog-description"
        fullWidth
        maxWidth="sm"
        slotProps={{ paper: { className: styles.dialogPaper } }}
      >
        <DialogTitle id="history-dialog-title" className={styles.dialogTitle}>Bet history</DialogTitle>
        <DialogContent className={styles.dialogContent}>
          <p id="history-dialog-description" className={styles.dialogCopy}>
            Your recent activity, if the account service is available.
          </p>
          {!walletProfile ? (
            <div className={styles.emptyHistory}>Connect and authenticate to view account activity.</div>
          ) : historyQuery.isPending ? (
            <div className={styles.loadingState}><CircularProgress size={20} /> Loading history…</div>
          ) : historyQuery.isError ? (
            <Alert severity="error">
              {errorMessage(historyQuery.error, 'Bet history service is unavailable.')}
            </Alert>
          ) : historyQuery.data?.length ? (
            <div className={styles.historyList}>
              {historyQuery.data.map((bet) => (
                <div className={styles.historyRow} key={bet.id}>
                  <div>
                    <strong>Draw #{bet.drawNumber}</strong>
                    <span>{new Date(bet.createdAt).toLocaleString()}</span>
                    <span>
                      {bet.pickSixTicket
                        ? `Pick six · ${bet.pickSixTicket.numbers.join(' · ')}`
                        : bet.selections?.[0]
                          ? `${bet.selections[0].marketTitle} · ${bet.selections[0].selectionLabel}`
                          : 'Bet details unavailable'}
                    </span>
                  </div>
                  <div className={styles.historyValue}>
                    <strong>{bet.stake} SIM</strong>
                    <span>
                      {bet.settlement
                        ? `${bet.settlement.status.replaceAll('_', ' ')} · ${bet.settlement.payout} SIM`
                        : bet.status.replaceAll('_', ' ')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.emptyHistory}>No activity to display.</div>
          )}
        </DialogContent>
        <DialogActions className={styles.dialogActions}>
          <Button color="inherit" onClick={() => setPanel(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={4000}
        onClose={clearToast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast ? (
          <Alert onClose={clearToast} severity={toast.tone} variant="filled">
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </div>
  );
}
