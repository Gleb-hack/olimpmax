import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { BottomNav, Button, EmptyState } from '@olimp/ui';
import { StartupScreen } from './features/auth/StartupScreen';
import { CatalogPage } from './features/catalog/CatalogPage';
import { SearchPage } from './features/catalog/SearchPage';
import { CompareButton } from './features/catalog/Comparison';
import { useUI } from './lib/ui-store';
import { EditProfilePage } from './features/profile/EditProfilePage';
import { DetailPage } from './features/catalog/DetailPage';
import { UniversityPage } from './features/university/UniversityPage';
import { PlanPage } from './features/plan/PlanPage';
import { ProfilePage } from './features/profile/ProfilePage';
import { PrivacyPage } from './features/profile/PrivacyPage';
import { HelpPage } from './features/profile/HelpPage';
import { OlympiadFaqPage } from './features/profile/OlympiadFaqPage';
import { OlimpPage } from './features/assistant/OlimpPage';
import { AssistantProvider } from './features/assistant/AssistantProvider';
import { isOlimpChatOpen, isOlimpPicksOpen, olimpChatPath, useOlimpChatRoute, useOlimpPicksRoute } from './features/assistant/chat-route';
import { max } from './lib/max';
import { canGoBack } from './lib/history';
import { isMock } from './lib/api';
import { useSession } from './lib/session';
import { ProfileProvider } from './lib/profile';
import { AuthPage, WelcomePage } from './features/auth/AuthPages';
import { useCatalogNavigation } from './lib/catalog-navigation';
import { startRoute } from './lib/start-param';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) { /* Do not log personal state or MAX initData. */ }
  render() { return this.state.failed ? <div className="app-shell"><EmptyState title="Не удалось открыть страницу" action={<Button onClick={() => window.location.reload()}>Перезагрузить</Button>}>Попробуйте обновить приложение. Ваш план сохранён на сервере.</EmptyState></div> : this.props.children; }
}
function Layout() {
  const { pathname, search: queryString, state } = useLocation();
  const catalogTo = useCatalogNavigation();
  const navigate = useNavigate();
  const olympiad = pathname.startsWith('/olympiads/');
  const university = pathname.startsWith('/universities/');
  const detail = olympiad || university;
  const search = pathname === '/search';
  // Pages opened from a university page return through history, so the university keeps its own way back.
  const historyBack = (university || state?.historyBack === true) && canGoBack();
  const planItem = pathname === '/plan' && new URLSearchParams(queryString).has('olympiad');
  const overview = pathname === '/olimp';
  // «Чат Олимпа» is a sheet over the overview: MAX «back» closes it.
  const chatOpen = isOlimpChatOpen(pathname, queryString);
  const { closeChat } = useOlimpChatRoute();
  // «Ещё варианты» is a sheet over the overview too: MAX «back» closes it.
  const picksOpen = isOlimpPicksOpen(pathname, queryString);
  const { closePicks } = useOlimpPicksRoute();
  const comparing = useUI(state => state.comparisonIds.length >= 2) && (olympiad || search || pathname === '/catalog' || overview);
  const backTo = typeof state?.backTo === 'string' && /^\/(?:catalog|search|olimp|universities\/[a-z0-9-]+)(?:\?|$)/.test(state.backTo) ? state.backTo : '/catalog';
  const subpage = pathname.startsWith('/profile/');
  const returnTo = typeof state?.returnTo === 'string' && /^\/catalog(?:\?|$)/.test(state.returnTo) ? state.returnTo : '/catalog';
  useEffect(() => {
    const heading = document.querySelector('h1');
    document.title = `${heading?.textContent || 'Olimp'} · Olimp`;
    heading?.focus({ preventScroll: true });
  }, [pathname]);
  useEffect(() => max.backButton(chatOpen ? closeChat : picksOpen ? closePicks : subpage ? () => navigate('/profile') : planItem ? () => navigate(state?.backTo ? backTo : '/plan', { state: { backTo: returnTo } }) : historyBack ? () => navigate(-1) : detail || search ? () => navigate(backTo, { state: { backTo: returnTo } }) : null),
    // closeChat/closePicks are rebuilt on every render; chatOpen, picksOpen and state?.chatOpened are what change their behavior.
    [pathname, navigate, subpage, detail, search, planItem, backTo, returnTo, state?.backTo, historyBack, chatOpen, picksOpen, state?.chatOpened]);
  return <div className={`app-shell ${comparing ? 'app-shell--compare' : ''}`}>{isMock && <div className="demo-banner">Демо · данные и план только в этом браузере</div>}<a href="#main" className="skip-link">К содержимому</a><main id="main" className={`page ${overview ? 'page--overview' : subpage || detail || search ? 'page--detail' : ''}`}><Outlet /></main><CompareButton visible={comparing} />
    {!subpage && !detail && !search && <BottomNav catalogTo={catalogTo} />}</div>;
}
// A bot button («Открыть карточку») launches the app with start_param; follow it once per launch, after sign-in.
let startParamHandled = false;
function useStartParam(signedIn: boolean) {
  const navigate = useNavigate();
  useEffect(() => {
    if (!signedIn || startParamHandled) return;
    startParamHandled = true;
    const route = startRoute(max.startParam);
    if (route && window.location.pathname + window.location.search !== route) navigate(route);
  }, [signedIn, navigate]);
}
function ProtectedApp() {
  const { user } = useSession();
  const location = useLocation();
  useStartParam(Boolean(user));
  if (!user) return <Navigate to="/welcome" replace state={{ from: location.pathname + location.search }} />;
  return <ProfileProvider key={user.id}><AssistantProvider><Outlet /></AssistantProvider></ProfileProvider>;
}
function AppRoutes() {
  return <Routes><Route path="welcome" element={<WelcomePage />} /><Route path="login" element={<AuthPage key="login" mode="login" />} /><Route path="register" element={<AuthPage key="register" mode="register" />} /><Route element={<ProtectedApp />}><Route element={<Layout />}><Route index element={<Navigate to="/olimp" replace />} /><Route path="catalog" element={<CatalogPage />} /><Route path="search" element={<SearchPage />} /><Route path="profile/edit" element={<EditProfilePage />} /><Route path="olympiads/:id" element={<DetailPage />} /><Route path="universities/:slug" element={<UniversityPage />} /><Route path="plan" element={<PlanPage />} /><Route path="profile" element={<ProfilePage />} /><Route path="profile/privacy" element={<PrivacyPage />} /><Route path="profile/help" element={<HelpPage />} /><Route path="profile/olympiad-faq" element={<OlympiadFaqPage />} /><Route path="olimp" element={<OlimpPage />} /><Route path="bot" element={<Navigate to={olimpChatPath} replace />} /><Route path="*" element={<EmptyState title="Страница не найдена" action={<Link className="button-link" to="/catalog">Перейти в каталог</Link>}>Такой страницы нет, но в каталоге есть много интересного.</EmptyState>} /></Route></Route></Routes>;
}
export default function App() { const { starting } = useSession(); return starting ? <StartupScreen /> : <AppRoutes />; }