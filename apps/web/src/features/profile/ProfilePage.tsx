import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Switch } from '@maxhub/max-ui';
import { Check, CircleHelp, Pencil, Settings, Shield } from 'lucide-react';
import { Header, Notice, SettingsRow } from '@olimp/ui';
import { useFilters } from '../../lib/queries';
import { useProfile } from '../../lib/profile';
import { max } from '../../lib/max';
import { useSession } from '../../lib/session';
import { isMock } from '../../lib/api';
import { SubjectsDialog } from './SubjectsDialog';
import { ProfileAvatar } from './ProfileAvatar';

export function ProfilePage() {
  const navigate = useNavigate();
  const { profile, update, storageError, saving, legacy, importLegacy } = useProfile();
  const { logout } = useSession();
  const filters = useFilters();
  const [editing, setEditing] = useState(false);
  const selected = filters.data?.subjects.filter(subject => profile.subjects.includes(subject.id)) ?? [];
  const displayed = selected.length ? selected : filters.data?.subjects.filter(subject => /^(математика|информатика|физика)$/i.test(subject.name)) ?? [];
  return <><Header title="Профиль" subtitle="Личные данные и настройки" action={<button className="icon-button" aria-label="Настройки профиля" onClick={() => navigate('/profile/edit')}><Settings size={21} /></button>} />
    <section className="profile-card panel"><ProfileAvatar image={profile.avatar} /><div><h2>{profile.name || max.displayName}</h2><p>{[profile.grade ? `${profile.grade} класс` : 'Класс не указан', profile.region].filter(Boolean).join(' · ')}</p><button className="text-button" onClick={() => navigate('/profile/edit')}><Pencil size={12} />Редактировать профиль</button></div></section>
    {legacy && <Notice tone="info">На этом устройстве остались настройки из предыдущей версии. <button className="text-button" disabled={saving} onClick={importLegacy}>Перенести их в аккаунт</button></Notice>}
    <fieldset className="profile-controls" disabled={saving}><section className="section"><div className="section-heading"><h2>Интересующие предметы</h2><button className="text-button" onClick={() => setEditing(true)}>Изменить</button></div><div className="subject-tabs">{displayed.map(subject => <button key={subject.id} className={`chip ${profile.subjects.includes(subject.id) ? 'chip--selected' : ''}`} aria-pressed={profile.subjects.includes(subject.id)} onClick={() => update({ subjects: profile.subjects.includes(subject.id) ? profile.subjects.filter(id => id !== subject.id) : [...profile.subjects, subject.id] })}>{subject.name}{profile.subjects.includes(subject.id) && <Check size={12} />}</button>)}{!displayed.length && <button className="chip" onClick={() => setEditing(true)}>Выбрать предметы</button>}</div></section>
    <section className="section"><h2>Класс обучения</h2><div className="grade-options">{[9, 10, 11].map(grade => <button key={grade} className={`grade-option ${profile.grade === grade ? 'is-active' : ''}`} aria-pressed={profile.grade === grade} onClick={() => update({ grade })}>{grade} класс</button>)}</div><button className="text-button grade-other" onClick={() => navigate('/profile/edit')}>{profile.grade && profile.grade < 9 ? `Выбран ${profile.grade} класс · изменить` : 'Другой класс'}</button></section>
    <section className="section"><h2>Желаемый формат</h2><div className="settings-list"><label className="switch-row"><span>Онлайн-этапы</span><span className="switch-end"><small className={profile.online ? 'text-green' : 'muted'}>{profile.online ? 'Включено' : 'Выключено'}</small><Switch aria-label="Онлайн-этапы" checked={profile.online} onChange={event => update({ online: event.target.checked })} /></span></label><label className="switch-row"><span>Очные финалы</span><span className="switch-end"><small className={profile.onsite ? 'text-green' : 'muted'}>{profile.onsite ? 'Включено' : 'Выключено'}</small><Switch aria-label="Очные финалы" checked={profile.onsite} onChange={event => update({ onsite: event.target.checked })} /></span></label></div></section>
    </fieldset><div className="settings-list profile-links"><SettingsRow icon={Shield} tone="green" title="Данные и конфиденциальность" subtitle="Управление данными" onClick={() => navigate('/profile/privacy')} /><SettingsRow icon={CircleHelp} title="Помощь и FAQ" subtitle="Ответы на частые вопросы" onClick={() => navigate('/profile/help')} /></div>
    <p className="hint centered-text">{isMock ? 'Демонстрационный профиль сохранён в браузере.' : saving ? 'Сохраняем настройки…' : 'Профиль и план сохранены в вашем аккаунте.'}<br />Автоматический подбор пока не подключён.</p><button className="profile-signout" onClick={() => { logout(); navigate('/welcome', { replace: true }); }}>Выйти из аккаунта</button>{storageError && <Notice tone="error">{storageError}</Notice>}{editing && <SubjectsDialog value={profile.subjects} onApply={subjects => update({ subjects })} error={storageError} onClose={() => setEditing(false)} />}
  </>;
}
