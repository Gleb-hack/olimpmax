import { Switch } from '@maxhub/max-ui';
import { Button, Dialog, Loading, Notice } from '@olimp/ui';
import { useNotificationActions, useNotifications } from '../../lib/queries';
import { max } from '../../lib/max';

/** «Уведомления» in «Данные и конфиденциальность»: reminders from the MAX bot. */
export function NotificationsDialog({ onClose }: { onClose: () => void }) {
  const settings = useNotifications();
  const { toggle, test } = useNotificationActions();
  const data = settings.data;
  const error = (toggle.error ?? test.error) as Error | null;
  return <Dialog title="Уведомления" onClose={onClose}>
    {settings.isPending ? <Loading /> : settings.isError || !data ? <Notice tone="error">{settings.error instanceof Error ? settings.error.message : 'Не удалось загрузить настройки.'}</Notice> : <>
      {!data.botConnected && <Notice tone="warning">Чтобы бот мог писать вам, откройте чат с ботом Olimp в MAX и нажмите «Начать».</Notice>}
      <label className="switch-row"><span><strong>Напоминания о сроках</strong><small>Сообщения от бота Olimp в MAX</small></span>
        <Switch aria-label="Напоминания о сроках" checked={data.enabled} disabled={toggle.isPending} onChange={event => { test.reset(); toggle.mutate(event.target.checked); }} /></label>
      <div className="prose"><p>Бот пишет раз в день, утром по московскому времени: за 7, 3 и 1 день до конца регистрации и в сам день, о начале этапа — за 3 дня, накануне и в день. Все сроки дня приходят одним сообщением.</p>
        <p>Напоминания приходят только по олимпиадам из «Плана» с включённым отслеживанием. Если у даты в источнике нет года, он подставляется по учебному сезону — такие даты сверяйте на сайте олимпиады.</p></div>
      {test.data && <div role="status"><Notice tone="info">{test.data.message}</Notice></div>}
      {error && <Notice tone="error">{error.message}</Notice>}
      {data.botUrl && !data.botConnected && <Button className="full-width" onClick={() => max.openExternal(data.botUrl!)}>Открыть чат с ботом</Button>}
      <Button className="full-width" variant={data.botUrl && !data.botConnected ? 'secondary' : 'primary'} disabled={test.isPending} onClick={() => { toggle.reset(); test.mutate(); }}>
        {test.isPending ? 'Отправляем…' : 'Прислать тестовое напоминание'}</Button>
    </>}
    <Button className="full-width dialog-cancel" variant="secondary" onClick={onClose}>Готово</Button>
  </Dialog>;
}
