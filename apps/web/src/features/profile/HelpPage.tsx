import { useState } from 'react';
import { ChevronRight, Mail } from 'lucide-react';
import { Button, Header, Notice } from '@olimp/ui';
import { max } from '../../lib/max';

const questions = [
  { title: 'Как зарегистрироваться на олимпиаду?', answer: 'Найдите олимпиаду в каталоге, откройте её карточку и перейдите по ссылке «Открыть источник». Инструкции и ссылку на регистрацию нужно уточнить у организатора. Добавление в план само по себе не регистрирует вас на олимпиаду.' },
  { title: 'Что делать, если я пропустил дедлайн?', answer: 'Проверьте актуальное расписание на сайте организатора: иногда срок регистрации продлевают. Если регистрация закрыта, уточните возможность участия у организатора или сохраните олимпиаду, чтобы вернуться к ней в следующем сезоне.' },
  { title: 'Как изменить класс обучения?', answer: 'Откройте «Профиль» и выберите свой класс. Для классов с 1-го по 8-й нажмите «Другой класс» или «Редактировать профиль». Настройка сохраняется в вашем аккаунте и доступна после повторного входа через MAX.' },
  { title: 'Как отследить прогресс по олимпиадам?', answer: 'В разделе «План» собраны сохранённые олимпиады и ближайшие подтверждённые даты. Нажмите на олимпиаду, чтобы добавить заметку или включить отслеживание. Результаты участия и автоматический прогресс пока не поддерживаются.' },
  { title: 'Как добавить олимпиаду в план?', answer: 'В каталоге нажмите «Отслеживать» на карточке олимпиады. Кнопка изменится на «В плане». В MAX план привязан к вашему аккаунту; при локальной разработке используется общий демонстрационный аккаунт.' },
  { title: 'Почему у некоторых олимпиад нет дат?', answer: 'Исходный каталог содержит расписания без подтверждённого года. Такие даты мы не превращаем в дедлайны автоматически. В ближайшие события попадают только отдельно проверенные даты. Актуальное расписание всегда уточняйте у организатора.' },
];
export function HelpPage() {
  const [open, setOpen] = useState<number | null>(null);
  const [supportNotice, setSupportNotice] = useState(false);
  const supportUrl = import.meta.env.VITE_SUPPORT_URL;
  return <><Header title="Помощь и FAQ" back="/profile" /><p className="section-caption faq-caption">Часто задаваемые вопросы</p><div className="faq-list">{questions.map((question, index) => <section className={`faq-item ${open === index ? 'is-open' : ''}`} key={question.title}><h2><button id={`faq-title-${index}`} aria-expanded={open === index} aria-controls={`faq-answer-${index}`} onClick={() => setOpen(open === index ? null : index)}>{question.title}<ChevronRight size={18} /></button></h2><div id={`faq-answer-${index}`} role="region" aria-labelledby={`faq-title-${index}`} hidden={open !== index}><p>{question.answer}</p></div></section>)}</div><Button className="full-width support-button" onClick={() => supportUrl ? max.openLink(supportUrl) : setSupportNotice(true)}><Mail size={16} />Написать в поддержку</Button>{supportNotice && <Notice tone="info">Контакт поддержки пока не добавлен. Ответы по работе приложения доступны выше.</Notice>}<p className="version-label">Olimp · версия 0.1</p></>;
}
