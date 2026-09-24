import type { AssistantRequest, AssistantResponse } from '@olimp/contracts';

export type ChatMessage = {
  id: string; role: 'user' | 'assistant'; content: string; at: string;
  olympiads: AssistantResponse['olympiads']; failed?: boolean;
  revealStartedAt?: number;
  webSearchOffer?: AssistantResponse['webSearchOffer'];
  webSources?: AssistantResponse['webSources'];
  webDisclaimer?: string;
  webSearchState?: 'accepted' | 'declined';
  webSearchToken?: string;
  offerOnly?: boolean;
  contextOlympiadIds?: number[];
};

export function isSearchConsent(text: string) {
  return /^(?:да|давай|поищи|ищи|да,? (?:поищи|давай|ищи)|давай (?:поищем|поищи)|поискать)(?: в интернете)?[.!\s]*$/iu.test(text.trim());
}
export function isSearchDecline(text: string) {
  return /^(?:нет(?:,? спасибо)?|не сейчас|не надо|не ищи(?: в интернете)?)[.!\s]*$/iu.test(text.trim());
}
export function conversationHistory(messages: ChatMessage[]): AssistantRequest['history'] {
  const history: AssistantRequest['history'] = [];
  let length = 0;
  // Reserve 2,000 characters for the next question and stay within the API limit.
  for (const message of [...messages].reverse()) {
    if (message.failed || message.id.startsWith('welcome')) continue;
    const content = message.webSearchOffer ? `${message.content}\nВопрос для поиска: ${message.webSearchOffer.question}`.slice(0, 4000) : message.content;
    if (history.length === 10 || length + content.length > 10000) break;
    length += content.length;
    history.unshift({ role: message.role, content, olympiadIds: [...new Set([
      ...message.olympiads.map(item => item.id), ...message.webSearchOffer?.olympiads.map(item => item.id) ?? [],
      ...message.contextOlympiadIds ?? [],
    ])].slice(0, 5) });
  }
  return history;
}
export function welcomeMessages(): ChatMessage[] {
  const at = new Date().toISOString();
  return [
    { id: 'welcome-1', role: 'assistant', content: 'Привет! Я Олимп 👋 Помогу найти олимпиады и разобраться с дедлайнами.', at, olympiads: [] },
    { id: 'welcome-2', role: 'assistant', content: 'Какой предмет тебя интересует?', at, olympiads: [] },
  ];
}
