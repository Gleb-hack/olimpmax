import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Search, X, type LucideIcon } from 'lucide-react';

type Option = { value: string; label: string };
type SelectProps = {
  label: string;
  placeholder: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  icon?: LucideIcon;
  searchable?: boolean;
  searchPlaceholder?: string;
  align?: 'left' | 'right';
};

/** Single-select menu shared by catalogue filters and the profile editor. */
export function Select({ label, placeholder, options, value, onChange, icon: Icon, searchable = false, searchPlaceholder = 'Найти в списке', align = 'left' }: SelectProps) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' });
  const typeahead = useRef({ text: '', time: 0 });
  const normalize = (text: string) => text.toLocaleLowerCase('ru').replace(/ё/g, 'е');
  const filtered = options.filter(option => normalize(option.label).includes(normalize(query.trim())));
  const selected = options.find(option => option.value === value);
  const activeOption = filtered[active];

  function close(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  }
  function show() {
    setQuery('');
    setActive(Math.max(0, options.findIndex(option => option.value === value)));
    setPosition({ visibility: 'hidden' });
    setOpen(true);
  }
  function choose(option: Option) { onChange(option.value); close(true); }

  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      if (!trigger.current) return;
      const rect = trigger.current.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportTop = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? document.documentElement.clientWidth;
      const height = viewport?.height ?? window.innerHeight;
      const menuWidth = Math.min(Math.max(rect.width, searchable ? 292 : 232), width - 24);
      const below = viewportTop + height - rect.bottom - 12;
      const above = rect.top - viewportTop - 12;
      const upwards = below < 220 && above > below;
      const available = Math.max(100, Math.min(370, upwards ? above - 8 : below - 8));
      const left = Math.max(viewportLeft + 12, Math.min(align === 'right' ? rect.right - menuWidth : rect.left, viewportLeft + width - menuWidth - 12));
      setPosition({ left, width: menuWidth, maxHeight: available, ...(upwards ? { bottom: window.innerHeight - rect.top + 8 } : { top: rect.bottom + 8 }) });
    }
    place();
    window.addEventListener('resize', place);
    window.visualViewport?.addEventListener('resize', place);
    window.visualViewport?.addEventListener('scroll', place);
    function onScroll(event: Event) { if (!(event.target instanceof Node) || !panel.current?.contains(event.target)) place(); }
    document.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('scroll', place);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [open, searchable, align]);

  useEffect(() => {
    if (!open) return;
    // Keep the keyboard closed on touch devices until the search field is tapped.
    list.current?.focus({ preventScroll: true });
    function outside(event: PointerEvent | FocusEvent) {
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', outside); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const option = list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (option && list.current) {
      if (option.offsetTop < list.current.scrollTop) list.current.scrollTop = option.offsetTop;
      else if (option.offsetTop + option.offsetHeight > list.current.scrollTop + list.current.clientHeight) list.current.scrollTop = option.offsetTop + option.offsetHeight - list.current.clientHeight;
    }
  }, [open, active, query, position.maxHeight]);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
    if (event.key === 'Tab') return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setActive(index => filtered.length ? (index + direction + filtered.length) % filtered.length : 0);
    } else if ((event.key === 'Home' || event.key === 'End') && event.target !== input.current) {
      event.preventDefault(); setActive(event.key === 'Home' ? 0 : Math.max(0, filtered.length - 1));
    } else if (event.key === 'Enter' || (event.key === ' ' && event.target !== input.current)) {
      event.preventDefault(); if (activeOption) choose(activeOption);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && event.target !== input.current) {
      event.preventDefault();
      if (searchable) { setQuery(event.key); setActive(0); input.current?.focus(); }
      else {
        const now = Date.now();
        typeahead.current = { text: (now - typeahead.current.time < 700 ? typeahead.current.text : '') + event.key, time: now };
        const index = filtered.findIndex(option => normalize(option.label).startsWith(normalize(typeahead.current.text)));
        if (index >= 0) setActive(index);
      }
    }
  }

  return <div className="select">
    <button ref={trigger} type="button" role="combobox" className={`select__trigger ${value ? 'is-selected' : ''} ${open ? 'is-open' : ''}`} aria-label={label} aria-expanded={open} aria-haspopup="listbox" aria-controls={`${id}-list`} onClick={() => open ? close() : show()} onKeyDown={event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); show(); }
    }}>{Icon && <Icon size={17} />}<span>{value ? selected?.label || placeholder : placeholder}</span><ChevronDown size={15} className="select__chevron" /></button>
    {open && <div ref={panel} className="select__menu" style={position} onKeyDown={onKeyDown}>
      <div className="select__heading"><span>{label}</span><span>{options.length - (options.some(option => option.value === '') ? 1 : 0)}</span></div>
      {searchable && <div className="select__search"><Search size={16} /><input ref={input} role="combobox" aria-label={searchPlaceholder} aria-expanded="true" aria-autocomplete="list" aria-controls={`${id}-list`} aria-activedescendant={activeOption ? `${id}-option-${active}` : undefined} placeholder={searchPlaceholder} value={query} onChange={event => { setQuery(event.target.value); setActive(0); }} />{query && <button type="button" aria-label="Очистить поиск в списке" onClick={() => { setQuery(''); setActive(0); input.current?.focus(); }}><X size={14} /></button>}</div>}
      <div ref={list} id={`${id}-list`} className="select__options" role="listbox" aria-label={label} tabIndex={-1} aria-activedescendant={activeOption ? `${id}-option-${active}` : undefined}>
        {filtered.map((option, index) => <div key={option.value} id={`${id}-option-${index}`} role="option" aria-selected={option.value === value} data-index={index} className={`select__option ${option.value === value ? 'is-selected' : ''} ${index === active ? 'is-active' : ''} ${option.value === '' ? 'is-reset' : ''}`} onPointerMove={() => { if (active !== index) setActive(index); }} onMouseDown={event => event.preventDefault()} onClick={() => choose(option)}><span>{option.label}</span>{option.value === value && <Check size={16} strokeWidth={2} />}</div>)}
        {!filtered.length && <div className="select__empty" role="status">Ничего не найдено<span>Попробуйте другое название</span></div>}
      </div>
    </div>}
  </div>;
}
