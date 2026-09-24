import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Download, Shield, Trash2 } from 'lucide-react';
import { Button, Dialog, Header, Notice, SettingsRow } from '@olimp/ui';
import { api, apiUrl, isMock } from '../../lib/api';
import { max } from '../../lib/max';
import { readSearchHistory } from '../../lib/local-data';
import { useProfile } from '../../lib/profile';
import { useSession } from '../../lib/session';

function saveFile(text: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = fileName; document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function PrivacyPage() {
  const { profile, clear, storageError, saving } = useProfile();
  const { deleteAccount } = useSession();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [panel, setPanel] = useState<'permissions' | 'notifications' | 'delete' | 'export' | null>(null);
  const [exporting, setExporting] = useState(false);
  const [ticket, setTicket] = useState<{ path: string; fileName: string } | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  // Step 1: the server assembles the file. Step 2 is a separate tap, because MAX downloads only right after a click.
  async function prepareExport() {
    setExporting(true); setMessage(''); setError('');
    try { setTicket(await api.prepareExport({ avatar: profile.avatar, searchHistory: readSearchHistory() })); setPanel('export'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось подготовить экспорт. Попробуйте ещё раз.'); }
    finally { setExporting(false); }
  }
  async function downloadExport() {
    if (!ticket) return;
    setExporting(true); setError('');
    try {
      // Inside MAX a blob link does not download, so only the platform method is used there.
      if (max.canDownloadFile && !isMock) {
        try { await max.downloadFile(apiUrl(ticket.path), ticket.fileName); }
        catch { throw new Error('MAX не смог скачать файл. Проверьте подключение и подготовьте экспорт заново.'); }
        finish('Файл отправлен на скачивание. Найдите его в загрузках телефона.'); return;
      }
      saveFile(JSON.stringify(await api.exportFile(ticket.path), null, 2), ticket.fileName);
      finish('Файл с вашими данными скачан.');
    } catch (cause) {
      setPanel(null); setTicket(null);
      setError(cause instanceof Error ? cause.message : 'Не удалось скачать файл. Подготовьте экспорт заново.');
    } finally { setExporting(false); }
  }
  function finish(text: string) { setPanel(null); setTicket(null); setMessage(text); }
  async function confirmDelete() {
    setDeleting(true); setDeleteError('');
    try { await deleteAccount(); navigate('/welcome', { replace: true }); }
    catch (cause) { setDeleteError(cause instanceof Error ? cause.message : 'Не удалось удалить аккаунт. Попробуйте ещё раз.'); setDeleting(false); }
  }
  const closeDelete = () => { if (!deleting) { setPanel(null); setDeleteError(''); } };
  return <><Header title="Данные и конфиденциальность" back="/profile" /><p className="page-intro">Здесь можно узнать, какие данные хранит Olimp, и скачать копию всех своих данных или удалить аккаунт.</p>
    <section className="prose"><h2>Чат с Олимпом</h2><p>Сообщение и последние реплики разговора передаются DeepSeek для подготовки ответа. При вопросах о вашем плане передаются сведения о сохранённых олимпиадах, без имени, идентификатора MAX и личных заметок. Не отправляйте в чат пароли и личные документы.</p><p>Переписка хранится в памяти открытого приложения: она остаётся при переходе между разделами и очищается при перезагрузке или нажатии «Новый диалог». Olimp не сохраняет её в своей базе. Это не определяет сроки хранения у DeepSeek.</p><p>Если в базе нет ответа, Олимп может предложить поиск в интернете. Только после вашего согласия название олимпиады, организатор и вопрос передаются поисковому сервису Serper. История переписки и данные аккаунта в поиск не передаются. Вопрос, результаты поиска и тексты найденных страниц обрабатывает DeepSeek; самим найденным сайтам переписка, личные данные и данные входа не отправляются. Найденные сведения нужно самостоятельно проверить по показанным ссылкам.</p></section>
    <div className="settings-list"><SettingsRow icon={Download} title={exporting && !ticket ? 'Готовим файл…' : 'Экспорт данных'} subtitle="Профиль, план и настройки в файле JSON" onClick={prepareExport} disabled={exporting} /><SettingsRow icon={Shield} tone="green" title="Согласия и разрешения" subtitle="Управление обработкой данных" onClick={() => setPanel('permissions')} /><SettingsRow icon={Bell} title="Уведомления" subtitle="Настройки напоминаний о дедлайнах" onClick={() => setPanel('notifications')} /></div>
    <button className="delete-account" onClick={() => setPanel('delete')}><Trash2 size={17} />Удалить аккаунт</button>
    {message && <div role="status"><Notice tone="info">{message}</Notice></div>}{error && <Notice tone="error">{error}</Notice>}
    {panel === 'permissions' && <Dialog title="Согласия и разрешения" onClose={() => setPanel(null)}><div className="prose"><h3>На этом устройстве</h3><p>Фото профиля и история поиска сохраняются в хранилище браузера. В деморежиме профиль и план тоже хранятся только на устройстве. Поисковые запросы передаются API для получения результатов.</p><h3>На сервере Olimp</h3><p>При входе через MAX сервер проверяет стартовые данные. В базе хранятся идентификатор MAX, имя профиля, класс, город, предметы, форматы участия, сохранённые олимпиады, заметки и состояние отслеживания. Профиль и план доступны после входа через тот же аккаунт MAX на другом устройстве.</p><h3>Разрешения устройства</h3><p>Приложение не запрашивает доступ к камере, микрофону, контактам или геопозиции. Отдельная аналитика не подключена.</p><p className="hint">Это описание текущей реализации. Отдельная политика обработки персональных данных ещё не опубликована.</p></div><Button className="full-width" onClick={() => setPanel(null)}>Понятно</Button></Dialog>}
    {panel === 'notifications' && <Dialog title="Уведомления" onClose={() => setPanel(null)}><Notice tone="info">Напоминания от бота пока не подключены.</Notice><div className="prose"><p>Сейчас можно включить отслеживание у каждой олимпиады в разделе «План». Тогда её подтверждённые даты появятся среди ближайших событий.</p><p>Это ещё не включает сообщения в MAX. Возможность настроить время напоминаний появится после подключения бота.</p></div><Button className="full-width" onClick={() => setPanel(null)}>Понятно</Button></Dialog>}
    {panel === 'export' && ticket && <Dialog title="Файл готов" onClose={() => { if (!exporting) { setPanel(null); setTicket(null); } }}><div className="prose"><p>В файле {ticket.fileName} — аккаунт, профиль, сохранённые олимпиады с заметками, а также фото и история поиска с этого устройства. Формат JSON открывается любым текстовым редактором.</p><p>Ссылка на файл действует 5 минут.</p></div><Button className="full-width" disabled={exporting} onClick={downloadExport}><Download size={16} />{exporting ? 'Скачиваем…' : 'Скачать файл'}</Button><Button className="full-width dialog-cancel" variant="secondary" disabled={exporting} onClick={() => { setPanel(null); setTicket(null); }}>Отмена</Button></Dialog>}
    {panel === 'delete' && <Dialog title="Удалить аккаунт?" onClose={closeDelete}><Notice tone="warning">Это действие нельзя отменить.</Notice><div className="prose"><p>Будут удалены:</p><ul><li>профиль: имя, класс, город, предметы и форматы участия;</li><li>все сохранённые олимпиады с заметками и отслеживанием;</li><li>на этом устройстве — фото профиля и история поиска.</li></ul><p>Если нужна копия, сначала скачайте её через «Экспорт данных». Если снова откроете Olimp в MAX, начнёте с регистрации.</p></div>{deleteError && <Notice tone="error">{deleteError}</Notice>}<Button className="full-width" variant="danger" disabled={deleting || saving} onClick={confirmDelete}>{deleting ? 'Удаляем…' : 'Удалить навсегда'}</Button><Button className="full-width dialog-cancel" variant="secondary" disabled={deleting} onClick={closeDelete}>Отмена</Button><p className="hint centered-text">Хотите сохранить аккаунт и план? <button className="text-button" disabled={deleting || saving} onClick={async () => { if (await clear()) { setPanel(null); setMessage('Учебные предпочтения сброшены. Аккаунт и план сохранены.'); } }}>Сбросить только предпочтения</button></p>{storageError && <Notice tone="error">{storageError}</Notice>}</Dialog>}
  </>;
}
