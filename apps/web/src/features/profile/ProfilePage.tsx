import { useNavigate } from 'react-router-dom';
import { CircleHelp, Pencil, Settings, Shield } from 'lucide-react';
import { Button, Chip, Header, Notice, SettingsRow } from '@olimp/ui';
import { useFilters } from '../../lib/queries';
import { useProfile } from '../../lib/profile';
import { max } from '../../lib/max';
import { useSession } from '../../lib/session';
import { isMock } from '../../lib/api';
import { profileGradeLabel } from '../../lib/format';
import { ProfileAvatar } from './ProfileAvatar';

export function ProfilePage() {
  const navigate = useNavigate();
  const { profile, storageError, saving, legacy, importLegacy } = useProfile();
  const { logout } = useSession();
  const filters = useFilters();
  const grade = profileGradeLabel(profile.grade);
  const selected = filters.data?.subjects.filter(subject => profile.subjects.includes(subject.id)) ?? [];
  const empty = <p className="panel-section__empty">Не выбрано</p>;
  const subjects = filters.isPending && profile.subjects.length ? <p className="panel-section__empty">Загружаем…</p>
    : filters.isError && profile.subjects.length ? <p className="panel-section__empty">Не удалось загрузить названия предметов.</p>
    : !selected.length ? empty
    : <div className="chips-wrap">{selected.map(subject => <Chip key={subject.id} selected>{subject.name}</Chip>)}</div>;
  const format = (label: string, enabled: boolean) => <div className="switch-row"><span>{label}</span><small className={enabled ? 'text-green' : 'muted'}>{enabled ? 'Включено' : 'Выключено'}</small></div>;
  return <><Header title="Профиль" subtitle="Личные данные и настройки" action={<button className="icon-button" aria-label="Настройки профиля" onClick={() => navigate('/profile/edit')}><Settings size={21} /></button>} />
    <section className="profile-card panel"><ProfileAvatar image={profile.avatar} /><div><h2>{profile.name || max.displayName}</h2><p>{[grade ?? 'Класс не указан', profile.region].filter(Boolean).join(' · ')}</p></div></section>
    {legacy && <Notice tone="info">На этом устройстве остались настройки из предыдущей версии. <button className="text-button" disabled={saving} onClick={importLegacy}>Перенести их в аккаунт</button></Notice>}
    <div className="panel profile-details">
      <section className="panel-section"><h2 className="section-caption">Класс обучения</h2>{grade ? <div className="chips-wrap"><Chip selected>{grade}</Chip></div> : empty}</section>
      <section className="panel-section"><h2 className="section-caption">Интересующие предметы</h2>{subjects}</section>
      <section className="panel-section"><h2 className="section-caption">Желаемый формат</h2>{format('Онлайн-этапы', profile.online)}{format('Очные финалы', profile.onsite)}</section>
    </div>
    <Button className="full-width profile-edit-button" onClick={() => navigate('/profile/edit')}><Pencil size={16} />Редактировать профиль</Button>
    <div className="settings-list profile-links"><SettingsRow icon={Shield} tone="green" title="Данные и конфиденциальность" subtitle="Управление данными" onClick={() => navigate('/profile/privacy')} /><SettingsRow icon={CircleHelp} title="Помощь и FAQ" subtitle="Ответы на частые вопросы" onClick={() => navigate('/profile/help')} /></div>
    <p className="hint centered-text">{isMock ? 'Демонстрационный профиль сохранён в браузере.' : saving ? 'Сохраняем настройки…' : 'Профиль и план сохранены в вашем аккаунте.'}<br />Автоматический подбор пока не подключён.</p><button className="profile-signout" onClick={() => { logout(); navigate('/welcome', { replace: true }); }}>Выйти из аккаунта</button>{storageError && <Notice tone="error">{storageError}</Notice>}
  </>;
}
