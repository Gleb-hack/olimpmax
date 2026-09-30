import { Link, useNavigate } from 'react-router-dom';
import { Button, Notice, Icon } from '@olimp/ui';
import type { Olympiad } from '../../lib/api';
import { usePlanActions } from '../../lib/queries';
import { scheduleLabel } from '../../lib/format';
import { useUI } from '../../lib/ui-store';
import { OlympiadMeta, OlympiadStatus, OlympiadTags, StageCountdown } from './OlympiadSummary';
import { GoalReasons } from './GoalReasons';

export function OlympiadCard({ item, saved, tracking = true, backTo, returnTo }: { item: Olympiad; saved: boolean; tracking?: boolean; backTo?: string; returnTo?: string }) {
  const mutation = usePlanActions();
  const navigate = useNavigate();
  const selected = useUI(state => state.comparisonIds);
  const toggle = useUI(state => state.toggleComparison);
  const checked = selected.includes(item.id);
  return <article className={`olympiad-card ${checked ? 'olympiad-card--selected' : ''}`} data-tour="olympiad-card">
    <OlympiadStatus item={item} />
    <h2><Link className="olympiad-card__link" to={`/olympiads/${item.id}`} state={backTo ? { backTo, returnTo } : undefined}>{item.title}</Link></h2>
    <OlympiadMeta item={item} /><OlympiadTags item={item} compact />
    <GoalReasons match={item.goalMatch} />
    <div className="card-schedule"><span className="muted">{item.nextEvent ? item.nextEvent.name || 'Ближайший этап' : 'Расписание'}</span>
      <span className="schedule-line"><Icon name="bell" size={15} />{scheduleLabel(item)}</span>
      <StageCountdown item={item} />
    </div>
    <div className="card-actions"><label className={`compare-check ${checked ? 'is-checked' : ''}`} data-tour="compare-check"><input type="checkbox" checked={checked} onChange={() => toggle(item.id)} /><span className="compare-check__box" aria-hidden="true">{checked && <Icon name="check" size={11} />}</span><span>{checked ? 'Выбрано' : 'Сравнить'}</span></label>
      {/* Not saved → «Отслеживать»; tracked → «Отслеживается» (a tap pauses it); paused → «В плане», which opens the olympiad in «Мой план». */}
      {saved && !tracking ? <Button size="small" variant="secondary" className="plan-button" onClick={() => navigate(`/plan?olympiad=${item.id}`, { state: backTo?.startsWith('/catalog') ? { backTo } : undefined })}>
        <Icon name="calendar" size={13} />В плане
      </Button> : <Button size="small" className={saved ? 'tracking-button--saved' : ''} variant={saved ? 'secondary' : 'primary'} aria-pressed={saved} data-tour="track" disabled={mutation.isPending} onClick={() => mutation.mutate(saved ? { id: item.id, action: 'patch', patch: { tracking: false } } : { id: item.id, action: 'save' })}>
        {saved && <Icon name="check" size={13} />}{mutation.isPending ? 'Сохраняем…' : saved ? 'Отслеживается' : 'Отслеживать'}
      </Button>}
    </div>
    {mutation.isError && <Notice tone="error">{mutation.error.message}</Notice>}
  </article>;
}