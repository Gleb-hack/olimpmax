import { Bell, Check } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Notice } from '@olimp/ui';
import type { Olympiad } from '../../lib/api';
import { usePlanActions } from '../../lib/queries';
import { scheduleLabel } from '../../lib/format';
import { useUI } from '../../lib/ui-store';
import { OlympiadMeta, OlympiadStatus, OlympiadTags } from './OlympiadSummary';

export function OlympiadCard({ item, saved, tracking = true, backTo, returnTo }: { item: Olympiad; saved: boolean; tracking?: boolean; backTo?: string; returnTo?: string }) {
  const navigate = useNavigate();
  const mutation = usePlanActions();
  const selected = useUI(state => state.comparisonIds);
  const toggle = useUI(state => state.toggleComparison);
  const checked = selected.includes(item.id);
  return <article className={`olympiad-card ${checked ? 'olympiad-card--selected' : ''}`}>
    <OlympiadStatus item={item} />
    <h2><Link className="olympiad-card__link" to={`/olympiads/${item.id}`} state={backTo ? { backTo, returnTo } : undefined}>{item.title}</Link></h2>
    <OlympiadMeta item={item} /><OlympiadTags item={item} compact />
    <div className="card-schedule"><span className="muted">{item.nextEvent ? item.nextEvent.name || 'Ближайший этап' : 'Расписание'}</span>
      <span className="schedule-line"><Bell size={13} />{scheduleLabel(item)}</span>
    </div>
    <div className="card-actions"><label className={`compare-check ${checked ? 'is-checked' : ''}`}><input type="checkbox" checked={checked} disabled={!checked && selected.length === 2} onChange={() => toggle(item.id)} /><span className="compare-check__box" aria-hidden="true">{checked && <Check size={11} strokeWidth={3} />}</span><span>{checked ? 'Выбрано' : 'Сравнить'}</span></label>
      <Button size="small" className={saved && tracking ? 'tracking-button--saved' : ''} variant={saved ? 'secondary' : 'primary'} disabled={mutation.isPending} onClick={() => saved ? navigate('/plan') : mutation.mutate({ id: item.id, action: 'save' })}>
        {saved && tracking && <Check size={13} />}{mutation.isPending ? 'Сохраняем…' : saved ? tracking ? 'Отслеживается' : 'В плане' : 'Отслеживать'}
      </Button>
    </div>
    {mutation.isError && <Notice tone="error">{mutation.error.message}</Notice>}
  </article>;
}
