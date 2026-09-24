import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ShieldCheck, UserRound } from 'lucide-react';
import { Button, Dialog, Notice, Select } from '@olimp/ui';
import { ProfilePreferences } from '@olimp/contracts';
import { canUseLocalAuth, isMock } from '../../lib/api';
import { max } from '../../lib/max';
import { useSession } from '../../lib/session';
import { useFilters } from '../../lib/queries';
import { SubjectsDialog } from '../profile/SubjectsDialog';
import welcome from '../../assets/olimp/welcome.png';

function useAuthNavigation(title: string, back: string | null) {
  const navigate = useNavigate();
  useEffect(() => {
    document.title = `${title} · Olimp`; window.scrollTo(0, 0);
    return max.backButton(back ? () => navigate(back) : null);
  }, [title, back, navigate]);
}
function DataNote() {
  return <div className="prose"><p>Olimp получает идентификатор и имя вашего аккаунта MAX. Сервер проверяет подлинность этих данных.</p><p>В базе Olimp сохраняются имя профиля, класс, город, предметы, форматы участия, выбранные олимпиады и заметки. После входа через тот же аккаунт MAX они доступны на другом устройстве.</p><p>Пароль от MAX вводить не нужно. Загруженное фото профиля остаётся на текущем устройстве.</p><p className="hint">Политика обработки персональных данных пока не опубликована.</p></div>;
}
export function WelcomePage() {
  const { user, error } = useSession();
  const { state } = useLocation();
  const [info, setInfo] = useState(false);
  useAuthNavigation('Добро пожаловать', null);
  if (user) return <Navigate to="/catalog" replace />;
  return <main className="app-shell welcome-page">
    <h1 className="sr-only">Добро пожаловать в Олимп</h1>
    <div className="welcome-art"><img src={welcome} width={327} height={436} alt="Олимп — твой проводник в мир олимпиад" /></div>
    <div className="welcome-actions">
      {error && <Notice tone="error">{error}</Notice>}
      <Link className="auth-button" to="/login" state={state}>Войти</Link>
      <Link className="auth-button auth-button--outline" to="/register" state={state}>Зарегистрироваться</Link>
      <button className="welcome-note" onClick={() => setInfo(true)}>Ваш профиль и план связаны<br />с аккаунтом MAX</button>
    </div>
    {info && <Dialog title="Вход через MAX" onClose={() => setInfo(false)}><DataNote /><Button className="full-width" onClick={() => setInfo(false)}>Понятно</Button></Dialog>}
  </main>;
}
export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const registering = mode === 'register';
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const filters = useFilters();
  const [name, setName] = useState(max.isEmbedded ? max.displayName.slice(0, 80) : '');
  const [grade, setGrade] = useState<number | null>(null);
  const [subjects, setSubjects] = useState<number[]>([]);
  const [subjectsOpen, setSubjectsOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState(false);
  useAuthNavigation(registering ? 'Регистрация' : 'Вход', '/welcome');
  const available = max.isEmbedded || canUseLocalAuth || isMock;
  const selected = filters.data?.subjects.filter(s => subjects.includes(s.id)).map(s => s.name).join(', ');
  if (session.user) return <Navigate to={typeof location.state?.from === 'string' && /^\/(catalog|plan|profile|search|olympiads|olimp)(\/|\?|$)/.test(location.state.from) ? location.state.from : '/catalog'} replace />;
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (pending) return;
    setError('');
    const parsed = ProfilePreferences.safeParse({ name, grade, subjects, region: '', online: true, onsite: true });
    if (registering && !parsed.success) { setError('Укажите имя длиной от 1 до 80 символов.'); return; }
    setPending(true);
    try {
      if (registering && parsed.success) await session.register(parsed.data); else await session.login();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось войти. Попробуйте ещё раз.'); }
    finally { setPending(false); }
  }
  return <main className={`app-shell auth-page ${registering ? 'auth-page--register' : ''}`}>
    <button className="icon-button auth-back" aria-label="Назад к приветствию" onClick={() => navigate('/welcome')} disabled={pending}><ChevronLeft size={22} /></button>
    <header className="auth-heading"><h1>{registering ? 'Создать аккаунт' : 'С возвращением!'}</h1><p>{registering ? 'Заполните данные, чтобы начать подготовку к олимпиадам' : 'Войдите, чтобы продолжить подготовку к олимпиадам'}</p></header>
    <nav className="auth-tabs" aria-label="Вход или регистрация"><Link to="/login" state={location.state} aria-current={!registering ? 'page' : undefined} onClick={event => { if (pending) event.preventDefault(); }}>Вход</Link><Link to="/register" state={location.state} aria-current={registering ? 'page' : undefined} onClick={event => { if (pending) event.preventDefault(); }}>Регистрация</Link></nav>
    {(isMock || canUseLocalAuth) && <p className="auth-demo">{isMock ? 'Деморежим · данные только в этом браузере' : 'Локальная разработка · тестовый аккаунт'}</p>}
    <form className="auth-form" onSubmit={submit}>
      <fieldset disabled={pending}>
        {registering && <label className="auth-field"><span>Имя</span><div className="auth-input"><UserRound size={19} /><input autoComplete="given-name" required maxLength={80} value={name} placeholder="Как вас зовут?" onChange={event => setName(event.target.value)} /></div></label>}
        <label className="auth-field"><span>Аккаунт MAX</span><div className="auth-input"><UserRound size={19} /><input readOnly value={max.isEmbedded ? max.displayName : isMock || canUseLocalAuth ? 'Тестовый аккаунт' : 'Откройте приложение в MAX'} /></div></label>
        {!registering && <label className="auth-field"><span>Способ входа</span><div className="auth-input auth-input--secure"><ShieldCheck size={20} /><input readOnly value="Без пароля · через MAX" /></div></label>}
        <p className="auth-security"><ShieldCheck size={16} /><span>{registering ? 'Профиль будет привязан к вашему аккаунту MAX. Придумывать пароль не нужно.' : 'MAX подтверждает вашу личность. Ваш план и настройки появятся после входа.'}</span></p>
        {registering && <>
          <div className="auth-field auth-field--section"><span>Класс обучения</span><Select label="Класс обучения" placeholder="Выберите класс" value={grade === null ? '' : String(grade)} onChange={value => setGrade(value ? Number(value) : null)} options={[{ value: '', label: 'Укажу позже' }, ...Array.from({ length: 11 }, (_, i) => ({ value: String(i + 1), label: `${i + 1} класс` }))]} /></div>
          <div className="auth-field auth-field--section"><span>Интересующие предметы</span><button type="button" className={`subjects-trigger ${subjects.length ? 'has-value' : ''}`} aria-haspopup="dialog" aria-label="Выбрать интересующие предметы" onClick={() => setSubjectsOpen(true)}><span>{selected || 'Выберите предметы'}</span><ChevronDown size={17} /></button></div>
          <p className="auth-optional">Класс и предметы можно указать позже.</p>
        </>}
        {!available && <Notice tone="info">Откройте это мини-приложение из бота в MAX, чтобы {registering ? 'создать профиль' : 'войти в аккаунт'}.</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" className="full-width auth-submit" disabled={!available || pending}>{pending ? 'Подождите…' : registering ? 'Зарегистрироваться' : 'Войти через MAX'}</Button>
      </fieldset>
    </form>
    <p className="auth-footer">{registering ? 'Уже есть аккаунт?' : 'Нет аккаунта?'} <Link to={registering ? '/login' : '/register'} state={location.state}>{registering ? 'Войти' : 'Зарегистрироваться'}</Link></p>
    <button className="auth-data-link" onClick={() => setInfo(true)}>Как используются мои данные</button>
    {subjectsOpen && <SubjectsDialog value={subjects} onApply={setSubjects} onClose={() => setSubjectsOpen(false)} />}
    {info && <Dialog title="Данные профиля" onClose={() => setInfo(false)}><DataNote /><Button className="full-width" onClick={() => setInfo(false)}>Понятно</Button></Dialog>}
  </main>;
}
