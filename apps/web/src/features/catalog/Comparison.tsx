import { useEffect, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Button, Dialog, Icon, Notice } from '@olimp/ui';
import type { OlympiadDetail } from '@olimp/contracts';
import type { z } from 'zod';
import { api } from '../../lib/api';
import { formats, gradeLabel, levelLabel } from '../../lib/format';
import { useUI } from '../../lib/ui-store';
import { registrationLabel } from './detail-format';

type Detail = z.infer<typeof OlympiadDetail>;
const rows: [string, (item: Detail) => string][] = [
  ['Уровень', item => levelLabel(item)],
  ['Формат', item => formats[item.format]],
  ['Класс', item => gradeLabel(item)],
  ['Дедлайн', item => registrationLabel(item)],
  ['Организатор', item => item.organizers.join(', ') || 'Не указан'],
];

// Parameter names stay in the first column while the olympiad columns scroll sideways.
export function Comparison({ onClose }: { onClose: () => void }) {
  const ids = useUI(state => state.comparisonIds);
  const remove = useUI(state => state.removeFromComparison);
  const queries = useQueries({ queries: ids.map(id => ({ queryKey: ['olympiad', id], queryFn: () => api.detail(id) })) });
  useEffect(() => { if (!ids.length) onClose(); }, [ids.length, onClose]);
  return <Dialog title="Сравнение олимпиад" className="comparison-dialog" onClose={onClose}>
    <p className="muted dialog-intro">Выбрано: {ids.length}{ids.length > 1 && ' · листайте вправо'}</p>
    {ids.length === 1 && <Notice tone="info">Выберите ещё хотя бы одну олимпиаду, чтобы сравнить.</Notice>}
    <div className="comparison-wrap" role="region" aria-label="Таблица сравнения" tabIndex={0}><table className="comparison-table">
      <thead><tr><th scope="row">Олимпиада</th>{ids.map((id, index) => {
        const query = queries[index];
        const item = query?.data;
        return <th scope="col" key={id}><div className="comparison-table__head">
          {item ? <span><strong>{item.title}</strong><small>{item.subjects.map(subject => subject.name).join(', ')}</small></span> : <span className="muted">{query?.isError ? 'Не удалось загрузить' : 'Загружаем…'}</span>}
          <button type="button" className="icon-button comparison-table__remove" aria-label={item ? `Убрать из сравнения: ${item.title}` : 'Убрать из сравнения'} onClick={() => remove(id)}><Icon name="x" size={13} /></button>
        </div></th>;
      })}</tr></thead>
      <tbody>{rows.map(([label, value]) => <tr key={label}><th scope="row">{label}</th>{ids.map((id, index) => {
        const item = queries[index]?.data;
        return <td key={id}>{item ? value(item) : '—'}</td>;
      })}</tr>)}</tbody>
    </table></div>
    <Button className="full-width" onClick={onClose}>Готово</Button>
  </Dialog>;
}

// Appears once two or more olympiads are chosen; one instance serves every screen that shows it.
export function CompareButton({ visible }: { visible: boolean }) {
  const count = useUI(state => state.comparisonIds.length);
  const [open, setOpen] = useState(false);
  const shown = visible && count >= 2;
  return <>
    <div className={`compare-fab ${shown ? 'is-visible' : ''}`} inert={!shown}>
      <Button className="compare-fab__button" onClick={() => setOpen(true)}><Icon name="compare" size={18} />Сравнить ({count})</Button>
    </div>
    {open && <Comparison onClose={() => setOpen(false)} />}
  </>;
}
