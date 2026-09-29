import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { buildIcs } from '@olimp/contracts';
import { Button, Dialog, Icon, Loading, Notice } from '@olimp/ui';
import { api, apiUrl, isMock, type PlanEntry } from '../../lib/api';
import { copyText } from '../../lib/clipboard';
import { max } from '../../lib/max';

const fileName = 'olimp-plan.ics';

/** The demo has no server feed: the same calendar is built in the browser and saved as a file. */
function downloadLocally(entries: PlanEntry[]) {
  const ics = buildIcs(entries.filter(entry => entry.tracking).map(entry => ({
    olympiadId: entry.olympiad.id, title: entry.olympiad.title, url: entry.olympiad.sourceUrl, events: entry.calendarEvents ?? [],
  })));
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: fileName });
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * «Экспорт в календарь»: a file with the current stages (added once, does not change) and a subscription link
 * the phone calendar re-reads by itself. Both carry the stages of the olympiads the user tracks.
 */
export function CalendarExportDialog({ entries, onClose }: { entries: PlanEntry[]; onClose: () => void }) {
  const feed = useMutation({ mutationFn: (reset: boolean) => api.calendarFeed(reset) });
  const [copied, setCopied] = useState<boolean | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const tracked = entries.filter(entry => entry.tracking && entry.calendarEvents?.length).length;
  // Creating the link is the user's own action: they opened the export. An existing link is returned as it is.
  useEffect(() => { if (!isMock) feed.mutate(false); }, []);
  const url = feed.data ? apiUrl(feed.data.path) : null;
  function download() {
    if (isMock || !url) { downloadLocally(entries); setDownloaded(true); return; }
    if (!max.downloadFile(url, fileName)) max.openExternal(url);
    setDownloaded(true);
  }
  async function copy() { if (url) setCopied(await copyText(url)); }
  return <Dialog title="Экспорт в календарь" className="calendar-export" onClose={onClose}>
    <p className="calendar-export__lead">В календарь попадут этапы олимпиад, которые ты отслеживаешь{tracked ? ` (с датами — ${tracked})` : ''}. Даты без года рассчитаны по учебному сезону — сверяй их на сайте организатора.</p>
    {!tracked && <Notice tone="warning">Пока нет отслеживаемых олимпиад с датами этапов — календарь будет пустым.</Notice>}
    {!isMock && feed.isPending && !feed.data ? <Loading label="Готовим ссылку…" /> : !isMock && feed.isError && !feed.data
      ? <Notice tone="error">{feed.error.message} <button type="button" className="text-button" onClick={() => feed.mutate(false)}>Повторить</button></Notice>
      : <>
        <section className="calendar-export__option">
          <h3>Подписка — обновляется сама</h3>
          <p>Скопируй ссылку и добавь её в календарь. Новые олимпиады и изменения дат появятся без повторного экспорта.</p>
          {isMock ? <Notice tone="neutral">Подписка работает при подключении к серверу. В деморежиме можно скачать файл.</Notice> : <>
            <Button className="full-width" onClick={copy}><Icon name="copy" size={15} />{copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}</Button>
            {copied === false && url && <p className="calendar-export__url">Не удалось скопировать. Ссылка: <span>{url}</span></p>}
            <details className="calendar-export__help">
              <summary>Как добавить подписку</summary>
              <p><strong>iPhone:</strong> Настройки → Календарь → Учётные записи → Новая учётная запись → Другое → Подписной календарь, вставь ссылку.</p>
              <p><strong>Android (Google Календарь):</strong> открой calendar.google.com в браузере → «Другие календари» → «+» → «Добавить по URL», вставь ссылку. Календарь появится в телефоне после синхронизации.</p>
            </details>
          </>}
        </section>
        <section className="calendar-export__option">
          <h3>Файл .ics — разовый экспорт</h3>
          <p>Открой файл на телефоне, чтобы добавить этапы в календарь. Изменения дат в него не попадут.</p>
          <Button className="full-width" variant="secondary" onClick={download}><Icon name="download" size={15} />Скачать файл</Button>
          {downloaded && !isMock && url && <p className="calendar-export__hint">Файл не скачался? <button type="button" className="text-button" onClick={() => max.openExternal(url)}>Открыть в браузере</button></p>}
        </section>
        {!isMock && feed.data && (resetConfirm
          ? <div className="remove-confirm"><p>Старая ссылка перестанет работать, подписки на неё больше не обновятся. Создать новую?</p><div className="button-pair">
            <Button variant="secondary" onClick={() => setResetConfirm(false)}>Отмена</Button>
            <Button variant="danger" disabled={feed.isPending} onClick={() => feed.mutate(true, { onSuccess: () => { setResetConfirm(false); setCopied(null); } })}>Сбросить</Button></div></div>
          : <button type="button" className="danger-link centered" onClick={() => setResetConfirm(true)}><Icon name="rotate-ccw" size={15} />Сбросить ссылку</button>)}
      </>}
  </Dialog>;
}
