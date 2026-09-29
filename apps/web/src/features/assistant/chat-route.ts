import { useLocation, useNavigate } from 'react-router-dom';
import { canGoBack } from '../../lib/history';

/** The «Чат Олимпа» sheet is part of the URL, so the MAX back button, links and bot buttons can open and close it. */
export const olimpChatPath = '/olimp?chat=1';

export function isOlimpChatOpen(pathname: string, search: string) {
  return pathname === '/olimp' && new URLSearchParams(search).get('chat') === '1';
}

export function useOlimpChatRoute() {
  const { pathname, search, state } = useLocation();
  const navigate = useNavigate();
  return {
    open: isOlimpChatOpen(pathname, search),
    openChat: () => navigate(olimpChatPath, { state: { chatOpened: true } }),
    // Opened from the overview: step back, so «back» does not reopen the sheet. Opened by a link: drop the parameter.
    closeChat: () => state?.chatOpened === true && canGoBack() ? navigate(-1) : navigate('/olimp', { replace: true }),
  };
}
