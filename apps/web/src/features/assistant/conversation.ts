import type { AssistantRequest, AssistantResponse } from '@olimp/contracts';

export type ChatMessage = {
  id: string; role: 'user' | 'assistant'; content: string; at: string;
  olympiads: AssistantResponse['olympiads']; failed?: boolean;
  revealStartedAt?: number;
  /** «Не нашёл в базе — сейчас поищу»: the app runs the web search for this ticket right away, without asking. */
  webSearch?: AssistantResponse['webSearch'];
  webSearchState?: 'running' | 'done' | 'failed';
  webSources?: AssistantResponse['webSources'];
  webDisclaimer?: string;
  /** Olympiads the web answer was about: keeps the topic for follow-up questions. */
  contextOlympiadIds?: number[];
};

export function conversationHistory(messages: ChatMessage[]): AssistantRequest['history'] {
  const history: AssistantRequest['history'] = [];
  let length = 0;
  // Reserve 2,000 characters for the next question and stay within the API limit.
  for (const message of [...messages].reverse()) {
    if (message.failed || message.id.startsWith('welcome')) continue;
    // The normalized search question keeps the topic; the signed ticket never leaves the app again.
    const content = message.webSearch ? `${message.content}\nВопрос для поиска: ${message.webSearch.question}`.slice(0, 4000) : message.content;
    if (history.length === 10 || length + content.length > 10000) break;
    length += content.length;
    history.unshift({ role: message.role, content, olympiadIds: [...new Set([
      ...message.olympiads.map(item => item.id), ...message.webSearch?.olympiadIds ?? [],
      ...message.contextOlympiadIds ?? [],
    ])].slice(0, 5) });
  }
  return history;
}
export function welcomeMessages(): ChatMessage[] {
  const at = new Date().toISOString();
  return [
    { id: 'welcome-1', role: 'assistant', content: 'Привет! Я Олимп 👋 Помогу найти олимпиады, разобраться с дедлайнами и льготами при поступлении.', at, olympiads: [] },
    { id: 'welcome-2', role: 'assistant', content: 'Какой предмет тебя интересует?', at, olympiads: [] },
  ];
}
