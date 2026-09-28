import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Switch } from '@maxhub/max-ui';
import { Button, Combobox, Header, Notice, Select, Icon } from '@olimp/ui';
import { useProfile, type LocalProfile } from '../../lib/profile';
import { useFilters } from '../../lib/queries';
import { max } from '../../lib/max';
import { SubjectsDialog } from './SubjectsDialog';
import { ProfileAvatar } from './ProfileAvatar';
import { canonicalRegion, regionGroups, searchRegions } from '../../lib/regions';

export function EditProfilePage() {
  const { profile, update, storageError, saving, legacyAvatar } = useProfile();
  const [draft, setDraft] = useState<LocalProfile>(() => ({ ...profile, avatar: profile.avatar ?? legacyAvatar, name: profile.name || max.displayName }));
  const [photoChanged, setPhotoChanged] = useState(false);
  const [subjectsOpen, setSubjectsOpen] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [regionError, setRegionError] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const filters = useFilters();
  // The whole list while the field holds a chosen region, otherwise the regions that fit the typed text.
  const regionOptions = (canonicalRegion(draft.region) === draft.region ? regionGroups : searchRegions(draft.region))
    .map(group => ({ label: group.district, options: group.regions.map(region => region.name) }));
  const subjects = filters.data?.subjects.filter(subject => draft.subjects.includes(subject.id)).map(subject => subject.name).join(', ');
  function selectPhoto(file?: File) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1024 * 1024) { setPhotoError('Выберите фото JPG, PNG или WebP размером до 1 МБ.'); return; }
    const reader = new FileReader();
    reader.onload = () => { const avatar = reader.result; if (typeof avatar === 'string') { setDraft(current => ({ ...current, avatar })); setPhotoChanged(true); setPhotoError(''); } };
    reader.onerror = () => setPhotoError('Не удалось прочитать фото. Попробуйте другой файл.');
    reader.readAsDataURL(file);
  }
  return <><Header title="Редактировать профиль" back="/profile" />
    <form className="edit-profile" onSubmit={async event => {
      event.preventDefault();
      // A region comes from the list; a city saved before the list existed may stay as it is.
      const region = draft.region.trim() === '' ? '' : canonicalRegion(draft.region) ?? (draft.region.trim() === profile.region ? profile.region : null);
      if (region === null) { setRegionError(true); document.getElementById('profile-region')?.focus(); return; }
      const { avatar, ...preferences } = draft;
      if (await update({ ...preferences, ...(photoChanged || (profile.avatar === null && legacyAvatar !== null) ? { avatar } : {}), name: draft.name.trim(), region })) navigate('/profile');
    }}>
      <fieldset className="profile-controls" disabled={saving}><div className="avatar-editor"><ProfileAvatar image={draft.avatar} large /><button type="button" className="avatar-editor__button" aria-label="Изменить фото профиля" onClick={() => photoInput.current?.click()}><Icon name="edit" size={12} /></button><input ref={photoInput} type="file" className="sr-only" tabIndex={-1} accept="image/png,image/jpeg,image/webp" aria-label="Фото профиля" onChange={event => { selectPhoto(event.target.files?.[0]); event.target.value = ''; }} /></div>
      {photoError && <Notice tone="error">{photoError}</Notice>}
      <label className="field"><span>Имя</span><input required autoComplete="given-name" value={draft.name} maxLength={80} placeholder="Ваше имя" onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
      <div className="field"><label htmlFor="profile-region">Регион</label><Combobox inputId="profile-region" label="Регион" icon="map-pin" placeholder="Начните вводить регион" autoComplete="address-level1"
        value={draft.region} onChange={region => { setDraft({ ...draft, region }); setRegionError(false); }} groups={regionOptions}
        invalid={regionError} describedBy={regionError ? 'profile-region-error' : undefined} emptyTitle="Такого региона нет в списке" emptyHint="Попробуйте, например, «Татарстан» или «Москва»" />
        {regionError && <small id="profile-region-error" className="field__error" role="alert">Выберите регион из списка</small>}</div>
      <div className="field edit-profile__section"><span>Класс обучения</span><Select label="Класс обучения" placeholder="Не указан" value={draft.grade === null ? '' : String(draft.grade)} onChange={value => setDraft({ ...draft, grade: value ? Number(value) : null })} options={[{ value: '', label: 'Не указан' }, ...Array.from({ length: 11 }, (_, index) => ({ value: String(index + 1), label: `${index + 1} класс` }))]} /></div>
      <div className="field edit-profile__section"><span>Интересующие предметы</span><button type="button" className="subjects-trigger" aria-label="Изменить интересующие предметы" aria-haspopup="dialog" onClick={() => setSubjectsOpen(true)}><span>{subjects || (draft.subjects.length ? `Выбрано: ${draft.subjects.length}` : 'Выберите предметы')}</span><Icon name="chevron-down" size={16} /></button></div>
      <section className="section"><h2>Желаемый формат</h2><div className="settings-list"><label className="switch-row"><span>Онлайн-этапы</span><Switch aria-label="Онлайн-этапы" checked={draft.online} onChange={event => setDraft({ ...draft, online: event.target.checked })} /></label><label className="switch-row"><span>Очные финалы</span><Switch aria-label="Очные финалы" checked={draft.onsite} onChange={event => setDraft({ ...draft, onsite: event.target.checked })} /></label></div></section>
      {storageError && <Notice tone="error">{storageError}</Notice>}<Button type="submit" className="full-width edit-profile__save" disabled={saving}>{saving ? 'Сохраняем…' : 'Сохранить изменения'}</Button></fieldset>
    </form>{subjectsOpen && <SubjectsDialog value={draft.subjects} onApply={subjects => setDraft({ ...draft, subjects })} onClose={() => setSubjectsOpen(false)} />}
  </>;
}
