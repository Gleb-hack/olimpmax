import { Icon, type IconName } from '@olimp/ui';
import type { GoalMatch } from '@olimp/contracts';
import type { z } from 'zod';

type Match = z.infer<typeof GoalMatch>;
type Kind = Match['reasons'][number]['kind'];
/** How sure the reason is: a benefit is a fact of the university, the RSOSH list almost a fact, subjects only a recommendation. */
export const goalReasonMeta: Record<Kind, { icon: IconName; tone: string; label: string }> = {
  benefit: { icon: 'graduation-cap', tone: 'fact', label: 'Льгота вуза' },
  rsosh: { icon: 'check', tone: 'rsosh', label: 'Перечень РСОШ' },
  core_subject: { icon: 'book', tone: 'hint', label: 'Рекомендация' },
  related_subject: { icon: 'book', tone: 'weak', label: 'Слабее' },
};

/** «Подходит под цель» on a card: the strongest reasons first, the rest counted. */
export function GoalReasons({ match, limit = 2 }: { match: Match | null | undefined; limit?: number }) {
  if (!match?.reasons.length) return null;
  const shown = match.reasons.slice(0, limit);
  const rest = match.reasons.length - shown.length;
  return <div className="goal-reasons">
    <span className="goal-reasons__title"><Icon name="target" size={13} />Подходит под твою цель</span>
    <ul>{shown.map(reason => <li key={reason.kind + reason.text} className={`goal-reason goal-reason--${goalReasonMeta[reason.kind].tone}`}>
      <Icon name={goalReasonMeta[reason.kind].icon} size={13} /><span>{reason.text}</span></li>)}</ul>
    {rest > 0 && <small className="goal-reasons__more">и ещё {rest} {rest === 1 ? 'причина' : rest < 5 ? 'причины' : 'причин'}</small>}
  </div>;
}

/** The olympiad page: every reason with how certain it is. */
export function GoalReasonsSection({ match }: { match: Match | null | undefined }) {
  if (match === undefined) return null;
  return <section className="olympiad-detail__about goal-reasons-section" aria-labelledby="goal-reasons-title">
    <h2 id="goal-reasons-title">Почему подходит тебе</h2>
    {!match?.reasons.length ? <p className="goal-reasons-section__empty">С твоими целевыми вузами и направлениями эта олимпиада не связана.</p>
      : <ul>{match.reasons.map(reason => <li key={reason.kind + reason.text} className={`goal-reason goal-reason--${goalReasonMeta[reason.kind].tone}`}>
        <span className="goal-reason__icon"><Icon name={goalReasonMeta[reason.kind].icon} size={15} /></span>
        <span className="goal-reason__copy"><span>{reason.text}</span><small>{goalReasonMeta[reason.kind].label}</small></span></li>)}</ul>}
    <p className="olympiad-schedule__hint">Льгота вуза — из справочника льгот. Перечень РСОШ связывает профиль олимпиады с направлениями. Совпадение предметов — только рекомендация: условия приёма сверяйте с правилами вуза.</p>
  </section>;
}
