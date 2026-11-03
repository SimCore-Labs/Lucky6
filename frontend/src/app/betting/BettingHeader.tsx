'use client';

import WalletOutlined from '@mui/icons-material/WalletOutlined';
import { useConnectedWallet, useDisconnect, useIsWalletReady } from '@solana/kit-plugin-wallet/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useGSAP } from '@gsap/react';
import Image from 'next/image';
import gsap from 'gsap';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ApiError, getWalletMe, logoutWallet, walletMeQueryKey } from '@/lib/api';
import { useSolanaNetwork } from '@/providers/SolanaNetworkProvider';
import { useUiStore } from '@/store/ui/useUiStore';
import diceLogo from '../../../dice-png-27643.png';
import styles from './betting-header.module.css';
import { WalletDialog } from './WalletDialog';
import { WalletSpinner } from './WalletSpinner';

gsap.registerPlugin(useGSAP);

function formatBalance(balance: string | undefined) {
  const value = Number(balance ?? 0);
  return Number.isFinite(value) ? value.toFixed(2) : '0.00';
}

function shortenAddress(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function BettingHeader({ loading = false }: { loading?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  const walletControlRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { network, setNetwork, walletClient } = useSolanaNetwork();
  const isWalletReady = useIsWalletReady(walletClient);
  const connectedWallet = useConnectedWallet(walletClient);
  const { dispatchAsync: disconnect } = useDisconnect(walletClient);
  const queryClient = useQueryClient();
  const walletDialogOpen = useUiStore((state) => state.walletModalOpen);
  const setWalletModalOpen = useUiStore((state) => state.setWalletModalOpen);
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
  const isLoading = loading || !isWalletReady || walletSession.isPending;
  const isConnected = Boolean(connectedWallet || walletProfile);
  const isWalletSessionMatched = Boolean(
    connectedWallet?.signer &&
      walletProfile &&
      connectedWallet.account.address === walletProfile.address,
  );
  const walletAddress =
    connectedWallet?.account.address ?? walletProfile?.address;
  const walletActionLabel = connectedWallet?.signer
    ? 'Verify wallet'
    : 'Reconnect wallet';

  useGSAP(
    () => {
      if (!menuOpen || !menuRef.current) return;

      const reducedMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches;
      gsap.fromTo(
        menuRef.current,
        { autoAlpha: 0, y: -6, scale: 0.98 },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: reducedMotion ? 0 : 0.18,
          ease: 'power2.out',
        },
      );
    },
    { dependencies: [menuOpen], scope: walletControlRef, revertOnUpdate: true },
  );

  useEffect(() => {
    if (!menuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !walletControlRef.current?.contains(event.target)
      ) {
        setMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  async function handleDisconnect() {
    setIsDisconnecting(true);
    setDisconnectError(null);
    try {
      await logoutWallet();
      queryClient.setQueryData(walletMeQueryKey, null);
      setWalletProfile(null);
      if (connectedWallet) await disconnect();
      setMenuOpen(false);
    } catch (error) {
      setDisconnectError(
        error instanceof Error ? error.message : 'Unable to disconnect wallet.',
      );
    } finally {
      setIsDisconnecting(false);
    }
  }

  async function handleNetworkChange(nextNetwork: 'mainnet' | 'devnet') {
    if (nextNetwork === network || isDisconnecting) return;
    setIsDisconnecting(true);
    setDisconnectError(null);
    try {
      if (connectedWallet || walletProfile) {
        await logoutWallet();
        queryClient.setQueryData(walletMeQueryKey, null);
        setWalletProfile(null);
      }
      if (connectedWallet) await disconnect();
      setMenuOpen(false);
      setWalletModalOpen(false);
      setNetwork(nextNetwork);
    } catch (error) {
      setDisconnectError(
        error instanceof Error ? error.message : 'Unable to switch network.',
      );
    } finally {
      setIsDisconnecting(false);
    }
  }

  return (
    <header className={styles.header} aria-busy={isLoading}>
      <Link className={styles.brandLogo} href="/" aria-label="Lucky6 home">
        <Image
          className={styles.brandDice}
          src={diceLogo}
          alt=""
          aria-hidden="true"
          priority
        />
        <span className={styles.brandName}>
          LUCKY<span>6</span>
        </span>
      </Link>
      <div className={styles.actions}>
        <label className={styles.networkControl}>
          <select
            className={styles.networkStatus}
            aria-label="Solana network"
            value={network}
            disabled={isDisconnecting}
            onChange={(event) => {
              const nextNetwork = event.currentTarget.value;
              if (nextNetwork === 'mainnet' || nextNetwork === 'devnet') {
                void handleNetworkChange(nextNetwork);
              }
            }}
          >
            <option value="mainnet">Mainnet</option>
            <option value="devnet">Devnet</option>
          </select>
          <span className={styles.networkIndicator} aria-hidden="true" />
        </label>
        <div className={styles.balanceBox} aria-label={isLoading ? 'Loading balance' : 'Balance'}>
          <Image
            className={styles.balanceDice}
            src="/dice.png"
            alt=""
            aria-hidden="true"
            width={20}
            height={20}
          />
          {isLoading ? (
            <span className={styles.balanceSkeleton} aria-hidden="true" />
          ) : (
            <span className={styles.balance}>
              {formatBalance(walletProfile?.balance)}
            </span>
          )}
        </div>
        {disconnectError && (
          <span className={styles.networkError} role="alert">
            {disconnectError}
          </span>
        )}
        {isLoading ? (
          <div className={styles.walletBox} aria-label="Loading wallet">
            <span className={styles.walletSkeleton} aria-hidden="true" />
          </div>
        ) : (
          <div className={styles.walletControl} ref={walletControlRef}>
            <button
              className={styles.walletBox}
              type="button"
              aria-haspopup={isConnected ? 'menu' : 'dialog'}
              aria-expanded={isConnected ? menuOpen : undefined}
              aria-controls={isConnected ? 'wallet-actions-menu' : undefined}
              onClick={() => {
                if (isConnected) {
                  setDisconnectError(null);
                  setMenuOpen((open) => !open);
                } else {
                  setWalletModalOpen(true);
                }
              }}
            >
              {connectedWallet ? (
                <span className={styles.connectedWalletLogo}>
                  <Image
                    src={connectedWallet.wallet.icon}
                    alt={`${connectedWallet.wallet.name} logo`}
                    width={20}
                    height={20}
                    unoptimized
                  />
                </span>
              ) : (
                <WalletOutlined className={styles.walletIcon} aria-hidden="true" />
              )}
              <span>
                {walletAddress
                  ? shortenAddress(walletAddress)
                  : 'Connect wallet'}
              </span>
            </button>
            {isConnected && menuOpen && (
              <div
                className={styles.walletMenu}
                id="wallet-actions-menu"
                ref={menuRef}
                role="menu"
                aria-label="Wallet actions"
              >
                {!isWalletSessionMatched && (
                  <button
                    className={styles.disconnectButton}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setWalletModalOpen(true);
                    }}
                  >
                    <span>{walletActionLabel}</span>
                  </button>
                )}
                <button
                  className={styles.disconnectButton}
                  type="button"
                  role="menuitem"
                  disabled={isDisconnecting}
                  onClick={() => void handleDisconnect()}
                >
                  <span>Disconnect</span>
                  {isDisconnecting && (
                    <WalletSpinner label="Disconnecting wallet" size="small" />
                  )}
                </button>
                {disconnectError && (
                  <p className={styles.disconnectError} role="alert">
                    {disconnectError}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <WalletDialog
        open={walletDialogOpen}
        onClose={() => setWalletModalOpen(false)}
        sessionError={
          walletSession.error instanceof Error
            ? walletSession.error.message
            : null
        }
      />
    </header>
  );
}
