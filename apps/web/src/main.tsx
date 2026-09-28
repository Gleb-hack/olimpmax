import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MaxUI } from '@maxhub/max-ui';
import '@maxhub/max-ui/dist/styles.css';
import '@olimp/ui/styles.css';
import App, { ErrorBoundary } from './App';
import { SessionProvider } from './lib/session';
import { ApiError } from './lib/api';
import { max } from './lib/max';
import { preventZoom } from './lib/zoom';
import { useTheme } from './lib/theme';

const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: (count, error) => count < 1 && !(error instanceof ApiError && error.status >= 400 && error.status < 500) }, mutations: { retry: false } } });
// MAX UI components (switches, buttons) follow the app theme.
function ThemedMaxUI({ children }: { children: ReactNode }) {
  return <MaxUI colorScheme={useTheme(state => state.theme)}>{children}</MaxUI>;
}

max.ready();
preventZoom();
createRoot(document.getElementById('root')!).render(<StrictMode><ThemedMaxUI><ErrorBoundary><QueryClientProvider client={client}><SessionProvider><BrowserRouter><App /></BrowserRouter></SessionProvider></QueryClientProvider></ErrorBoundary></ThemedMaxUI></StrictMode>);
