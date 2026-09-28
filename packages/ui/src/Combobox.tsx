import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export type ComboboxGroup = { label: string; options: string[] };
type ComboboxProps = {
  value: string;
  onChange: (value: string) => void;
  /** Options that fit the typed text, grouped under headings; the caller filters them. */
  groups: ComboboxGroup[];
  label: string;
  placeholder?: string;
  icon?: IconName;
  invalid?: boolean;
  describedBy?: string;
  inputId?: string;
  autoComplete?: string;
  emptyTitle?: string;
  emptyHint?: string;
};

const fold = (text: string) => text.toLocaleLowerCase('ru').replaceAll('ё', 'е');
/** Marks the beginnings of words that the typed words start: «сар об» → **Сар**атовская **об**ласть. */
export function highlightWords(label: string, query: string): ReactNode {
  const words = fold(query).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (!words.length) return label;
  const folded = fold(label);
  const marks: [number, number][] = [];
  for (const match of folded.matchAll(/[\p{L}\p{N}]+/gu)) {
    const word = words.filter(w => match[0].startsWith(w)).sort((a, b) => b.length - a.length)[0];
    if (word) marks.push([match.index, match.index + word.length]);
  }
  if (!marks.length) return label;
  const parts: ReactNode[] = [];
  let at = 0;
  for (const [from, to] of marks) {
    if (from > at) parts.push(label.slice(at, from));
    parts.push(<mark key={from}>{label.slice(from, to)}</mark>);
    at = to;
  }
  if (at < label.length) parts.push(label.slice(at));
  return parts;
}

/** A text field with a list of suggestions under it: type to narrow the list, pick with a tap, arrows or Enter. */
export function Combobox({ value, onChange, groups, label, placeholder, icon, invalid = false, describedBy, inputId, autoComplete = 'off',
  emptyTitle = 'Ничего не найдено', emptyHint = 'Попробуйте другое название' }: ComboboxProps) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const options = groups.flatMap(group => group.options);
  const selectedIndex = options.findIndex(option => option === value);
  const activeOption = active >= 0 ? options[active] : undefined;

  function show() {
    setActive(selectedIndex);
    setOpen(true);
    // Leave room for the list above the on-screen keyboard.
    requestAnimationFrame(() => {
      const rect = root.current?.getBoundingClientRect();
      const viewport = window.visualViewport;
      const bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight);
      if (rect && bottom - rect.bottom < 240) root.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }
  function choose(option: string) { onChange(option); setOpen(false); setActive(-1); input.current?.focus({ preventScroll: true }); }

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false); }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => {
    if (!open || !list.current) return;
    const option = list.current.querySelector<HTMLElement>(active >= 0 ? `[data-index="${active}"]` : '[aria-selected="true"]');
    if (!option) { if (active < 0) list.current.scrollTop = 0; return; }
    const box = list.current;
    if (option.offsetTop - 28 < box.scrollTop) box.scrollTop = Math.max(0, option.offsetTop - 28);
    else if (option.offsetTop + option.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = option.offsetTop + option.offsetHeight - box.clientHeight;
  }, [open, active, value]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) { show(); return; }
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setActive(index => options.length ? (index < 0 ? (direction > 0 ? 0 : options.length - 1) : (index + direction + options.length) % options.length) : -1);
    } else if (event.key === 'Enter' && open && activeOption) {
      event.preventDefault(); choose(activeOption);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault(); event.stopPropagation(); setOpen(false);
    } else if (event.key === 'Tab') setOpen(false);
  }

  let index = -1;
  return <div ref={root} className={`combobox ${open ? 'is-open' : ''} ${invalid ? 'is-invalid' : ''}`}>
    <div className="combobox__control">
      {icon && <Icon name={icon} size={17} />}
      <input ref={input} id={inputId} role="combobox" aria-label={label} aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list"
        aria-activedescendant={open && activeOption !== undefined ? `${id}-option-${active}` : undefined} aria-invalid={invalid || undefined} aria-describedby={describedBy}
        autoComplete={autoComplete} spellCheck={false} value={value} placeholder={placeholder}
        onFocus={show} onClick={() => { if (!open) show(); }} onBlur={() => setOpen(false)} onKeyDown={onKeyDown}
        onChange={event => { onChange(event.target.value); setActive(-1); if (!open) show(); }} />
      {value && <button type="button" className="combobox__clear" aria-label={`Очистить поле «${label}»`} onMouseDown={event => event.preventDefault()} onClick={() => { onChange(''); setActive(-1); input.current?.focus(); if (!open) show(); }}><Icon name="x" size={13} /></button>}
      <Icon name="chevron-down" size={15} className="combobox__chevron" />
    </div>
    {open && <div ref={list} id={`${id}-list`} className="combobox__menu" role="listbox" aria-label={label}>
      {groups.map(group => <div key={group.label} role="group" aria-labelledby={`${id}-${group.label}`}>
        <div id={`${id}-${group.label}`} className="combobox__group" role="presentation">{group.label}</div>
        {group.options.map(option => {
          index++;
          const current = index;
          return <div key={option} id={`${id}-option-${current}`} role="option" data-index={current} aria-selected={option === value}
            className={`combobox__option ${current === active ? 'is-active' : ''} ${option === value ? 'is-selected' : ''}`}
            onPointerMove={() => { if (active !== current) setActive(current); }} onMouseDown={event => event.preventDefault()} onClick={() => choose(option)}>
            <span>{option === value ? option : highlightWords(option, value)}</span>{option === value && <Icon name="check" size={14} />}
          </div>;
        })}
      </div>)}
      {!options.length && <div className="select__empty" role="status">{emptyTitle}<span>{emptyHint}</span></div>}
    </div>}
  </div>;
}
