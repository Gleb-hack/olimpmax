import { useLocation, useNavigate } from 'react-router-dom';
import { canGoBack } from '../../lib/history';

/** The «Чат Олимпа» sheet is part of the URL, so the MAX back button, links and bot buttons can open and close it. */
export const olimpChatPath = '/olimp?chat=1';
/** «Ещё варианты» — more olympiads picked for the pupil, a sheet over the overview like the chat. */
export const olimpPicksPath = '/olimp?more=1';

export function isOlimpChatOpen(pathname: string, search: string) {
  return pathname === '/olimp' && new URLSearchParams(search).get('chat') === '1';
}
export function isOlimpPicksOpen(pathname: string, search: string) {
  return pathname === '/olimp' && new URLSearchParams(search).get('more') === '1';
}

function useOlimpSheetRoute(path: string, isOpen: (pathname: string, search: string) => boolean) {
  const { pathname, search, state } = useLocation();
  const navigate = useNavigate();
  return {
    open: isOpen(pathname, search),
    openSheet: () => navigate(path, { state: { chatOpened: true } }),
    // Opened from the overview: step back, so «back» does not reopen the sheet. Opened by a link: drop the parameter.
    closeSheet: () => state?.chatOpened === true && canGoBack() ? navigate(-1) : navigate('/olimp', { replace: true }),
  };
}

export function useOlimpChatRoute() {
  const route = useOlimpSheetRoute(olimpChatPath, isOlimpChatOpen);
  const navigate = useNavigate();
  return {
    open: route.open, openChat: route.openSheet, closeChat: route.closeSheet,
    /** From another sheet («Ещё варианты») straight to the chat: the chat takes that sheet's place in the history. */
    switchToChat: () => navigate(olimpChatPath, { replace: true, state: { chatOpened: true } }),
  };
}

export function useOlimpPicksRoute() {
  const route = useOlimpSheetRoute(olimpPicksPath, isOlimpPicksOpen);
  return { open: route.open, openPicks: route.openSheet, closePicks: route.closeSheet };
}
