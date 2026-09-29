import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Switch } from '@maxhub/max-ui';
import { planStatusLabels, stageResultLabels } from '@olimp/contracts';
import { Button, Dialog, Icon, Notice, type IconName } from '@olimp/ui';
import type { PlanEntry } from '../../lib/api';
import { usePlanActions } from '../../lib/queries';
import { dateParts, moscowToday } from '../../lib/format';
import {
  defaultResultStage, hiddenStagesLabel, planSchedule, resultStageOptions, scheduleStageHint, scheduleWindow,
  type PlanStatus, type ScheduleStage,
} from './plan-card-format';

type StageResult = keyof typeof stageResultLabels;
type Result = { stage: string; result: StageResult };
type Option = { value: string; label: string; before?: ReactNode };

const resultOptions = (Object.entries(stageResultLabels) as [StageResult, string][]).map(([value, label]) => ({ value, label }));
const OTHER_STAGE = '__other';
const MAX_RESULTS = 20;
/** In the dialog the statuses go in the order the pupil passes them. */
const dialogStatuses: PlanStatus[] = ['planned', 'registered', 'in_progress', 'done'];
const statusOptions: Option[] = dialogStatuses.map(value => ({ value, label: planStatusLabels[value], before: <span className={`plan-status-dot plan-status-dot--${value}`} aria-hidden="true" /> }));
const sameStage = (a: string, b: string) => a.toLocaleLowerCase('ru') === b.toLocaleLowerCase('ru');

/**
 * Figma «План — этап раскрыт» / «План — результат раскрыт»: a field that opens its list right under itself,
 * inside the dialog, and pushes the rest of the form down. The list is a radio group: Tab reaches the chosen option,
 * arrows move between options, Escape closes the list and returns to the field.
 */
function Dropdown({ label, value, options, onChange, className = '' }: { label: string; value: string; options: Option[]; onChange: (value: string) => void; className?: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const selected = options.find(option => option.value === value);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>('[aria-checked="true"], [role="radio"]')?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  function choose(next: string) { onChange(next); setOpen(false); trigger.current?.focus({ preventScroll: true }); }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus({ preventScroll: true }); return; }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')];
    const index = items.indexOf(document.activeElement as HTMLElement);
    items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  }
  return <div ref={root} className={`plan-dropdown ${open ? 'is-open' : ''} ${className}`}>
    <button ref={trigger} type="button" className="plan-dropdown__trigger" aria-label={`${label}: ${selected?.label ?? 'не выбрано'}`} aria-expanded={open} aria-controls={`${id}-list`} onClick={() => setOpen(!open)}>
      {selected?.before}<span>{selected?.label ?? label}</span><Icon name="chevron-down" size={15} className="plan-dropdown__chevron" />
    </button>
    {open && <div id={`${id}-list`} className="plan-dropdown__list" role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {options.map(option => <button key={option.value} type="button" role="radio" aria-checked={option.value === value} tabIndex={option.value === value ? 0 : -1} className="plan-dropdown__option" onClick={() => choose(option.value)}>
        {option.value === value && <Icon name="check" size={14} />}{option.before}<span>{option.label}</span>
      </button>)}
    </div>}
  </div>;
}

/** Figma «План — редактировать (демо: много этапов)»: the dated stages, the nearest one highlighted, the rest of a long schedule collapsed. */
function StageSchedule({ stages, today }: { stages: ScheduleStage[]; today: string }) {
  const [expanded, setExpanded] = useState({ before: false, after: false });
  const shown = scheduleWindow(stages, expanded);
  const numbered = stages.length > 3;
  return <section className="plan-schedule" aria-labelledby="plan-schedule-title">
    <h4 id="plan-schedule-title">Расписание этапов</h4>
    <p className="plan-dialog__hint">Расписание обновляется автоматически по датам.</p>
    {stages.length === 0 ? <p className="plan-schedule__empty">Даты этапов пока не объявлены — они появятся здесь, когда организаторы их опубликуют.</p> : <>
      {shown.before > 0 && <button type="button" className="plan-schedule__more" onClick={() => setExpanded({ ...expanded, before: true })}><span aria-hidden="true">···</span>{hiddenStagesLabel(shown.before, 'before')}</button>}
      <ol className="plan-schedule__list">{shown.items.map(stage => {
        const hint = scheduleStageHint(stage, today);
        const parts = dateParts(hint.day);
        return <li key={stage.key} className={`plan-schedule__stage plan-schedule__stage--${stage.state}`} aria-current={stage.state === 'next' ? 'step' : undefined}>
          <span className="date-tile plan-schedule__date" aria-hidden="true">
            {numbered && <span className="plan-schedule__number">{stage.number}</span>}
            <small>{parts.month}</small><strong>{parts.day}</strong>
          </span>
          <span className="plan-schedule__text"><strong>{stage.name}</strong><small>{hint.text}</small></span>
        </li>;
      })}</ol>
      {shown.after > 0 && <button type="button" className="plan-schedule__more" onClick={() => setExpanded({ ...expanded, after: true })}><span aria-hidden="true">···</span>{hiddenStagesLabel(shown.after, 'after')}</button>}
    </>}
  </section>;
}

