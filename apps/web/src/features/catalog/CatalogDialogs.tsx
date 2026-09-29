import { useId, useMemo, useState } from 'react';
import { Button, Dialog, Icon, Loading, Notice, type IconName } from '@olimp/ui';

export type Choice = { value: string; label: string; note?: string };

/** A checkbox row of the catalog popups: the same look as «Интересующие предметы». */
function CheckRow({ option, checked, onToggle }: { option: Choice; checked: boolean; onToggle: () => void }) {
  return <label className={`subject-choice ${checked ? 'is-selected' : ''}`}>
    <span className="subject-choice__text"><span>{option.label}</span>{option.note && <small>{option.note}</small>}</span>
    <input type="checkbox" checked={checked} onChange={onToggle} />
    <span className="subject-choice__check" aria-hidden="true">{checked && <Icon name="check" size={12} />}</span>
  </label>;
}

/**
 * Figma «Popup — Формат», «Popup — Уровень»: a few checkboxes and «Готово». Nothing chosen — the filter is off.
 */
export function MultiChoiceDialog({ title, hint, options, value, onApply, onClose }: {
  title: string; hint?: string; options: readonly Choice[]; value: string[]; onApply: (value: string[]) => void; onClose: () => void;
}) {
  const [selected, setSelected] = useState(value);
  return <Dialog title={title} className="subjects-dialog catalog-dialog" onClose={onClose}>
    {hint && <p className="subjects-dialog__hint">{hint}</p>}
    <div className="subjects-dialog__list catalog-dialog__list" role="group" aria-label={title}>{options.map(option => {
      const checked = selected.includes(option.value);
      return <CheckRow key={option.value} option={option} checked={checked}
        onToggle={() => setSelected(current => checked ? current.filter(item => item !== option.value) : [...current, option.value])} />;
    })}</div>
    <Button className="full-width" onClick={() => { onApply(options.map(option => option.value).filter(item => selected.includes(item))); onClose(); }}>Готово</Button>
  </Dialog>;
}

/**
 * Figma «Popup — Выбор класса» and the city and direction pickers of «Вузы»: one value, a tap chooses and closes;
 * a tap on the chosen value clears it. Long lists get a search field.
 */
export function SingleChoiceDialog({ title, options, value, onPick, onClose, search, pending = false, error = false, onRetry }: {
  title: string; options: Choice[]; value: string; onPick: (value: string) => void; onClose: () => void;
  search?: { placeholder: string; rank: (option: Choice, query: string) => number | null };
  pending?: boolean; error?: boolean; onRetry?: () => void;
}) {
  const [query, setQuery] = useState('');
  const searchId = useId();
  const shown = useMemo(() => !search || !query.trim() ? options
    : options.flatMap(option => { const rank = search.rank(option, query); return rank === null ? [] : [{ option, rank }]; })
      .sort((a, b) => a.rank - b.rank).map(entry => entry.option), [options, query, search]);
  const pick = (next: string) => { onPick(next === value ? '' : next); onClose(); };
  return <Dialog title={title} className={`subjects-dialog catalog-dialog ${search ? 'goal-dialog' : ''}`} onClose={onClose}>
    {search && <label className="goal-dialog__search" htmlFor={searchId}><Icon name="search" size={15} />
      <input id={searchId} type="search" value={query} placeholder={search.placeholder} autoComplete="off" onChange={event => setQuery(event.target.value)} />
      {query && <button type="button" aria-label="Очистить поиск" onClick={() => setQuery('')}><Icon name="x" size={11} /></button>}</label>}
    {pending ? <Loading /> : error ? <Notice tone="error">Список не загрузился. {onRetry && <button type="button" className="text-button" onClick={onRetry}>Повторить</button>}</Notice>
      : !shown.length ? <p className="goal-dialog__empty">Ничего не нашлось. Попробуйте другое слово.</p>
      : <div className="subjects-dialog__list catalog-dialog__list catalog-dialog__list--pick" role="listbox" aria-label={title}>{shown.map(option => {
        const selected = option.value === value;
        return <button key={option.value} type="button" role="option" aria-selected={selected} className={`subject-choice catalog-pick ${selected ? 'is-selected' : ''}`} onClick={() => pick(option.value)}>
          <span className="subject-choice__text"><span>{option.label}</span>{option.note && <small>{option.note}</small>}</span>
          {selected && <Icon name="check" size={16} className="catalog-pick__check" />}
        </button>;
      })}</div>}
  </Dialog>;
}

/** Figma «Popup — Сортировка» and «Popup — Сортировка (Вузы)»: a title and a note per order, a tap applies and closes. */
export function SortDialog<T extends string>({ options, value, onPick, onClose }: {
  options: readonly { value: T; label: string; description: string }[]; value: T; onPick: (value: T) => void; onClose: () => void;
}) {
  return <Dialog title="Сортировать по" className="subjects-dialog catalog-dialog sort-dialog" onClose={onClose}>
    <div className="sort-dialog__list" role="radiogroup" aria-label="Сортировать по">{options.map(option => {
      const checked = option.value === value;
      return <label key={option.value} className={`sort-row ${checked ? 'is-selected' : ''}`}>
        <span className="sort-row__copy"><strong>{option.label}</strong><small>{option.description}</small></span>
        <input type="radio" name="catalog-sort" checked={checked} onChange={() => { onPick(option.value); onClose(); }} />
        <span className="sort-row__radio" aria-hidden="true" />
      </label>;
    })}</div>
  </Dialog>;
}

/** Figma «FilterChip»: a filter that opens its popup; with a value it shows it and turns blue. */
export function FilterChip({ icon, label, active, onClick, onClear }: { icon: IconName; label: string; active: boolean; onClick: () => void; onClear?: () => void }) {
  return <span className={`filter-chip ${active ? 'is-active' : ''}`}>
    <button type="button" className="filter-chip__main" aria-haspopup={onClear ? undefined : 'dialog'} onClick={onClick}>
      <Icon name={icon} size={14} /><span className="filter-chip__label">{label}</span>{!onClear && <Icon name="chevron-down" size={12} className="filter-chip__chevron" />}
    </button>
    {onClear && <button type="button" className="filter-chip__clear" aria-label={`Убрать фильтр «${label}»`} onClick={onClear}><Icon name="x" size={10} /></button>}
  </span>;
}
