import mascot01 from '../../assets/onboarding/mascot-01.webp';
import mascot02 from '../../assets/onboarding/mascot-02.webp';
import mascot03 from '../../assets/onboarding/mascot-03.webp';
import mascot04 from '../../assets/onboarding/mascot-04.webp';
import mascot05 from '../../assets/onboarding/mascot-05.webp';
import mascot06 from '../../assets/onboarding/mascot-06.webp';
import mascot07 from '../../assets/onboarding/mascot-07.webp';
import mascot08 from '../../assets/onboarding/mascot-08.webp';
import mascot09 from '../../assets/onboarding/mascot-09.webp';
import mascot10 from '../../assets/onboarding/mascot-10.webp';
import mascot11 from '../../assets/onboarding/mascot-11.webp';
import glow01 from '../../assets/onboarding/glow-01.svg';
import glow02 from '../../assets/onboarding/glow-02.svg';
import glow03 from '../../assets/onboarding/glow-03.svg';
import glow04 from '../../assets/onboarding/glow-04.svg';
import glow05 from '../../assets/onboarding/glow-05.svg';
import glow06 from '../../assets/onboarding/glow-06.svg';
import glow07 from '../../assets/onboarding/glow-07.svg';
import glow08 from '../../assets/onboarding/glow-08.svg';
import glow09 from '../../assets/onboarding/glow-09.svg';
import glow10 from '../../assets/onboarding/glow-10.svg';
import glow11 from '../../assets/onboarding/glow-11.svg';

/**
 * Where the mascot sits against the hint card, in the card's coordinates (Figma frames «Старт»…«11», card 343 px wide):
 * `top` is the mascot's top edge relative to the card's top (the card covers its feet); the horizontal position is
 * `left`/`right` from the card's edge or `center` — the offset of its middle from the card's middle.
 * The glow is the white blurred ellipse behind it; its offset is relative to the mascot box.
 */
export type TourMascot = {
  src: string; width: number; height: number; top: number;
  left?: number; right?: number; center?: number;
  glow: { src: string; width: number; height: number; left: number; top: number };
};
export type TourStep = {
  kind: 'intro' | 'hint' | 'finale';
  /** The page of the step; `plan-item` opens the first olympiad of the plan in its dialog, or the plan itself when it is empty. */
  route: string;
  /** Elements to highlight (their union), by `data-tour`; the first matching element of each. */
  anchors?: string[];
  /** Used when none of `anchors` shows up: an empty plan, fewer than two olympiads chosen for comparison. */
  fallback?: string[];
  /** Where the card goes: below or above the highlighted area. */
  placement?: 'below' | 'above';
  title: string; text: string; action: string;
  mascot: TourMascot;
};

export const tourSteps: TourStep[] = [
  { kind: 'intro', route: '/olimp', title: 'Привет! Я Олимп', text: 'Быстро покажу основные возможности приложения и помогу настроить рекомендации под твои цели.', action: 'Начать',
    mascot: { src: mascot01, width: 258, height: 249, top: -214, center: 40, glow: { src: glow01, width: 382, height: 371, left: -62, top: -73 } } },
  { kind: 'hint', route: '/olimp', anchors: ['olimp-due', 'olimp-picks'], placement: 'below', title: 'Главная уже знает твои цели', text: 'Здесь Олимп собирает ближайшие дедлайны и персональные рекомендации — всё важное видно сразу.', action: 'Дальше',
    mascot: { src: mascot02, width: 173, height: 162, top: -141, right: -12, glow: { src: glow02, width: 326, height: 319, left: -83, top: -72 } } },
  { kind: 'hint', route: '/catalog', anchors: ['catalog-controls'], placement: 'below', title: 'Подборка строится из профиля', text: 'Переключайте разделы, применяйте персональную подборку и уточняйте предмет, класс и формат компактными фильтрами.', action: 'Дальше',
    mascot: { src: mascot03, width: 140, height: 133, top: -113, right: 17, glow: { src: glow03, width: 326, height: 319, left: -97, top: -77 } } },
  { kind: 'hint', route: '/catalog?mode=universities', anchors: ['catalog-controls', 'university-card'], placement: 'below', title: 'Найдите подходящий вуз', text: 'В компактной области доступны поиск, фильтры и целевые вузы. В карточке откройте программы и олимпиады с льготами.', action: 'Дальше',
    mascot: { src: mascot04, width: 175, height: 234, top: -178, right: 0, glow: { src: glow04, width: 326, height: 319, left: -79, top: -32 } } },
  { kind: 'hint', route: '/catalog', anchors: ['olympiad-card'], placement: 'below', title: 'Откройте подробности олимпиады', text: 'Нажмите на любую область карточки, чтобы увидеть этапы, правила, льготы, сроки и контакты организатора.', action: 'Дальше',
    mascot: { src: mascot05, width: 160, height: 114, top: -100, right: 15, glow: { src: glow05, width: 316, height: 316, left: -79, top: -97 } } },
  { kind: 'hint', route: '/catalog', anchors: ['track'], placement: 'above', title: 'Отслеживайте без лишних шагов', text: 'Нажмите «Отслеживать»: олимпиада появится в «Моём плане», а Олимп напомнит о дедлайне и следующем действии.', action: 'Дальше',
    mascot: { src: mascot06, width: 150, height: 161, top: -137, right: -8, glow: { src: glow06, width: 316, height: 316, left: -78, top: -58 } } },
  { kind: 'hint', route: '/catalog', anchors: ['compare'], fallback: ['compare-check'], placement: 'above', title: 'Сравните несколько вариантов', text: 'Выберите две или больше олимпиад флажком. В сравнении будут рядом уровень, формат, льготы и дедлайны.', action: 'Дальше',
    mascot: { src: mascot07, width: 169, height: 176, top: -157, left: 51, glow: { src: glow07, width: 361, height: 361, left: -106, top: -77 } } },
  { kind: 'hint', route: '/plan', anchors: ['plan-card'], fallback: ['plan-stats'], placement: 'above', title: 'Двигайтесь к следующему событию', text: 'Статус, дедлайн и конкретный следующий шаг собраны в одной карточке — нажмите её, чтобы продолжить.', action: 'Дальше',
    mascot: { src: mascot08, width: 106, height: 117, top: -89, right: 27, glow: { src: glow08, width: 342, height: 334, left: -127, top: -114 } } },
  { kind: 'hint', route: 'plan-item', anchors: ['plan-schedule'], placement: 'below', title: 'Этапы всегда под рукой', text: 'Расписание обновляется автоматически. Отслеживание включает напоминания, а результат каждого этапа вы добавляете отдельно.', action: 'Дальше',
    mascot: { src: mascot09, width: 171, height: 224, top: -182, left: 21, glow: { src: glow09, width: 368, height: 358, left: -96, top: -60 } } },
  { kind: 'hint', route: '/profile', anchors: ['profile-prefs'], placement: 'below', title: 'Сделайте рекомендации точнее', text: 'Укажите класс, предметы, целевые вузы и направления. Олимп будет учитывать их в каталоге и подсказках.', action: 'Готово',
    mascot: { src: mascot10, width: 152, height: 160, top: -137, right: 5, glow: { src: glow10, width: 341, height: 332, left: -80, top: -82 } } },
  { kind: 'finale', route: '/olimp', title: 'Всё готово!', text: 'Удачи на олимпиадах! Я помогу не пропустить дедлайны и держать план под рукой.', action: 'Перейти в Олимп',
    mascot: { src: mascot11, width: 246, height: 312, top: -237, center: 8, glow: { src: glow11, width: 402, height: 390, left: -82, top: -39 } } },
];
