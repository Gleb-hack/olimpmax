import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button as MaxButton } from '@maxhub/max-ui';
import { NavLink, Link } from 'react-router-dom';
import { ArrowLeft, CalendarDays, ChevronRight, LayoutGrid, Sparkles, UserRound, X, type LucideIcon } from 'lucide-react';

export { Select } from './Select';

export function Button({ children, variant = 'primary', className = '', ...props }: Omit<React.ComponentProps<typeof MaxButton>, 'variant'> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  return <MaxButton {...props} innerClassNames={{ content: 'olimp-button-content' }} className={`button button--${variant} ${className}`}>{children}</MaxButton>;
}

const tabs = [
  { to: '/olimp', label: 'Олимп', icon: Sparkles },
  { to: '/catalog', label: 'Каталог', icon: LayoutGrid },
  { to: '/plan', label: 'План', icon: CalendarDays },
  { to: '/profile', label: 'Профиль', icon: UserRound },
];
export function BottomNav() {
  return <nav className="bottom-nav" aria-label="Основная навигация">{tabs.map(({ to, label, icon: Icon }) =>
    <NavLink key={to} to={to} className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`}>
      <Icon size={21} strokeWidth={1.7} /><span>{label}</span>
    </NavLink>)}
  </nav>;
}

export function Header({ title, subtitle, action, back, backLabel, backState }: { title: string; subtitle?: string; action?: ReactNode; back?: string; backLabel?: string; backState?: { backTo: string } }) {
  return <header className={`page-header ${back ? 'page-header--back' : ''}`}>
    {back && <Link to={back} state={backState} className="icon-button back-button" aria-label={backLabel || (back === '/catalog' ? 'Назад в каталог' : 'Назад в профиль')}><ArrowLeft size={20} /></Link>}
    <div><h1 tabIndex={-1}>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{action}
  </header>;
}

export function SettingsRow({ icon: Icon, title, subtitle, tone = 'blue', children, ...props }: { icon: LucideIcon; title: string; subtitle?: string; tone?: 'blue' | 'green' | 'red' | 'amber'; children?: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className="settings-row" {...props}>
    <span className={`icon-tile tone-${tone}`}><Icon size={20} strokeWidth={1.7} /></span>
    <span className="settings-row__copy"><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</span>
    {children ?? <ChevronRight className="muted" size={18} />}
  </button>;
}

export function Notice({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'info' | 'warning' | 'error' }) {
  return <div className={`notice notice--${tone}`} role={tone === 'error' ? 'alert' : undefined}>{children}</div>;
}

export function EmptyState({ icon: Icon = LayoutGrid, title, children, action }: { icon?: LucideIcon; title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-state__icon"><Icon size={28} strokeWidth={1.5} /></span><h2>{title}</h2><p>{children}</p>{action}</div>;
}

export function Loading({ label = 'Загружаем…' }: { label?: string }) {
  return <div className="loading" role="status"><span className="spinner" aria-hidden="true" />{label}</div>;
}

export function Dialog({ title, children, onClose, className = '' }: { title: string; children: ReactNode; onClose: () => void; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { dialog?.close(); document.body.style.overflow = oldOverflow; previous?.focus(); };
  }, []);
  return <dialog ref={ref} className={`dialog ${className}`} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="dialog__inner"><div className="dialog__header"><h2 id={titleId}>{title}</h2><button type="button" className="icon-button" aria-label="Закрыть" onClick={onClose}><X size={19} /></button></div>{children}</div>
  </dialog>;
}
