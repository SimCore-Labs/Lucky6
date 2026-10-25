'use client';

import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { ClientProvider } from '@solana/react';
import { walletClient } from '@/lib/wallet';
import { theme } from '@/theme/theme';
import { UiStoreProvider } from '@/store/ui/useUiStore';

export function Providers({ children }: Readonly<{ children: React.ReactNode }>) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            refetchOnWindowFocus: true,
            retry: 1,
          },
        },
      }),
  );

  return (
    <AppRouterCacheProvider>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <ClientProvider client={walletClient}>
          <QueryClientProvider client={queryClient}>
            <UiStoreProvider>{children}</UiStoreProvider>
          </QueryClientProvider>
        </ClientProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
