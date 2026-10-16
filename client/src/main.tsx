import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { installTapHaptics } from './lib/haptics';
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
import { OfflineBanner } from './components/offlineBanner/OfflineBanner.tsx';


const queryClient = new QueryClient({
  defaultOptions: {

    // retry/retryDelay: see queryHelpers.ts. Retries a busy or rate-limited server with a spread-out
    // backoff instead of failing at once (or retrying a doomed 403/404 three times).
    queries: { staleTime: 30_000, retry: handleQueryRetry, retryDelay: queryRetryDelay },
  },
});

registerServiceWorker();

if (import.meta.env.DEV) {
  document.body.classList.add('debug-screens');
}

// A light buzz on every tap on a phone (Android browsers; iPhone Safari has no vibration). Settings can turn it off.
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
            <Toaster position="top-right" richColors closeButton />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);