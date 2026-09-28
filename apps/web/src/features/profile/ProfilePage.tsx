import { useNavigate } from 'react-router-dom';
import { Button, Chip, Header, Notice, SettingsRow, Icon } from '@olimp/ui';
import { useFilters } from '../../lib/queries';
import { useProfile } from '../../lib/profile';
import { max } from '../../lib/max';
import { useSession } from '../../lib/session';
import { profileGradeLabel } from '../../lib/format';
import { ProfileAvatar } from './ProfileAvatar';
import { useTheme, type ThemePreference } from '../../lib/theme';

const themeOptions: { value: ThemePreference; label: string }[] = [{ value: 'light', label: 'Светлая' }, { value: 'dark', label: 'Тёмная' }, { value: 'system', label: 'Системная' }];

export function ProfilePage() {
  const navigate = useNavigate();
  const { profile, storageError, saving, legacy, importLegacy } = useProfile();
  const { logout } = useSession();
  const { preference, setPreference } = useTheme();
  const filters = useFilters();
  const grade = profileGradeLabel(profile.grade);
  const selected = filters.data?.subjects.filter(subject => profile.subjects.includes(subject.id)) ?? [];
  const empty = <p className="panel-section__empty">Не выбрано</p>;
  const subjects = filters.isPending && profile.subjects.length ? <p className="panel-section__empty">Загружаем…</p>
    : filters.isError && profile.subjects.length ? <p className="panel-section__empty">Не удалось загрузить названия предметов.</p>
    : !selected.length ? empty
    : <div className="chips-wrap">{selected.map(subject => <Chip key={subject.id} selected>{subject.name}</Chip>)}</div>;
  const format = (label: string, enabled: boolean) => <div className="switch-row"><span>{label}</span><small className={enabled ? 'text-green' : 'muted'}>{enabled ? 'Включено' : 'Выключено'}</small></div>;
  return <><Header title="Профиль" />
    <section className="profile-card panel"><ProfileAvatar image={profile.avatar} /><div><h2>{profile.name || max.displayName}</h2><p>{[grade ?? 'Класс не указан', profile.region].filter(Boolean).join(' · ')}</p></div></section>
    {legacy && <Notice tone="info">На этом устройстве остались настройки из предыдущей версии. <button className="text-button" disabled={saving} onClick={importLegacy}>Перенести их в аккаунт</button></Notice>}
    <div className="panel profile-details">
      <section className="panel-section"><h2 className="section-caption">Класс обучения</h2>{grade ? <div className="chips-wrap"><Chip selected>{grade}</Chip></div> : empty}</section>
      <section className="panel-section"><h2 className="section-caption">Интересующие предметы</h2>{subjects}</section>
      <section className="panel-section"><h2 className="section-caption">Желаемый формат</h2>{format('Онлайн-этапы', profile.online)}{format('Очные финалы', profile.onsite)}</section>
    </div>
    <Button className="full-width profile-edit-button" onClick={() => navigate('/profile/edit')}><Icon name="edit" size={15} />Редактировать профиль</Button>
    <div className="settings-list profile-links"><SettingsRow icon="shield" tone="green" title="Данные и конфиденциальность" subtitle="Управление данными" onClick={() => navigate('/profile/privacy')} /><SettingsRow icon="help-circle" title="Помощь и FAQ" subtitle="Ответы на частые вопросы" onClick={() => navigate('/profile/help')} /><SettingsRow icon="graduation-cap" tone="amber" title="Вопросы по олимпиадам" subtitle="Участие, БВИ, льготы и дипломы" onClick={() => navigate('/profile/olympiad-faq')} /></div>
    <section className="panel theme-picker"><h2 id="theme-picker-title">Тема оформления</h2><div className="segmented segmented--fill" role="radiogroup" aria-labelledby="theme-picker-title">{themeOptions.map(option =>
      <button key={option.value} type="button" role="radio" aria-checked={preference === option.value} className={preference === option.value ? 'is-active' : ''} onClick={() => setPreference(option.value)}>{option.label}</button>)}
    </div></section>
    <button className="profile-signout" onClick={() => { logout(); navigate('/welcome', { replace: true }); }}>Выйти из аккаунта</button>{storageError && <Notice tone="error">{storageError}</Notice>}
  </>;
}
