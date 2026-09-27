import { Link } from 'react-router-dom';
import { Button, Notice, Icon } from '@olimp/ui';
import type { Olympiad } from '../../lib/api';
import { usePlanActions } from '../../lib/queries';
import { scheduleLabel } from '../../lib/format';
import { useUI } from '../../lib/ui-store';
import { OlympiadMeta, OlympiadStatus, OlympiadTags } from './OlympiadSummary';

export function OlympiadCard({ item, saved, tracking = true, backTo, returnTo }: { item: Olympiad; saved: boolean; tracking?: boolean; backTo?: string; returnTo?: string }) {
  const mutation = usePlanActions();
  const selected = useUI(state => state.comparisonIds);
  const toggle = useUI(state => state.toggleComparison);
  const checked = selected.includes(item.id);
  return <article className={`olympiad-card ${checked ? 'olympiad-card--selected' : ''}`}>
    <OlympiadStatus item={item} />
    <h2><Link className="olympiad-card__link" to={`/olympiads/${item.id}`} state={backTo ? { backTo, returnTo } : undefined}>{item.title}</Link></h2>
    <OlympiadMeta item={item} /><OlympiadTags item={item} compact />
    <div className="card-schedule"><span className="muted">{item.nextEvent ? item.nextEvent.name || 'Ближайший этап' : 'Расписание'}</span>
      <span className="schedule-line"><Icon name="bell" size={15} />{scheduleLabel(item)}</span>
    </div>
    <div className="card-actions"><label className={`compare-check ${checked ? 'is-checked' : ''}`}><input type="checkbox" checked={checked} onChange={() => toggle(item.id)} /><span className="compare-check__box" aria-hidden="true">{checked && <Icon name="check" size={11} />}</span><span>{checked ? 'Выбрано' : 'Сравнить'}</span></label>
      <Button size="small" className={saved && tracking ? 'tracking-button--saved' : ''} variant={saved && tracking ? 'secondary' : 'primary'} aria-pressed={saved && tracking} disabled={mutation.isPending} onClick={() => mutation.mutate(saved ? { id: item.id, action: 'patch', patch: { tracking: !tracking } } : { id: item.id, action: 'save' })}>
        {saved && tracking && <Icon name="check" size={13} />}{mutation.isPending ? 'Сохраняем…' : saved && tracking ? 'Отслеживается' : 'Отслеживать'}
      </Button>
    </div>
    {mutation.isError && <Notice tone="error">{mutation.error.message}</Notice>}
  </article>;
}