const resultLook: Record<StageResult, { tone: string; icon: IconName }> = {
  passed: { tone: 'passed', icon: 'check' }, prize: { tone: 'award', icon: 'award' }, winner: { tone: 'award', icon: 'award' }, failed: { tone: 'failed', icon: 'x' },
};

/** The stage and result pickers: for a new result, or for one being edited (then the stage keeps its own name among the options). */
function ResultForm({ stages, initial, schedule, today, onSubmit, onCancel, onRemove, onDraft, submitLabel }: {
  stages: string[]; initial?: Result; schedule: ScheduleStage[]; today: string; submitLabel: string;
  onSubmit: (result: Result) => void; onCancel?: () => void; onRemove?: () => void; onDraft?: (result: Result | null) => void;
}) {
  const [stage, setStage] = useState(initial?.stage ?? defaultResultStage(stages, schedule, today) ?? OTHER_STAGE);
  const [custom, setCustom] = useState('');
  const [result, setResult] = useState<StageResult>(initial?.result ?? 'passed');
  const [touched, setTouched] = useState(false);
  const name = (stage === OTHER_STAGE ? custom : stage).trim().slice(0, 200);
  useEffect(() => { if (stage !== OTHER_STAGE && !stages.includes(stage)) setStage(stages[0] ?? OTHER_STAGE); }, [stage, stages]);
  // What the pupil picked but has not added yet: «Сохранить» keeps it instead of dropping it silently.
  useEffect(() => { onDraft?.(touched && name ? { stage: name, result } : null); }, [touched, name, result]);
  const edit = <T,>(set: (value: T) => void) => (value: T) => { set(value); setTouched(true); };
  return <div className="plan-result-form">
    <Dropdown label="Этап" value={stage} onChange={edit(setStage)} options={[...stages.map(value => ({ value, label: value })), { value: OTHER_STAGE, label: 'Другой этап…' }]} />
    {stage === OTHER_STAGE && <input className="plan-result-form__input" aria-label="Название этапа" placeholder="Например, отборочный этап" maxLength={200} value={custom} onChange={event => edit(setCustom)(event.target.value)} />}
    <Dropdown label="Результат" value={result} onChange={edit((value: string) => setResult(value as StageResult))} options={resultOptions} />
    <Button size="small" variant="secondary" className="full-width" disabled={!name} onClick={() => onSubmit({ stage: name, result })}>{!initial && <Icon name="plus" size={13} />}{submitLabel}</Button>
    {(onCancel || onRemove) && <div className="plan-result-form__actions">
      {onRemove && <button type="button" className="danger-link" onClick={onRemove}><Icon name="trash" size={13} />Удалить результат</button>}
      {onCancel && <button type="button" className="text-button" onClick={onCancel}>Отмена</button>}
    </div>}
  </div>;
}

