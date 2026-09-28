import { Bot, MaxError, type Api } from '@maxhub/max-bot-api';
import type { InlineKeyboardAttachmentRequest } from '@maxhub/max-bot-api/types';
import type { BotIdentity } from './format.js';
export { MaxError };

/** Everything the reminder code needs from MAX; tests pass a fake. */
export interface Messenger {
  identity(): Promise<BotIdentity | null>;
  /** Sends an HTML message to a user's dialog with the bot. Throws DeliveryError. */
  sendToUser(maxUserId: number, html: string, keyboard?: InlineKeyboardAttachmentRequest): Promise<void>;
}
export class DeliveryError extends Error {
  /** true — MAX will not deliver to this user (bot stopped, dialog never started): do not retry. */
  constructor(message: string, public readonly unreachable: boolean) { super(message); }
}
/** 403/404 mean «this user cannot get messages from the bot»; anything else may pass on a retry. */
export function toDeliveryError(error: unknown) {
  if (error instanceof DeliveryError) return error;
  if (error instanceof MaxError) return new DeliveryError(`MAX ${error.status} ${error.code}: ${error.description}`.slice(0, 500), error.status === 403 || error.status === 404);
  return new DeliveryError(error instanceof Error ? error.message.slice(0, 500) : 'Неизвестная ошибка отправки', false);
}

/** A Messenger over the official client. Pass the bot's own `api` in the bot process; the API builds a client from the token. */
export function maxMessenger(source: Api | string): Messenger {
  const api = typeof source === 'string' ? new Bot(source).api : source;
  let identity: Promise<BotIdentity | null> | null = null;
  return {
    identity() {
      identity ??= api.getMyInfo().then(info => info.username ? { username: info.username, userId: info.user_id } : null)
        .catch(() => { identity = null; return null; });
      return identity;
    },
    async sendToUser(maxUserId, html, keyboard) {
      try {
        await api.sendMessageToUser(maxUserId, html, { format: 'html', disable_link_preview: true, ...(keyboard ? { attachments: [keyboard] } : {}) });
      } catch (error) { throw toDeliveryError(error); }
    },
  };
}
