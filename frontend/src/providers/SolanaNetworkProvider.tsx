'use client';

import { ClientProvider } from '@solana/react';
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createWalletClient, type SolanaNetwork } from '@/lib/wallet';

type SolanaNetworkContextValue = {
  network: SolanaNetwork;
  setNetwork: (network: SolanaNetwork) => void;
  walletClient: ReturnType<typeof createWalletClient>;
};

const SolanaNetworkContext =
  createContext<SolanaNetworkContextValue | null>(null);

const initialNetwork: SolanaNetwork =
  process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'devnet' ? 'devnet' : 'mainnet';

export function SolanaNetworkProvider({ children }: { children: ReactNode }) {
  const [network, setNetwork] = useState<SolanaNetwork>(initialNetwork);
  const walletClient = useMemo(() => createWalletClient(network), [network]);
  const value = useMemo(
    () => ({ network, setNetwork, walletClient }),
    [network, walletClient],
  );

  return (
    <SolanaNetworkContext.Provider value={value}>
      <ClientProvider key={network} client={walletClient}>
        {children}
      </ClientProvider>
    </SolanaNetworkContext.Provider>
  );
}

export function useSolanaNetwork() {
  const context = useContext(SolanaNetworkContext);
  if (!context) {
    throw new Error('useSolanaNetwork must be used within SolanaNetworkProvider');
  }
  return context;
}
