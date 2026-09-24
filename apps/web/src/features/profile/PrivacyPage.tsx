import { useState } from 'react';
import { Bell, Download, Shield, Trash2 } from 'lucide-react';
import { Button, Dialog, Header, Notice, SettingsRow } from '@olimp/ui';
import { api, isMock } from '../../lib/api';
import { useProfile } from '../../lib/profile';

export function PrivacyPage() {
  const { profile, clear, storageError, saving } = useProfile();
  const [panel, setPanel] = useState<'permissions' | 'notifications' | 'delete' | null>(null);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function exportData() {
    setExporting(true); setMessage(''); setError('');
    try {
      const plan = await api.plan();
      const data = { exportedAt: new Date().toISOString(), mode: isMock ? 'demo' : 'api', profile, plan: plan.items };
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'olimp-my-data.json'; document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Файл с вашим планом и учебными предпочтениями подготовлен для скачивания.');
    } catch (error) { setError(error instanceof Error ? error.message : 'Не удалось подготовить экспорт. Попробуйте ещё раз.'); }
    finally { setExporting(false); }
  }
  return <><Header title="Данные и конфиденциальность" back="/profile" /><p className="page-intro">Здесь можно узнать, какие данные хранит Olimp, и скачать копию вашего плана и настроек.</p>
    <section className="prose"><h2>Чат с Олимпом</h2><p>Сообщение и последние реплики разговора передаются DeepSeek для подготовки ответа. При вопросах о вашем плане передаются сведения о сохранённых олимпиадах, без имени, идентификатора MAX и личных заметок. Не отправляйте в чат пароли и личные документы.</p><p>Переписка хранится в памяти открытого приложения: она остаётся при переходе между разделами и очищается при перезагрузке или нажатии «Новый диалог». Olimp не сохраняет её в своей базе. Это не определяет сроки хранения у DeepSeek.</p><p>Если в базе нет ответа, Олимп может предложить поиск в интернете. Только после вашего согласия название олимпиады, организатор и вопрос передаются поисковому сервису Serper. История переписки и данные аккаунта в поиск не передаются. Вопрос, результаты поиска и тексты найденных страниц обрабатывает DeepSeek; самим найденным сайтам переписка, личные данные и данные входа не отправляются. Найденные сведения нужно самостоятельно проверить по показанным ссылкам.</p></section>
    <div className="settings-list"><SettingsRow icon={Download} title={exporting ? 'Готовим файл…' : 'Экспорт данных'} subtitle="Скачать копию ваших данных" onClick={exportData} disabled={exporting} /><SettingsRow icon={Shield} tone="green" title="Согласия и разрешения" subtitle="Управление обработкой данных" onClick={() => setPanel('permissions')} /><SettingsRow icon={Bell} title="Уведомления" subtitle="Настройки напоминаний о дедлайнах" onClick={() => setPanel('notifications')} /></div>
    <button className="delete-account" onClick={() => setPanel('delete')}><Trash2 size={17} />Удалить аккаунт</button>
    {message && <div role="status"><Notice tone="info">{message}</Notice></div>}{error && <Notice tone="error">{error}</Notice>}
    {panel === 'permissions' && <Dialog title="Согласия и разрешения" onClose={() => setPanel(null)}><div className="prose"><h3>На этом устройстве</h3><p>Фото профиля и история поиска сохраняются в хранилище браузера. В деморежиме профиль и план тоже хранятся только на устройстве. Поисковые запросы передаются API для получения результатов.</p><h3>На сервере Olimp</h3><p>При входе через MAX сервер проверяет стартовые данные. В базе хранятся идентификатор MAX, имя профиля, класс, город, предметы, форматы участия, сохранённые олимпиады, заметки и состояние отслеживания. Профиль и план доступны после входа через тот же аккаунт MAX на другом устройстве.</p><h3>Разрешения устройства</h3><p>Приложение не запрашивает доступ к камере, микрофону, контактам или геопозиции. Отдельная аналитика не подключена.</p><p className="hint">Это описание текущей реализации. Отдельная политика обработки персональных данных ещё не опубликована.</p></div><Button className="full-width" onClick={() => setPanel(null)}>Понятно</Button></Dialog>}
    {panel === 'notifications' && <Dialog title="Уведомления" onClose={() => setPanel(null)}><Notice tone="info">Напоминания от бота пока не подключены.</Notice><div className="prose"><p>Сейчас можно включить отслеживание у каждой олимпиады в разделе «План». Тогда её подтверждённые даты появятся среди ближайших событий.</p><p>Это ещё не включает сообщения в MAX. Возможность настроить время напоминаний появится после подключения бота.</p></div><Button className="full-width" onClick={() => setPanel(null)}>Понятно</Button></Dialog>}
    {panel === 'delete' && <Dialog title="Удаление данных" onClose={() => setPanel(null)}><Notice tone="warning">Удаление аккаунта на сервере пока недоступно.</Notice><div className="prose"><p>Вы можете сбросить учебные предпочтения в аккаунте и фото на этом устройстве. Имя останется прежним. Сохранённые олимпиады и аккаунт на сервере останутся.</p><p>Олимпиады можно по отдельности убрать из раздела «План».</p></div>{storageError && <Notice tone="error">{storageError}</Notice>}<Button className="full-width" variant="danger" disabled={saving} onClick={async () => { if (await clear()) { setPanel(null); setMessage('Учебные предпочтения сброшены. Аккаунт и план сохранены.'); } }}>Сбросить только предпочтения</Button><Button className="full-width dialog-cancel" variant="secondary" onClick={() => setPanel(null)}>Отмена</Button></Dialog>}
  </>;
}
