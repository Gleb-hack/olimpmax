import { useState } from 'react';
import { Header, Icon } from '@olimp/ui';
import { parseFaq, type FaqEntry } from '@olimp/contracts';
import { max } from '../../lib/max';
import { formatDay } from '../../lib/format';
// Single source of truth: the same CSV feeds Olimp's answers on the server.
import faqCsv from '../../../../../data/faq/olympiad_faq_2026-27.csv?raw';

const entries = parseFaq(faqCsv);
const categories = [...new Set(entries.map(entry => entry.category))].map(name => ({
  name, items: entries.map((entry, index) => ({ entry, index })).filter(({ entry }) => entry.category === name),
}));

function Sources({ entry }: { entry: FaqEntry }) {
  if (!entry.sources.length && !entry.checkedAt) return null;
  return <div className="faq-sources">
    {entry.sources.length > 0 && <><span className="faq-sources__caption">{entry.sources.length > 1 ? 'Источники' : 'Источник'}</span>
      <ul>{entry.sources.map(source => <li key={source.url}><a className="text-link" href={source.url} onClick={event => { event.preventDefault(); max.openExternal(source.url); }}>
        <Icon name="external-link" size={13} /><span>{source.name}</span></a></li>)}</ul></>}
    {entry.checkedAt && <small>Проверено {formatDay(entry.checkedAt)}</small>}
  </div>;
}

export function OlympiadFaqPage() {
  const [open, setOpen] = useState<number | null>(null);
  return <><Header title="Вопросы по олимпиадам" back="/profile" />
    <p className="page-intro faq-intro">Ответы собраны по официальным документам и сайтам организаторов. Правила приёма меняются каждый год — перед подачей документов сверяйтесь с источником.</p>
    {categories.map(category => <section key={category.name} aria-label={category.name}>
      <h2 className="section-caption faq-caption">{category.name}</h2>
      <div className="faq-list">{category.items.map(({ entry, index }) => <section className={`faq-item ${open === index ? 'is-open' : ''}`} key={entry.question}>
        <h3><button id={`olympiad-faq-title-${index}`} aria-expanded={open === index} aria-controls={`olympiad-faq-answer-${index}`} onClick={() => setOpen(open === index ? null : index)}>{entry.question}<Icon name="chevron-right" size={18} /></button></h3>
        <div id={`olympiad-faq-answer-${index}`} role="region" aria-labelledby={`olympiad-faq-title-${index}`} hidden={open !== index}><p>{entry.answer}</p><Sources entry={entry} /></div>
      </section>)}</div>
    </section>)}
  </>;
}
