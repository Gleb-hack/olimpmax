import book from '../../assets/olimp/tour/book.webp';
import flag from '../../assets/olimp/tour/flag.webp';
import checklist from '../../assets/olimp/tour/checklist.webp';
import bulb from '../../assets/olimp/tour/bulb.webp';
import reading from '../../assets/olimp/tour/reading.webp';
import laptop from '../../assets/olimp/tour/laptop.webp';
import think from '../../assets/olimp/tour/think.webp';
import wave from '../../assets/olimp/tour/wave.webp';
import magnifier from '../../assets/olimp/tour/magnifier.webp';
import jump from '../../assets/olimp/tour/jump.webp';

export type TourStep = {
  /** Where the step is shown; null keeps the current screen. */
  route: string | null;
  /** Elements to highlight together (the first match of each selector). None: the whole screen is dimmed. */
  targets?: string[];
  /** Used when none of `targets` is on the screen, for example an empty plan. */
  fallback?: { targets: string[]; text: string };
  chip?: string; title: string; text: string; mascot: string;
  primary: string;
};

/** Figma «Старт», «2» … «11»: the steps go over the real screens, so the highlight always matches what the pupil sees. */
export const tourSteps: TourStep[] = [
  { route: '/olimp', chip: 'Знакомство', title: 'Привет! Я Олимп', mascot: book, primary: 'Начать',
    text: 'Быстро покажу основные возможности приложения и помогу настроить рекомендации под твои цели.' },
  { route: '/olimp', targets: ['[data-tour="olimp-due"]', '[data-tour="olimp-picks"]'], title: 'Главная уже знает твои цели', mascot: flag, primary: 'Дальше',
    text: 'Здесь Олимп собирает ближайшие дедлайны и персональные рекомендации — всё важное видно сразу.' },
  { route: '/catalog', targets: ['#main .catalog-controls'], title: 'Подборка строится из профиля', mascot: checklist, primary: 'Дальше',
    text: 'Переключайте разделы, включайте персональную подборку и уточняйте предмет, класс, формат и уровень фильтрами. «Сначала актуальные» учитывает твой профиль.' },
  { route: '/catalog?mode=universities', targets: ['[data-tour="catalog-mode"]', '#main .university-search', '#main .catalog-controls--universities', '#main .university-card'], title: 'Найдите подходящий вуз', mascot: bulb, primary: 'Дальше',
    text: 'Ищите по названию или городу, фильтруйте и смотрите «Целевые вузы». В карточке вуза — программы и олимпиады с льготами.' },
  { route: '/catalog', targets: ['#main .catalog-list > .olympiad-card'], title: 'Откройте подробности олимпиады', mascot: reading, primary: 'Дальше',
    text: 'Нажмите на карточку, чтобы увидеть этапы, правила, льготы, сроки и контакты организатора.' },
  { route: '/catalog', targets: ['#main .catalog-list > .olympiad-card .card-actions > .button'], title: 'Отслеживайте без лишних шагов', mascot: laptop, primary: 'Дальше',
    text: 'Нажмите «Отслеживать»: олимпиада появится в «Моём плане», а Олимп напомнит о дедлайне и следующем действии.' },
  { route: '/catalog', targets: ['#main .catalog-list > .olympiad-card .compare-check'], title: 'Сравните несколько вариантов', mascot: think, primary: 'Дальше',
    text: 'Отметьте флажком «Сравнить» две олимпиады или больше. В сравнении будут рядом уровень, формат, льготы и дедлайны.' },
  { route: '/plan', targets: ['#main .plan-card'], title: 'Двигайтесь к следующему событию', mascot: wave, primary: 'Дальше',
    text: 'Статус, дедлайн и следующий шаг собраны в одной карточке — нажмите её, чтобы отметить регистрацию, результаты и заметку.',
    fallback: { targets: ['#main .empty-state'], text: 'Здесь появятся олимпиады, которые вы отслеживаете: статус, дедлайн и следующий шаг — в одной карточке.' } },
  { route: '/plan', targets: ['#main .plan-view-switch'], title: 'Этапы всегда под рукой', mascot: magnifier, primary: 'Дальше',
    text: 'В «Календаре» — все этапы по датам. Расписание обновляется автоматически, отслеживание включает напоминания, а результат каждого этапа вы добавляете в карточке.' },
  { route: '/profile', targets: ['#main .profile-details'], title: 'Сделайте рекомендации точнее', mascot: book, primary: 'Готово',
    text: 'Укажите класс, предметы, целевые вузы и направления. Олимп будет учитывать их в каталоге и подсказках.' },
  { route: null, chip: 'Всё готово', title: 'Всё готово!', mascot: jump, primary: 'Перейти в Олимп',
    text: 'Удачи на олимпиадах! Я помогу не пропустить дедлайны и держать план под рукой.' },
];
