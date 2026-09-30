import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Button, Dialog, Notice, Select, Icon } from '@olimp/ui';
import { ProfilePreferences } from '@olimp/contracts';
import { canUseLocalAuth, isMock } from '../../lib/api';
import { max } from '../../lib/max';
import { useSession } from '../../lib/session';
import { useFilters } from '../../lib/queries';
import { SubjectsDialog } from '../profile/SubjectsDialog';
import { DirectionsDialog, UniversitiesDialog, goalLabel, useGoal } from '../profile/GoalDialogs';
import { requestTour } from '../tour/tour-state';
import welcomeTitle from '../../assets/onboarding/welcome-title.svg';
import welcomeGlow from '../../assets/onboarding/welcome-glow.svg';
import welcomeHalo from '../../assets/onboarding/welcome-halo.svg';
import welcomeMascot from '../../assets/onboarding/welcome-mascot.webp';

function useAuthNavigation(title: string, back: string | null) {
  const navigate = useNavigate();
  useEffect(() => {
    document.title = `${title} · Olimp`; window.scrollTo(0, 0);
    return max.backButton(back ? () => navigate(back) : null);
  }, [title, back, navigate]);
}
function DataNote() {
  return <div className="prose"><p>Olimp получает идентификатор и имя вашего аккаунта MAX. Сервер проверяет подлинность этих данных.</p><p>В базе Olimp сохраняются имя профиля, класс, город, предметы, целевые вузы и направления, форматы участия, выбранные олимпиады и заметки. После входа через тот же аккаунт MAX они доступны на другом устройстве.</p><p>Пароль от MAX вводить не нужно. Загруженное фото профиля остаётся на текущем устройстве.</p><p className="hint">Политика обработки персональных данных пока не опубликована.</p></div>;
}
export function WelcomePage() {
  const { user, error } = useSession();
  const { state } = useLocation();
  const [info, setInfo] = useState(false);
  useAuthNavigation('Добро пожаловать', null);
  if (user) return <Navigate to="/olimp" replace />;
  return <main className="app-shell welcome-page">
    <img className="welcome-glow" src={welcomeGlow} width={464} height={486} alt="" />
    <img className="welcome-halo" src={welcomeHalo} width={320} height={320} alt="" />
    <header className="welcome-hero">
      <h1><img src={welcomeTitle} width={292} height={41} alt="Олимп" /></h1>
      <p>твой проводник в мир олимпиад</p>
    </header>
    <div className="welcome-stage"><img src={welcomeMascot} width={375} height={440} alt="" /></div>
    <div className="welcome-actions">
      {error && <Notice tone="error">{error}</Notice>}
      <Link className="auth-button" to="/login" state={state}>Войти</Link>
      <Link className="auth-button auth-button--outline" to="/register" state={state}>Зарегистрироваться</Link>
      <p className="welcome-note">Продолжая, вы принимаете <button type="button" onClick={() => setInfo(true)}>условия использования</button></p>
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
  const [universities, setUniversities] = useState<string[]>([]);
  const [directions, setDirections] = useState<string[]>([]);
  const [goalOpen, setGoalOpen] = useState<'universities' | 'directions' | null>(null);
  const goal = useGoal({ universities, directions });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState(false);
  useAuthNavigation(registering ? 'Регистрация' : 'Вход', '/welcome');
  const available = max.isEmbedded || canUseLocalAuth || isMock;
  const selected = filters.data?.subjects.filter(s => subjects.includes(s.id)).map(s => s.name).join(', ');
  if (session.user) return <Navigate to={typeof location.state?.from === 'string' && /^\/(catalog|plan|profile|search|olympiads|olimp)(\/|\?|$)/.test(location.state.from) ? location.state.from : '/olimp'} replace />;
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (pending) return;
    setError('');
    const parsed = ProfilePreferences.safeParse({ name, grade, subjects, region: '', online: true, onsite: true, universities, directions });
    if (registering && !parsed.success) { setError('Укажите имя длиной от 1 до 80 символов.'); return; }
    setPending(true);
    try {
      // A new account starts with the app tour; it opens once the protected app mounts.
      if (registering && parsed.success) { await session.register(parsed.data); requestTour(); } else await session.login();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось войти. Попробуйте ещё раз.'); }
    finally { setPending(false); }
  }
  return <main className={`app-shell auth-page ${registering ? 'auth-page--register' : ''}`}>
    <button className="icon-button auth-back" aria-label="Назад к приветствию" onClick={() => navigate('/welcome')} disabled={pending}><Icon name="chevron-left" size={18} /></button>
    <header className="auth-heading"><h1>{registering ? 'Создать аккаунт' : 'С возвращением!'}</h1><p>{registering ? 'Заполните данные, чтобы начать подготовку к олимпиадам' : 'Войдите, чтобы продолжить подготовку к олимпиадам'}</p></header>
    <nav className="auth-tabs" aria-label="Вход или регистрация"><Link to="/login" state={location.state} aria-current={!registering ? 'page' : undefined} onClick={event => { if (pending) event.preventDefault(); }}>Вход</Link><Link to="/register" state={location.state} aria-current={registering ? 'page' : undefined} onClick={event => { if (pending) event.preventDefault(); }}>Регистрация</Link></nav>
    {(isMock || canUseLocalAuth) && <p className="auth-demo">{isMock ? 'Деморежим · данные только в этом браузере' : 'Локальная разработка · тестовый аккаунт'}</p>}
    <form className="auth-form" onSubmit={submit}>
      <fieldset disabled={pending}>
        {registering && <label className="auth-field"><span>Имя</span><div className="auth-input"><Icon name="user" size={16} /><input autoComplete="given-name" required maxLength={80} value={name} placeholder="Как вас зовут?" onChange={event => setName(event.target.value)} /></div></label>}
        <label className="auth-field"><span>Аккаунт MAX</span><div className="auth-input"><Icon name="user" size={16} /><input readOnly value={max.isEmbedded ? max.displayName : isMock || canUseLocalAuth ? 'Тестовый аккаунт' : 'Откройте приложение в MAX'} /></div></label>
        {!registering && <label className="auth-field"><span>Способ входа</span><div className="auth-input auth-input--secure"><Icon name="shield" size={16} /><input readOnly value="Без пароля · через MAX" /></div></label>}
        <p className="auth-security"><Icon name="shield" size={16} /><span>{registering ? 'Профиль будет привязан к вашему аккаунту MAX. Придумывать пароль не нужно.' : 'MAX подтверждает вашу личность. Ваш план и настройки появятся после входа.'}</span></p>
        {registering && <>
          <div className="auth-field auth-field--section"><span>Класс обучения</span><Select label="Класс обучения" placeholder="Выберите класс" value={grade === null ? '' : String(grade)} onChange={value => setGrade(value ? Number(value) : null)} options={[{ value: '', label: 'Укажу позже' }, ...Array.from({ length: 11 }, (_, i) => ({ value: String(i + 1), label: `${i + 1} класс` }))]} /></div>
          <div className="auth-field auth-field--section"><span>Интересующие предметы</span><button type="button" className={`subjects-trigger ${subjects.length ? 'has-value' : ''}`} aria-haspopup="dialog" aria-label="Выбрать интересующие предметы" onClick={() => setSubjectsOpen(true)}><span>{selected || 'Выберите предметы'}</span><Icon name="chevron-down" size={16} /></button></div>
          <div className="auth-field auth-field--section"><span>Целевые вузы</span><button type="button" className={`subjects-trigger ${universities.length ? 'has-value' : ''}`} aria-haspopup="dialog" aria-label="Выбрать целевые вузы" onClick={() => setGoalOpen('universities')}><span>{goalLabel(goal.universities.map(item => item.name), universities.length, 'Выберите вузы')}</span><Icon name="chevron-down" size={16} /></button></div>
          <div className="auth-field auth-field--section"><span>Направления</span><button type="button" className={`subjects-trigger ${directions.length ? 'has-value' : ''}`} aria-haspopup="dialog" aria-label="Выбрать направления" onClick={() => setGoalOpen('directions')}><span>{goalLabel(goal.directions.map(item => item.name), directions.length, 'Выберите направления')}</span><Icon name="chevron-down" size={16} /></button></div>
          <p className="auth-optional">Класс, предметы, вузы и направления можно указать позже.</p>
        </>}
        {!available && <Notice tone="info">Откройте это мини-приложение из бота в MAX, чтобы {registering ? 'создать профиль' : 'войти в аккаунт'}.</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" className="full-width auth-submit" disabled={!available || pending}>{pending ? 'Подождите…' : registering ? 'Зарегистрироваться' : 'Войти через MAX'}</Button>
      </fieldset>
    </form>
    <p className="auth-footer">{registering ? 'Уже есть аккаунт?' : 'Нет аккаунта?'} <Link to={registering ? '/login' : '/register'} state={location.state}>{registering ? 'Войти' : 'Зарегистрироваться'}</Link></p>
    <button className="auth-data-link" onClick={() => setInfo(true)}>Как используются мои данные</button>
    {subjectsOpen && <SubjectsDialog value={subjects} onApply={setSubjects} onClose={() => setSubjectsOpen(false)} />}
    {goalOpen === 'universities' && <UniversitiesDialog value={universities} onApply={setUniversities} onClose={() => setGoalOpen(null)} />}
    {goalOpen === 'directions' && <DirectionsDialog value={directions} onApply={setDirections} onClose={() => setGoalOpen(null)} />}
    {info && <Dialog title="Данные профиля" onClose={() => setInfo(false)}><DataNote /><Button className="full-width" onClick={() => setInfo(false)}>Понятно</Button></Dialog>}
  </main>;
}
