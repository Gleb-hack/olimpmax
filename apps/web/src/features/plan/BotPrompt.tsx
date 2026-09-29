import { useState } from 'react';
import { Button, Icon, Notice } from '@olimp/ui';
import { useNotifications } from '../../lib/queries';
import { localKeys } from '../../lib/local-data';
import { max } from '../../lib/max';
import { botStartUrl } from '../../lib/bot-link';

function readDismissed() {
  try { return localStorage.getItem(localKeys.botPromptDismissed()) === '1'; } catch { return false; }
}

/**
 * The offer to turn on reminders, where it makes sense: in the plan, once something is tracked and the bot cannot
 * write yet. Hidden when the pupil turned reminders off on purpose, after «Не сейчас», and in the demo (no bot).
 */
export function BotPrompt({ tracked }: { tracked: number }) {
  const settings = useNotifications();
  const [dismissed, setDismissed] = useState(readDismissed);
  const data = settings.data;
  if (!tracked || dismissed || !data?.botUrl || data.botConnected || !data.enabled) return null;
  const dismiss = () => {
    try { localStorage.setItem(localKeys.botPromptDismissed(), '1'); } catch { /* The offer comes back next launch; nothing breaks. */ }
    setDismissed(true);
  };
  return <section className="bot-prompt" aria-labelledby="bot-prompt-title">
    <Notice tone="info">
      <strong id="bot-prompt-title" className="bot-prompt__title"><Icon name="bell" size={14} />Напоминать о сроках в MAX?</strong>
      Бот Olimp напишет за неделю до конца регистрации, накануне этапа и если даты перенесут. Нужно один раз нажать «Начать» в чате с ботом.
      <div className="button-pair">
        <Button variant="secondary" onClick={dismiss}>Не сейчас</Button>
        <Button onClick={() => max.openExternal(botStartUrl(data.botUrl!))}>Подключить</Button>
      </div>
    </Notice>
  </section>;
}