/** Figma «План — результат уже добавлен»: saved results as cards, a new one through the form under them. */
function StageResults({ entry, schedule, today, value, onChange, onDraft }: {
  entry: PlanEntry; schedule: ScheduleStage[]; today: string; value: Result[]; onChange: (value: Result[]) => void; onDraft: (result: Result | null) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [formKey, setFormKey] = useState(0);
  const all = resultStageOptions({ ...entry, results: value });
  const free = (except?: string) => all.filter(stage => (except && sameStage(stage, except)) || !value.some(result => sameStage(result.stage, stage)));
  const formOpen = editing === null && (value.length === 0 || adding) && value.length < MAX_RESULTS;
  useEffect(() => { if (!formOpen) onDraft(null); }, [formOpen]);
  function add(result: Result) {
    const rest = value.filter(item => !sameStage(item.stage, result.stage));
    onChange([...rest, result]);
    setAdding(false); onDraft(null); setFormKey(key => key + 1);
  }
  return <section className="plan-results" aria-labelledby="plan-results-title">
    <h4 id="plan-results-title">Результаты этапов</h4>
    {value.length > 0 && <ul className="plan-results__list">{value.map((item, index) => editing === index
      ? <li key={item.stage}><ResultForm stages={free(item.stage)} initial={item} schedule={schedule} today={today} submitLabel="Готово"
        onSubmit={result => { onChange(value.map((row, i) => i === index ? result : row).filter((row, i) => i === index || !sameStage(row.stage, result.stage))); setEditing(null); }}
        onCancel={() => setEditing(null)} onRemove={() => { onChange(value.filter((_, i) => i !== index)); setEditing(null); }} /></li>
      : <li key={item.stage} className={`plan-result plan-result--${resultLook[item.result].tone}`}>
        <span className="plan-result__icon" aria-hidden="true"><Icon name={resultLook[item.result].icon} size={15} /></span>
        <span className="plan-result__text"><strong>{item.stage}</strong><small>{item.result === 'passed' && <Icon name="check" size={11} />}{stageResultLabels[item.result]}</small></span>
        <button type="button" className="plan-result__edit" aria-label={`Изменить результат: ${item.stage}`} onClick={() => { setEditing(index); setAdding(false); }}><Icon name="edit" size={14} /></button>
      </li>)}</ul>}
    {formOpen ? <ResultForm key={formKey} stages={free()} schedule={schedule} today={today} submitLabel="Добавить результат" onSubmit={add} onDraft={onDraft} onCancel={value.length ? () => setAdding(false) : undefined} />
      : editing === null && value.length < MAX_RESULTS && <Button size="small" variant="secondary" className="full-width" onClick={() => setAdding(true)}><Icon name="plus" size={13} />Добавить результат другого этапа</Button>}
  </section>;
}

export function EditPlanItem({ entry, onClose, backTo }: { entry: PlanEntry; onClose: () => void; backTo?: string }) {
  const today = moscowToday();
  const [schedule] = useState(() => planSchedule(entry, today));
  const [note, setNote] = useState(entry.note || '');
  const [tracking, setTracking] = useState(entry.tracking);
  const [status, setStatus] = useState<PlanStatus>(entry.status);
  const [results, setResults] = useState<Result[]>(entry.results);
  const [draft, setDraft] = useState<Result | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const mutation = usePlanActions();
  // A finished olympiad needs no reminders: switch tracking off right away, the user still sees it and can keep it on.
  const chooseStatus = (value: PlanStatus) => { setStatus(value); if (value === 'done' && status !== 'done') setTracking(false); };
  function save() {
    const all = draft && !results.some(result => sameStage(result.stage, draft.stage)) && results.length < MAX_RESULTS ? [...results, draft] : results;
    mutation.mutate({ id: entry.olympiad.id, action: 'patch', patch: { tracking, note: note.trim() || null, status, results: all } }, { onSuccess: onClose });
  }
  return <Dialog title="В моём плане" className="plan-dialog" onClose={onClose}>
    <h3 className="dialog-item-title">{entry.olympiad.title}</h3>
    <Dropdown label="Статус" className="plan-dialog__status" value={status} onChange={value => chooseStatus(value as PlanStatus)} options={statusOptions} />
    <StageSchedule stages={schedule} today={today} />
    <label className="switch-row"><span><strong>Отслеживать этапы</strong><small>Ближайшие события в плане и напоминания от бота</small></span><Switch checked={tracking} onChange={event => setTracking(event.target.checked)} aria-label="Отслеживать этапы" /></label>
    <StageResults entry={entry} schedule={schedule} today={today} value={results} onChange={setResults} onDraft={setDraft} />
    <label className="field"><span>Моя заметка</span><textarea value={note} onChange={event => setNote(event.target.value)} maxLength={2000} rows={3} placeholder="Например, подготовить документы" /><small>{note.length} / 2000</small></label>
    {mutation.isError && <Notice tone="error">{mutation.error.message}</Notice>}
    <Button className="full-width" disabled={mutation.isPending} onClick={save}>{mutation.isPending ? 'Сохраняем…' : 'Сохранить'}</Button>
    <Link className="text-link centered" to={`/olympiads/${entry.olympiad.id}`}>Подробнее об олимпиаде</Link>
    {backTo && <Link className="text-link centered" to={backTo}>Назад в каталог</Link>}
    {removeConfirm ? <div className="remove-confirm"><p>Убрать олимпиаду, её заметку и результаты из плана?</p><div className="button-pair"><Button variant="secondary" onClick={() => setRemoveConfirm(false)}>Оставить</Button><Button variant="danger" disabled={mutation.isPending} onClick={() => mutation.mutate({ id: entry.olympiad.id, action: 'remove' }, { onSuccess: onClose })}>Убрать</Button></div></div> : <button className="danger-link centered" onClick={() => setRemoveConfirm(true)}><Icon name="trash" size={15} />Убрать из плана</button>}
  </Dialog>;
}
