import type { ReactNode } from 'react';
import { Icon, type IconName } from '@olimp/ui';

/** A row of the «Детали» card (Figma «Олимпиада — Физтех», «Вуз — МФТИ»): icon, label, value and an optional hint. */
export function DetailRow({ icon, label, value, hint }: { icon: IconName; label: string; value: ReactNode; hint?: string }) {
  return <div className="olympiad-detail-row"><span className="olympiad-detail-row__icon"><Icon name={icon} size={17} /></span><div><dt>{label}</dt><dd>{value}</dd>{hint && <p>{hint}</p>}</div></div>;
}
