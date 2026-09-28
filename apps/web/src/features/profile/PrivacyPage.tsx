import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Dialog, Header, Notice, SettingsRow, Icon } from '@olimp/ui';
import { useProfile } from '../../lib/profile';
import { useSession } from '../../lib/session';
import { NotificationsDialog } from './NotificationsDialog';

export function PrivacyPage() {
  const { clear, storageError, saving } = useProfile();
  const { deleteAccount } = useSession();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [panel, setPanel] = useState<'permissions' | 'notifications' | 'delete' | null>(null);
  const [message, setMessage] = useState('');
  async function confirmDelete() {
    setDeleting(true); setDeleteError('');
    try { await deleteAccount(); navigate('/welcome', { replace: true }); }
    catch (cause) { setDeleteError(cause instanceof Error ? cause.message : 'Не удалось удалить аккаунт. Попробуйте ещё раз.'); setDeleting(false); }
  }
  const closeDelete = () => { if (!deleting) { setPanel(null); setDeleteError(''); } };
  return <><Header title="Данные и конфиденциальность" back="/profile" /><p className="page-intro">Здесь можно узнать, какие данные хранит Olimp, и удалить аккаунт.</p>
    <section className="prose"><h2>Чат с Олимпом</h2><p>Сообщение и последние реплики разговора передаются DeepSeek для подготовки ответа. При вопросах о вашем плане передаются сведения о сохранённых олимпиадах, без имени, идентификатора MAX и личных заметок. Не отправляйте в чат пароли и личные документы.</p><p>Переписка хранится в памяти открытого приложения: она остаётся при переходе между разделами и очищается при перезагрузке или нажатии «Новый диалог». Olimp не сохраняет её в своей базе. Это не определяет сроки хранения у DeepSeek.</p><p>Если в базе нет ответа, Олимп сам открывает сайты из заранее заданного списка: страницу олимпиады и сайт организатора из каталога, официальные сайты и правила приёма вузов, РСОШ и каталоги олимпиад. Сторонние поисковые сервисы не используются. Вопрос и тексты открытых страниц обрабатывает DeepSeek; самим сайтам отправляются обычные запросы страниц — без переписки, личных данных и данных входа. Найденные сведения нужно самостоятельно проверить по показанным ссылкам.</p></section>
    <div className="settings-list"><SettingsRow icon="shield" tone="green" title="Согласия и разрешения" subtitle="Управление обработкой данных" onClick={() => setPanel('permissions')} /><SettingsRow icon="bell" title="Уведомления" subtitle="Настройки напоминаний о дедлайнах" onClick={() => setPanel('notifications')} /></div>
    <button className="delete-account" onClick={() => setPanel('delete')}><Icon name="trash" size={18} />Удалить аккаунт</button>
    {message && <div role="status"><Notice tone="info">{message}</Notice></div>}
    {panel === 'permissions' && <Dialog title="Согласия и разрешения" onClose={() => setPanel(null)}><div className="prose"><h3>На этом устройстве</h3><p>История поиска сохраняется в хранилище браузера. В деморежиме профиль, фото и план тоже хранятся только на устройстве. Поисковые запросы передаются API для получения результатов.</p><h3>На сервере Olimp</h3><p>При входе через MAX сервер проверяет стартовые данные. В базе хранятся идентификатор MAX, имя и фото профиля, класс, город, предметы, форматы участия, сохранённые олимпиады, заметки и состояние отслеживания, а также настройка напоминаний и журнал отправленных ботом напоминаний (какая олимпиада, какой срок, когда отправлено). Профиль и план доступны после входа через тот же аккаунт MAX на другом устройстве.</p><h3>Разрешения устройства</h3><p>Приложение не запрашивает доступ к камере, микрофону, контактам или геопозиции. Отдельная аналитика не подключена.</p><p className="hint">Это описание текущей реализации. Отдельная политика обработки персональных данных ещё не опубликована.</p></div><Button className="full-width" onClick={() => setPanel(null)}>Понятно</Button></Dialog>}
    {panel === 'notifications' && <NotificationsDialog onClose={() => setPanel(null)} />}
    {panel === 'delete' && <Dialog title="Удалить аккаунт?" onClose={closeDelete}><Notice tone="warning">Это действие нельзя отменить.</Notice><div className="prose"><p>Будут удалены:</p><ul><li>профиль: имя, фото, класс, город, предметы и форматы участия;</li><li>все сохранённые олимпиады с заметками и отслеживанием;</li><li>на этом устройстве — история поиска и старые локальные данные профиля.</li></ul><p>Если снова откроете Olimp в MAX, начнёте с регистрации.</p></div>{deleteError && <Notice tone="error">{deleteError}</Notice>}<Button className="full-width" variant="danger" disabled={deleting || saving} onClick={confirmDelete}>{deleting ? 'Удаляем…' : 'Удалить навсегда'}</Button><Button className="full-width dialog-cancel" variant="secondary" disabled={deleting} onClick={closeDelete}>Отмена</Button><p className="hint centered-text">Хотите сохранить аккаунт и план? <button className="text-button" disabled={deleting || saving} onClick={async () => { if (await clear()) { setPanel(null); setMessage('Учебные предпочтения сброшены. Аккаунт и план сохранены.'); } }}>Сбросить только предпочтения</button></p>{storageError && <Notice tone="error">{storageError}</Notice>}</Dialog>}
  </>;
}
