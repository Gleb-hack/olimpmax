import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { BottomNav, Button, EmptyState, Loading } from '@olimp/ui';
import { CatalogPage } from './features/catalog/CatalogPage';
import { SearchPage } from './features/catalog/SearchPage';
import { EditProfilePage } from './features/profile/EditProfilePage';
import { DetailPage } from './features/catalog/DetailPage';
import { PlanPage } from './features/plan/PlanPage';
import { ProfilePage } from './features/profile/ProfilePage';
import { PrivacyPage } from './features/profile/PrivacyPage';
import { HelpPage } from './features/profile/HelpPage';
import { OlimpPage } from './features/assistant/OlimpPage';
import { AssistantProvider } from './features/assistant/AssistantProvider';
import { max } from './lib/max';
import { isMock } from './lib/api';
import { useSession } from './lib/session';
import { ProfileProvider } from './lib/profile';
import { AuthPage, WelcomePage } from './features/auth/AuthPages';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) { /* Do not log personal state or MAX initData. */ }
  render() { return this.state.failed ? <div className="app-shell"><EmptyState title="Не удалось открыть страницу" action={<Button onClick={() => window.location.reload()}>Перезагрузить</Button>}>Попробуйте обновить приложение. Ваш план сохранён на сервере.</EmptyState></div> : this.props.children; }
}
function Layout() {
  const { pathname, state } = useLocation();
  const navigate = useNavigate();
  const detail = pathname.startsWith('/olympiads/');
  const search = pathname === '/search';
  const chat = pathname === '/olimp';
  const backTo = typeof state?.backTo === 'string' && /^\/(?:catalog|search|olimp)(?:\?|$)/.test(state.backTo) ? state.backTo : '/catalog';
  const subpage = pathname.startsWith('/profile/');
  const returnTo = typeof state?.returnTo === 'string' && /^\/catalog(?:\?|$)/.test(state.returnTo) ? state.returnTo : '/catalog';
  useEffect(() => {
    window.scrollTo(0, 0);
    const heading = document.querySelector('h1');
    document.title = `${heading?.textContent || 'Olimp'} · Olimp`;
    heading?.focus({ preventScroll: true });
    return max.backButton(subpage ? () => navigate('/profile') : detail || search ? () => navigate(backTo, { state: { backTo: returnTo } }) : null);
  }, [pathname, navigate, subpage, detail, search, backTo, returnTo]);
  return <div className={`app-shell ${chat ? 'app-shell--chat' : ''}`}>{isMock && <div className="demo-banner">Демо · данные и план только в этом браузере</div>}<a href="#main" className="skip-link">К содержимому</a><main id="main" className={`page ${chat ? 'page--chat' : subpage || detail || search ? 'page--detail' : ''}`}><Outlet /></main>{!subpage && !detail && !search && <BottomNav />}</div>;
}
function ProtectedApp() {
  const { user } = useSession();
  const location = useLocation();
  if (!user) return <Navigate to="/welcome" replace state={{ from: location.pathname + location.search }} />;
  return <ProfileProvider key={user.id}><AssistantProvider><Outlet /></AssistantProvider></ProfileProvider>;
}
function AppRoutes() {
  return <Routes><Route path="welcome" element={<WelcomePage />} /><Route path="login" element={<AuthPage key="login" mode="login" />} /><Route path="register" element={<AuthPage key="register" mode="register" />} /><Route element={<ProtectedApp />}><Route element={<Layout />}><Route index element={<Navigate to="/catalog" replace />} /><Route path="catalog" element={<CatalogPage />} /><Route path="search" element={<SearchPage />} /><Route path="profile/edit" element={<EditProfilePage />} /><Route path="olympiads/:id" element={<DetailPage />} /><Route path="plan" element={<PlanPage />} /><Route path="profile" element={<ProfilePage />} /><Route path="profile/privacy" element={<PrivacyPage />} /><Route path="profile/help" element={<HelpPage />} /><Route path="olimp" element={<OlimpPage />} /><Route path="bot" element={<Navigate to="/olimp" replace />} /><Route path="*" element={<EmptyState title="Страница не найдена" action={<Link className="button-link" to="/catalog">Перейти в каталог</Link>}>Такой страницы нет, но в каталоге есть много интересного.</EmptyState>} /></Route></Route></Routes>;
}
export default function App() { const { starting } = useSession(); return starting ? <div className="app-shell"><Loading label="Восстанавливаем вход…" /></div> : <AppRoutes />; }
