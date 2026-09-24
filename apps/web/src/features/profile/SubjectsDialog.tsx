import { useState } from 'react';
import { Check } from 'lucide-react';
import { Button, Dialog, Loading, Notice } from '@olimp/ui';
import { useFilters } from '../../lib/queries';

const priority = ['Математика', 'Информатика', 'Физика', 'Химия', 'Биология', 'Русский язык'];
export function SubjectsDialog({ value, onApply, onClose, error }: { value: number[]; onApply: (value: number[]) => boolean | void | Promise<boolean | void>; onClose: () => void; error?: string | null }) {
  const [selected, setSelected] = useState(value);
  const [saving, setSaving] = useState(false);
  const filters = useFilters();
  const subjects = [...(filters.data?.subjects ?? [])].sort((a, b) => {
    const rank = (name: string) => priority.includes(name) ? priority.indexOf(name) : priority.length;
    return rank(a.name) - rank(b.name) || a.name.localeCompare(b.name, 'ru');
  });
  return <Dialog title="Интересующие предметы" className="subjects-dialog" onClose={onClose}>
    <p className="subjects-dialog__hint">Можно выбрать несколько</p>
    {filters.isPending ? <Loading /> : filters.isError ? <Notice tone="error">Предметы не загрузились. <button className="text-button" onClick={() => filters.refetch()}>Повторить</button></Notice> : <div className="subjects-dialog__list">{subjects.map(subject => {
      const checked = selected.includes(subject.id);
      return <label key={subject.id} className={`subject-choice ${checked ? 'is-selected' : ''}`}><span>{subject.name}</span><input type="checkbox" checked={checked} onChange={() => setSelected(current => checked ? current.filter(id => id !== subject.id) : [...current, subject.id])} /><span className="subject-choice__check" aria-hidden="true">{checked && <Check size={13} strokeWidth={3} />}</span></label>;
    })}</div>}
    {error && <Notice tone="error">{error}</Notice>}
    <Button className="full-width" disabled={!filters.data || saving} onClick={async () => { setSaving(true); try { if (await onApply(selected) !== false) onClose(); } finally { setSaving(false); } }}>{saving ? 'Сохраняем…' : 'Готово'}</Button>
  </Dialog>;
}
