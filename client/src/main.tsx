import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { installTapHaptics } from './lib/haptics';
import '@fontsource-variable/inter/index.css';
import '@fontsource-variable/league-spartan/index.css';
import '@fontsource-variable/noto-sans-devanagari/index.css';
import './index.css';
import App from './App.tsx';
import { ThemeProvider } from './context/ThemeContext.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from './components/ui/tooltip.tsx';
import { Toaster } from './components/ui/sonner.tsx';
import { ConfirmDialogProvider } from "./components/confirmDialog"
import { handleQueryRetry, queryRetryDelay } from './lib/queryHelpers.ts';
import { registerServiceWorker } from './lib/pwa.ts';
import { listenForInstallPrompt } from './lib/installPrompt';
import { OfflineBanner } from './components/offlineBanner/OfflineBanner.tsx';

const queryClient = new QueryClient({
  defaultOptions: {

    queries: { staleTime: 30_000, retry: handleQueryRetry, retryDelay: queryRetryDelay },
  },
});

registerServiceWorker();
listenForInstallPrompt();

if (import.meta.env.DEV) {
  document.body.classList.add('debug-screens');
}

installTapHaptics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <ConfirmDialogProvider>
              <App />
            </ConfirmDialogProvider>

            <OfflineBanner />
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);