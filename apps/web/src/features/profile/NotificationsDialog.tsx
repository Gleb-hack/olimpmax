import { Switch } from '@maxhub/max-ui';
import { Button, Dialog, Loading, Notice } from '@olimp/ui';
import { useNotificationActions, useNotifications } from '../../lib/queries';
import { max } from '../../lib/max';
import { botStartUrl } from '../../lib/bot-link';

/** «Уведомления» in «Данные и конфиденциальность»: reminders from the MAX bot. */
export function NotificationsDialog({ onClose }: { onClose: () => void }) {
  const settings = useNotifications();
  const { toggle } = useNotificationActions();
  const data = settings.data;
  const error = toggle.error as Error | null;
  return <Dialog title="Уведомления" onClose={onClose}>
    {settings.isPending ? <Loading /> : settings.isError || !data ? <Notice tone="error">{settings.error instanceof Error ? settings.error.message : 'Не удалось загрузить настройки.'}</Notice> : <>
      {data.botConnected ? <Notice tone="info">Бот Olimp подключён и может писать вам в MAX.</Notice>
        : <Notice tone="warning">Чтобы бот мог писать вам, откройте чат с ботом Olimp в MAX и нажмите «Начать».</Notice>}
      <label className="switch-row"><span><strong>Напоминания о сроках</strong><small>Сообщения от бота Olimp в MAX</small></span>
        <Switch aria-label="Напоминания о сроках" checked={data.enabled} disabled={toggle.isPending} onChange={event => toggle.mutate(event.target.checked)} /></label>
      <div className="prose"><p>Бот пишет только когда подходит срок — после уроков по времени региона из профиля (если регион не указан — по Москве): за неделю, за 3 дня, накануне и в последний день регистрации, об этапе — накануне и в день. Если организатор переносит эти даты, бот сообщает об этом. Всё, что пришлось на один день, приходит одним сообщением.</p>
        <p>Напоминания приходят только по олимпиадам из «Плана» с включённым отслеживанием. Если у даты в источнике нет года, он подставляется по учебному сезону — такие даты сверяйте на сайте олимпиады.</p></div>
      {error && <Notice tone="error">{error.message}</Notice>}
      {data.botUrl && !data.botConnected && <Button className="full-width" onClick={() => max.openExternal(botStartUrl(data.botUrl!))}>Открыть чат с ботом</Button>}
    </>}
    <Button className="full-width dialog-cancel" variant="secondary" onClick={onClose}>Готово</Button>
  </Dialog>;
}
