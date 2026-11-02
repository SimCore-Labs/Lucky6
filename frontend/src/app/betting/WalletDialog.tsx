'use client';

import Close from '@mui/icons-material/Close';
import Image from 'next/image';
import { Dialog } from '@mui/material';
import { useIsWalletReady, useConnect, useWallets } from '@solana/kit-plugin-wallet/react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  requestAuthNonce,
  verifyAuthSignature,
  walletMeQueryKey,
} from '@/lib/api';
import { bytesToBase64, walletClient } from '@/lib/wallet';
import { useUiStore } from '@/store/ui/useUiStore';
import { WalletSpinner } from './WalletSpinner';
import styles from './wallet-dialog.module.css';

export function WalletDialog({
  open,
  onClose,
  sessionError,
}: {
  open: boolean;
  onClose: () => void;
  sessionError: string | null;
}) {
  const wallets = useWallets(walletClient);
  const isWalletReady = useIsWalletReady(walletClient);
  const { dispatchAsync: connect } = useConnect(walletClient);
  const queryClient = useQueryClient();
  const setWalletProfile = useUiStore((state) => state.setWalletProfile);
  const [isConnecting, setIsConnecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function connectWallet(wallet: (typeof wallets)[number]) {
    setIsConnecting(true);
    setErrorMessage(null);

    try {
      const [account] = await connect(wallet);
      if (!account) {
        throw new Error('The selected wallet did not return an account.');
      }

      const challenge = await requestAuthNonce(account.address);
      const signature = await walletClient.wallet.signMessage(
        new TextEncoder().encode(challenge.message),
      );
      const profile = await verifyAuthSignature({
        address: account.address,
        nonce: challenge.nonce,
        signature: bytesToBase64(signature),
        signatureEncoding: 'base64',
      });

      if (!profile.authenticated) {
        throw new Error('Wallet verification failed.');
      }

      setWalletProfile({
        walletId: profile.walletId,
        address: profile.address,
        balance: profile.balance,
      });
      queryClient.setQueryData(walletMeQueryKey, {
        walletId: profile.walletId,
        address: profile.address,
        balance: profile.balance,
      });
      onClose();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to connect this wallet.',
      );
    } finally {
      setIsConnecting(false);
    }
  }

  function handleClose() {
    if (!isConnecting) onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      aria-labelledby="wallet-dialog-title"
      slotProps={{ paper: { className: styles.dialog } }}
    >
      <div className={styles.content}>
        <button
          className={styles.closeButton}
          type="button"
          aria-label="Close dialog"
          disabled={isConnecting}
          onClick={handleClose}
        >
          <Close fontSize="small" />
        </button>
        <h2 id="wallet-dialog-title">Connect your wallet</h2>
        {sessionError && (
          <p className={styles.errorMessage} role="alert">
            Could not check your saved wallet session: {sessionError}
          </p>
        )}
        <div className={styles.walletList} aria-busy={isConnecting}>
          {!isWalletReady ? (
            <span className={styles.emptyMessage}>Looking for wallets…</span>
          ) : wallets.length === 0 ? (
            <span className={styles.emptyMessage}>No wallets found</span>
          ) : (
            wallets.map((wallet) => (
              <button
                className={styles.walletOption}
                key={wallet.name}
                type="button"
                disabled={isConnecting}
                onClick={() => void connectWallet(wallet)}
              >
                <span className={styles.walletLogo}>
                  <Image
                    src={wallet.icon}
                    alt=""
                    width={40}
                    height={40}
                    unoptimized
                  />
                </span>
                <span className={styles.walletName}>{wallet.name}</span>
              </button>
            ))
          )}
        </div>
        {errorMessage && (
          <p className={styles.errorMessage} role="alert">
            {errorMessage}
          </p>
        )}
        {isConnecting && (
          <div className={styles.loadingOverlay}>
            <WalletSpinner label="Connecting wallet" />
          </div>
        )}
      </div>
    </Dialog>
  );
}
