import { useId, useMemo, useState } from 'react';
import { Button, Dialog, Loading, Notice, Icon } from '@olimp/ui';
import { useDirections, useUniversities } from '../../lib/queries';
import { directionNote, directionRank, goalLimits, orderOptions, pickByKey, universityRank, type Direction, type University } from './goal-format';

type Option = { value: string; label: string; note?: string };

/**
 * Figma «🗂️ Popup — Интересующие предметы» (104:147) for longer lists: the same checkbox rows and «Готово»,
 * plus a search field and a limit, because there are ~40 universities and ~300 directions.
 */
function ChoiceDialog({ title, hint, searchPlaceholder, limit, value, options, query, onQuery, pending, error, onRetry, onApply, onClose }: {
  title: string; hint: string; searchPlaceholder: string; limit: number; value: string[]; options: Option[];
  query: string; onQuery: (query: string) => void; pending: boolean; error: boolean; onRetry: () => void;
  onApply: (value: string[]) => void; onClose: () => void;
}) {
  const [selected, setSelected] = useState(value);
  const searchId = useId();
  const full = selected.length >= limit;
  return <Dialog title={title} className="subjects-dialog goal-dialog" onClose={onClose}>
    <p className="subjects-dialog__hint">{hint} · выбрано {selected.length} из {limit}</p>
    <label className="goal-dialog__search" htmlFor={searchId}><Icon name="search" size={15} />
      <input id={searchId} type="search" value={query} placeholder={searchPlaceholder} autoComplete="off" onChange={event => onQuery(event.target.value)} />
      {query && <button type="button" aria-label="Очистить поиск" onClick={() => onQuery('')}><Icon name="x" size={11} /></button>}</label>
    {pending ? <Loading /> : error ? <Notice tone="error">Список не загрузился. <button type="button" className="text-button" onClick={onRetry}>Повторить</button></Notice>
      : !options.length ? <p className="goal-dialog__empty">Ничего не нашлось. Попробуйте другое слово или код.</p>
      : <div className="subjects-dialog__list" role="group" aria-label={title}>{options.map(option => {
        const checked = selected.includes(option.value);
        return <label key={option.value} className={`subject-choice ${checked ? 'is-selected' : ''} ${!checked && full ? 'is-disabled' : ''}`}>
          <span className="subject-choice__text"><span>{option.label}</span>{option.note && <small>{option.note}</small>}</span>
          <input type="checkbox" checked={checked} disabled={!checked && full}
            onChange={() => setSelected(current => checked ? current.filter(item => item !== option.value) : [...current, option.value])} />
          <span className="subject-choice__check" aria-hidden="true">{checked && <Icon name="check" size={12} />}</span>
        </label>;
      })}</div>}
    {full && <p className="goal-dialog__limit">Можно выбрать не больше {limit}. Снимите отметку, чтобы выбрать другое.</p>}
    <Button className="full-width" disabled={pending || error} onClick={() => { onApply(selected); onClose(); }}>Готово</Button>
  </Dialog>;
}

export function UniversitiesDialog({ value, onApply, onClose }: { value: string[]; onApply: (value: string[]) => void; onClose: () => void }) {
  const universities = useUniversities();
  const [query, setQuery] = useState('');
  const [pinned] = useState(() => new Set(value));
  const options = useMemo(() => orderOptions<University>(universities.data?.items ?? [], query, universityRank, item => pinned.has(item.slug),
    () => false, (a, b) => a.name.localeCompare(b.name, 'ru')).map(item => ({ value: item.slug, label: item.name, note: item.city })), [universities.data, query, pinned]);
  return <ChoiceDialog title="Целевые вузы" hint="Можно выбрать несколько" searchPlaceholder="Название или город" limit={goalLimits.universities}
    value={value} options={options} query={query} onQuery={setQuery} pending={universities.isPending} error={universities.isError}
    onRetry={() => universities.refetch()} onApply={onApply} onClose={onClose} />;
}

export function DirectionsDialog({ value, onApply, onClose }: { value: string[]; onApply: (value: string[]) => void; onClose: () => void }) {
  const directions = useDirections();
  const [query, setQuery] = useState('');
  const [pinned] = useState(() => new Set(value));
  const options = useMemo(() => orderOptions<Direction>(directions.data?.items ?? [], query, directionRank, item => pinned.has(item.code),
    item => item.popular, (a, b) => a.code.localeCompare(b.code)).map(item => ({ value: item.code, label: item.name, note: directionNote(item) })), [directions.data, query, pinned]);
  return <ChoiceDialog title="Направления" hint="Можно выбрать несколько" searchPlaceholder="Например, врач, прога или 09.03.04" limit={goalLimits.directions}
    value={value} options={options} query={query} onQuery={setQuery} pending={directions.isPending} error={directions.isError}
    onRetry={() => directions.refetch()} onApply={onApply} onClose={onClose} />;
}

/** The chosen universities and directions with their names, for the profile and the pickers' buttons. */
export function useGoal(goal: { universities: string[]; directions: string[] }) {
  const universities = useUniversities();
  const directions = useDirections();
  return {
    universities: pickByKey(universities.data?.items, goal.universities, item => item.slug),
    directions: pickByKey(directions.data?.items, goal.directions, item => item.code),
    universitiesState: universities, directionsState: directions,
  };
}

/** «МФТИ, СПбГУ» on a picker button; «Выбрано: 3» while the names are loading. */
export function goalLabel(names: string[], count: number, placeholder: string) {
  return names.length ? names.join(', ') : count ? `Выбрано: ${count}` : placeholder;
}
