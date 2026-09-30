import { z } from 'zod';

export { buildIcs, foldLine, icsText, type IcsEvent, type IcsItem, type IcsOptions } from './ics.js';

export const Format = z.enum(['onsite', 'online', 'hybrid', 'unknown']);
export const OlympiadLevel = z.enum(['I', 'II', 'III', 'I–II', 'II–III', 'I–III', 'ВсОШ', 'unknown']);
export const olympiadLevelOptions = [
  { value: 'I', label: 'I уровень' }, { value: 'II', label: 'II уровень' },
  { value: 'III', label: 'III уровень' }, { value: 'ВсОШ', label: 'ВсОШ' },
  { value: 'I–II', label: 'I–II уровни' }, { value: 'II–III', label: 'II–III уровни' },
  { value: 'I–III', label: 'I–III уровни' },
  { value: 'unknown', label: 'Не указан' },
] as const;
export const Slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80);
/** Code of a direction of study: XX.03.XX — bachelor, XX.05.XX — specialist («09.03.04»). */
export const DirectionCode = z.string().regex(/^\d{2}\.0[35]\.\d{2}$/);
export const EducationLevel = z.enum(['bachelor', 'specialist']);
export const SubjectRelevance = z.enum(['core', 'related']);
export const ProgramFunding = z.enum(['budget', 'paid_only', 'quota_only']);
export const StageMode = z.enum(['online', 'onsite', 'mixed']);
export const ScheduleSource = z.enum(['catalog', 'reference']);
export const ScheduleQuality = z.enum(['ok', 'placeholder', 'outdated', 'hidden']);
export const LevelSource = z.enum(['rsosh_list', 'catalog', 'series']);
export const BenefitKind = z.enum(['bvi', 'score_100']);
export const BenefitDiploma = z.enum(['any', 'winner']);
/** «БВИ», «100 баллов ЕГЭ», with «только победителям» when prize-winners are excluded. */
export function benefitLabel(b: { kind: z.infer<typeof BenefitKind>; diploma: z.infer<typeof BenefitDiploma> }) {
  const base = b.kind === 'bvi' ? 'БВИ — без вступительных испытаний' : '100 баллов ЕГЭ по профильному предмету';
  return b.diploma === 'winner' ? `${base}, только победителям` : base;
}
export const stageModeLabels = { online: 'онлайн', onsite: 'очно', mixed: 'очно или дистанционно' } as const;
export const Participation = z.enum(['individual', 'team', 'mixed', 'unknown']);
export const ScheduleStatus = z.enum(['published', 'unknown', 'not_held']);
export const DateVerification = z.enum(['unverified', 'verified', 'needs_review']);
export const IsoDay = z.iso.date();
const list = <T extends z.ZodType>(item: T) => z.preprocess(
  v => typeof v === 'string' ? v.split(',') : v, z.array(item).min(1).max(50).optional(),
);
export const CatalogQuery = z.object({
  q: z.string().trim().max(200).optional(),
  subjectIds: list(z.coerce.number().int().positive()),
  grades: list(z.coerce.number().int().min(1).max(11)),
  formats: list(Format), participation: list(Participation),
  levels: list(OlympiadLevel),
  /** Only olympiads whose diploma gives a benefit at one of these universities (slugs from /universities). */
  universities: list(Slug),
  /** Only olympiads of these series (slugs from /series/:slug). */
  series: list(Slug),
  /** Only olympiads that suit one of these directions: by the RSOSH list or by a core subject of the direction. */
  directions: list(DirectionCode),
  scheduleStatus: ScheduleStatus.optional(),
  /**
   * The pupil's goal (target universities and directions). Not a filter: every card gets `goalMatch` — why it suits the goal;
   * with sort=goal the best matches go first.
   */
  goalUniversities: list(Slug), goalDirections: list(DirectionCode),
  /**
   * complete — cards with the most data first (dated stages, days to the next stage, university benefits); then by rating.
   * goal — the strongest match with goalUniversities/goalDirections first, then as complete.
   * deadline — the nearest registration deadline first (cards without one go last), then as complete.
   * level — level I first (ВсОШ with it), then II and III; cards without a level go last; then as complete.
   */
  sort: z.enum(['complete', 'rating', 'name', 'goal', 'deadline', 'level']).default('complete'),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).strict();
export type CatalogQuery = z.infer<typeof CatalogQuery>;
export const OlympiadParams = z.object({ id: z.coerce.number().int().positive().max(2147483647) });
export const Subject = z.object({ id: z.number().int(), name: z.string() });
export const Stage = z.object({
  id: z.string().uuid(), name: z.string().nullable(), kind: z.enum(['registration', 'competition', 'other']),
  rawDates: z.string().nullable(), beginsOn: IsoDay.nullable(), endsOn: IsoDay.nullable(),
  timezone: z.literal('Europe/Moscow'), verification: DateVerification,
  sourceUrl: z.string().url().nullable(), verifiedAt: z.string().nullable(),
  // csv — olimpiada.ru calendar text; reference — olympiads_clean via the series; verified_import — checked dates.
  origin: z.enum(['csv', 'verified_import', 'reference']),
  mode: StageMode.nullable().optional(),
});
export const NextEvent = z.object({
  stageId: z.string().uuid(), name: z.string().nullable(), date: IsoDay,
  kind: z.enum(['starts', 'ends']), timezone: z.literal('Europe/Moscow'),
  sourceUrl: z.string().url(),
});
export const CalendarState = z.enum(['unknown', 'unverified', 'verified', 'needs_review', 'no_upcoming', 'not_held']);
/**
 * A dated moment of a plan olympiad for the calendar: `starts`/`ends` of a stage or a one-day stage (`day`).
 * `estimated` — the source gave no year, it comes from the season of the schedule.
 */
export const CalendarEvent = z.object({
  stageId: z.string().uuid(), name: z.string().nullable(), stageKind: z.enum(['registration', 'competition', 'other']),
  kind: z.enum(['starts', 'ends', 'day']), date: IsoDay, estimated: z.boolean(),
});
/**
 * The nearest stage for the «N дней» counter. `event: starts` — the stage has not begun, `date` is its start;
 * `event: ends` — the stage is running or only its deadline is known («до 11 октября»), `date` is its end.
 */
export const UpcomingStage = z.object({
  name: z.string().nullable(), kind: z.enum(['registration', 'competition', 'other']),
  event: z.enum(['starts', 'ends']), date: IsoDay, estimated: z.boolean(),
});
export const SeriesRef = z.object({ slug: Slug, name: z.string() });
export const UniversityRef = z.object({ slug: Slug, name: z.string(), city: z.string() });
export const DirectionRef = z.object({ code: DirectionCode, name: z.string(), educationLevel: EducationLevel });
/** Why an olympiad suits a direction: the RSOSH list names it (viaRsosh) and/or by subjects (a recommendation). */
export const DirectionMatchReason = z.object({ viaRsosh: z.boolean(), subjectRelevance: SubjectRelevance.nullable() });
export const OlympiadDirection = DirectionRef.extend(DirectionMatchReason.shape);
/**
 * Why an olympiad suits the pupil's goal, strongest first:
 * - benefit — a target university gives БВИ or 100 points for the olympiad (series_benefits; a fact, only for cards in the RSOSH list)
 *   and has a program in a direction the olympiad suits (a target one when the goal names directions);
 * - rsosh — the RSOSH list names a target direction or its group for the olympiad's profile (almost a fact);
 * - core_subject — a profile subject of the olympiad is a core subject of a target direction (a recommendation);
 * - related_subject — a close subject (a weaker recommendation).
 * A direction appears only in its strongest reason.
 */
export const GoalReasonKind = z.enum(['benefit', 'rsosh', 'core_subject', 'related_subject']);
export const GoalReason = z.object({
  kind: GoalReasonKind,
  /** Ready to show: «БВИ в КФУ и ВШЭ», «Информатика — профильный предмет для направления «Программная инженерия»». */
  text: z.string(),
  /** benefit: the universities of this benefit (same kind and diploma). */
  universities: z.array(UniversityRef).optional(),
  benefit: z.object({ kind: BenefitKind, diploma: BenefitDiploma }).optional(),
  /** rsosh, core_subject, related_subject: the target directions of this reason. */
  directions: z.array(DirectionRef).optional(),
  /** core_subject, related_subject: the olympiad subject that links it to the directions. */
  subject: z.string().optional(),
});
export const GoalMatch = z.object({
  /**
   * For ordering only: 6 per university with a benefit (up to 3), 4 per RSOSH or core subject direction, 1 per related one,
   * plus the level once (ВсОШ 4, I 3, II 2, III 1; outside the RSOSH list 0).
   */
  score: z.number().int(),
  reasons: z.array(GoalReason),
});
export const OlympiadGoalQuery = z.object({ goalUniversities: list(Slug), goalDirections: list(DirectionCode) }).strict();
/**
 * «На N из M направлений» of a university: rules — from its admission rules (a fact), exams — estimated by the exams of its programs.
 */
export const DirectionCoverage = z.object({ matched: z.number().int(), total: z.number().int(), source: z.enum(['rules', 'exams']) });
export const Benefit = z.object({
  university: UniversityRef.extend({ fullName: z.string().nullable().optional() }), kind: BenefitKind, diploma: BenefitDiploma,
  minScore: z.number().int().nullable(), maxScore: z.number().int().nullable(), requirement: z.string().nullable(),
  /** Olympiad card only: on how many of the university's directions the diploma helps; null — unknown. */
  coverage: DirectionCoverage.nullable().optional(),
});
export const OlympiadBenefits = z.object({
  /** false: the series has benefits, but this card's profile is outside the RSOSH list, so they do not apply to it. */
  applicable: z.boolean(), note: z.string().nullable(), items: z.array(Benefit),
});
export const SeriesProfile = z.object({ profile: z.string(), level: z.number().int().min(1).max(3), fieldsOfStudy: z.string().nullable() });
export const SeriesInfo = SeriesRef.extend({
  generalLevel: z.string().nullable(), formatRaw: z.string().nullable(), scheduleQuality: ScheduleQuality,
  rsoshTitle: z.string().nullable(), note: z.string().nullable(), profiles: z.array(SeriesProfile),
});
export const OlympiadCard = z.object({
  id: z.number().int(), title: z.string(), description: z.string().nullable(),
  organizers: z.array(z.string()).optional(),
  calendarRaw: z.string().nullable().optional(),
  level: z.string().nullable().optional(), levelProfile: z.string().nullable().optional(),
  levelStatus: z.string().nullable().optional(), levelSourceUrl: z.string().url().nullable().optional(),
  levelSource: LevelSource.nullable().optional(),
  series: SeriesRef.nullable().optional(),
  /** Which schedule the card shows: olympiads_clean (reference) or the olimpiada.ru calendar (catalog). */
  scheduleSource: ScheduleSource.optional(),
  subjects: z.array(Subject), gradeFrom: z.number().int().nullable(), gradeTo: z.number().int().nullable(),
  classesRaw: z.string().nullable(), format: Format, participation: Participation,
  rating: z.number().nullable(), scheduleStatus: ScheduleStatus,
  statusRaw: z.string(), sourceUrl: z.string().url(), sourceGroup: z.string().nullable(),
  nextEvent: NextEvent.nullable(), calendarState: CalendarState,
  upcomingStage: UpcomingStage.nullable().optional(),
  /** Only when the request carries a goal (goalUniversities/goalDirections): null — nothing in common with the goal. */
  goalMatch: GoalMatch.nullable().optional(),
});
export const OlympiadDetail = OlympiadCard.extend({
  organizers: z.array(z.string()), contacts: z.array(z.string()), documents: z.array(z.string()),
  featuresRaw: z.string().nullable(), calendarRaw: z.string().nullable(), scheduleUpdatedRaw: z.string().nullable(),
  stages: z.array(Stage), rawSource: z.record(z.string(), z.string()), importedAt: z.string(),
  /** Original olimpiada.ru calendar when calendarRaw shows the reference schedule. */
  catalogCalendarRaw: z.string().nullable().optional(),
  seriesInfo: SeriesInfo.nullable().optional(),
  benefits: OlympiadBenefits.optional(),
  /** Directions of study the olympiad suits, strongest reasons first. */
  directions: z.array(OlympiadDirection).optional(),
});
export const CatalogResponse = z.object({
  items: z.array(OlympiadCard), total: z.number().int(), page: z.number().int(), pageSize: z.number().int(),
});
export const FiltersResponse = z.object({
  subjects: z.array(Subject.extend({ count: z.number().int() })),
  grades: z.array(z.object({ value: z.number().int(), count: z.number().int() })),
  formats: z.array(z.object({ value: Format, label: z.string(), count: z.number().int() })),
  participation: z.array(z.object({ value: Participation, label: z.string(), count: z.number().int() })),
  scheduleStatuses: z.array(z.object({ value: ScheduleStatus, label: z.string(), count: z.number().int() })),
  levels: z.array(z.object({ value: OlympiadLevel, label: z.string(), count: z.number().int() })).optional(),
  universities: z.array(UniversityRef.extend({ count: z.number().int() })).optional(),
});
export const SlugParams = z.object({ slug: Slug });
/** The university list of the catalog: only universities with programs in one of these directions. */
export const UniversityListQuery = z.object({ directions: list(DirectionCode) }).strict();
export const UniversityListResponse = z.object({
  items: z.array(UniversityRef.extend({ fullName: z.string().nullable(), seriesCount: z.number().int(), olympiadCount: z.number().int(),
    programCount: z.number().int().optional() })),
});
/** A university program: exams of the Unified State Exam and the budget passing score of the last campaign. */
export const ProgramInfo = z.object({
  id: z.number().int(), name: z.string(), faculty: z.string().nullable(),
  examsRequired: z.array(z.string()), examsChoice: z.array(z.array(z.string())), internalExam: z.boolean(),
  passingScore: z.number().int().nullable(), passingScoreForm: z.string().nullable(), passingYear: z.number().int().nullable(),
  funding: ProgramFunding, sourceUrl: z.string().url(),
});
export const UniversityProgram = ProgramInfo.extend({ direction: DirectionRef });
export const SeriesBenefit = Benefit.omit({ university: true }).extend({
  series: SeriesRef, olympiadIds: z.array(z.number().int()),
  /** Catalog cards of the series the benefit applies to (they have a level). */
  olympiads: z.array(z.object({ id: z.number().int(), title: z.string() })).optional(),
  /** Organizers of those cards: tells the university's own olympiads apart. */
  organizers: z.array(z.string()).optional(),
});
export const UniversityType = z.enum(['state', 'private']);
export const UniversityResponse = UniversityRef.extend({
  fullName: z.string().nullable(),
  /** «О вузе» from data/reference/university-profiles.csv. */
  type: UniversityType.nullable().optional(), description: z.string().nullable().optional(), site: z.string().url().nullable().optional(),
  /** Admission rules (a page or a PDF) of the university. */
  rules: z.string().url().nullable().optional(),
  benefits: z.array(SeriesBenefit),
  /** Bachelor and specialist programs, by direction code. */
  programs: z.array(UniversityProgram).optional(),
});
export const SeriesStage = z.object({
  id: z.string().uuid(), position: z.number().int(), name: z.string(), kind: z.enum(['registration', 'competition', 'other']),
  rawDates: z.string(), mode: StageMode.nullable(), beginsOn: IsoDay.nullable(), endsOn: IsoDay.nullable(),
});
export const SeriesResponse = SeriesInfo.extend({
  aliases: z.array(z.string()), stages: z.array(SeriesStage), benefits: z.array(Benefit),
  olympiads: z.array(z.object({ id: z.number().int(), title: z.string(), inCatalog: z.boolean(),
    profiles: z.array(z.string()), level: z.string().nullable() })),
});
export const DirectionSummary = DirectionRef.extend({
  ugsnCode: z.string(), ugsnName: z.string(), popular: z.boolean(), aliases: z.array(z.string()), note: z.string().nullable(),
  /** Typical profile exams; the exact set of a university is in its programs. */
  egeSubjects: z.array(z.string()),
  /** Olympiad subjects: core — the olympiad leads to the direction directly, related — a close profile. */
  subjectsCore: z.array(z.string()), subjectsRelated: z.array(z.string()),
  universityCount: z.number().int(), programCount: z.number().int(),
});
export const DirectionListQuery = z.object({
  /** Search by name, code or a colloquial alias («прога», «врач»). */
  q: z.string().trim().max(100).optional(),
  popular: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  /** Only directions with programs at these universities. */
  universities: list(Slug),
}).strict();
export const DirectionListResponse = z.object({ items: z.array(DirectionSummary) });
export const DirectionParams = z.object({ code: DirectionCode });
export const DirectionResponse = DirectionSummary.extend({
  universities: z.array(UniversityRef.extend({ programs: z.array(ProgramInfo) })),
  /** Catalog olympiads suiting the direction (RSOSH or a core subject), those with a level first. */
  olympiads: z.object({ total: z.number().int(), items: z.array(z.object({ id: z.number().int(), title: z.string(), level: z.string().nullable(),
    subjects: z.array(z.string()) }).extend(DirectionMatchReason.shape)) }),
});
export const OlympiadProgramsQuery = z.object({ universities: list(Slug), directions: list(DirectionCode) }).strict();
/**
 * Programs an olympiad helps to enter: the university gives a benefit for its series, the program's direction suits the olympiad,
 * examMatch — the program has the exam the diploma counts for.
 */
export const OlympiadProgramsResponse = z.object({
  applicable: z.boolean(), note: z.string().nullable(),
  items: z.array(z.object({
    university: UniversityRef, benefits: z.array(Benefit.omit({ university: true, coverage: true })), coverage: DirectionCoverage.nullable(),
    programs: z.array(UniversityProgram.extend(DirectionMatchReason.shape).extend({ examMatch: z.boolean() })),
  })),
});
/** Where the pupil is with a plan olympiad; set by the user («Зарегистрировался» on the card, the status in the plan dialog). */
export const PlanStatus = z.enum(['planned', 'registered', 'in_progress', 'done']);
export const planStatusLabels = { planned: 'Планирую', registered: 'Зарегистрирован', in_progress: 'Участвую', done: 'Завершено' } as const;
/** The result of one stage: passed to the next one, did not pass, prize-winner or winner. */
export const StageResult = z.enum(['passed', 'failed', 'prize', 'winner']);
export const stageResultLabels = { passed: 'Прошёл дальше', failed: 'Не прошёл', prize: 'Призёр', winner: 'Победитель' } as const;
/** The stage is named, not referenced by id: stage ids of the reference layer change with every import. */
export const PlanStageResult = z.object({ stage: z.string().trim().min(1).max(200), result: StageResult });
export const PlanPatch = z.object({
  tracking: z.boolean().optional(), note: z.string().trim().max(2000).nullable().optional(), status: PlanStatus.optional(),
  /** Replaces all stage results of the olympiad; [] removes them. */
  results: z.array(PlanStageResult).max(20).refine(v => new Set(v.map(r => r.stage.toLocaleLowerCase('ru'))).size === v.length, 'Этапы не должны повторяться').optional(),
}).strict().refine(v => Object.keys(v).length > 0, 'Укажите изменения');
export const PlanItem = z.object({
  olympiad: OlympiadCard, tracking: z.boolean(), note: z.string().nullable(), savedAt: z.string(),
  status: PlanStatus.default('planned'), results: z.array(PlanStageResult).default([]),
  stages: z.array(Stage), calendarRaw: z.string().nullable(),
  /** Dated moments of the schedule the card shows, for the plan calendar. */
  calendarEvents: z.array(CalendarEvent).optional(),
});
export const PlanResponse = z.object({ items: z.array(PlanItem), total: z.number().int() });
/**
 * The plan calendar as a subscription feed: GET /calendar/<token>.ics (no sign-in, the token is the secret).
 * POST /me/calendar-feed creates the link or returns the existing one; reset=true replaces it, so old subscriptions stop.
 */
export const CalendarFeedRequest = z.object({ reset: z.boolean().optional() }).strict();
export const CalendarFeedResponse = z.object({ path: z.string().regex(/^\/calendar\/[A-Za-z0-9_-]{43}\.ics$/) });
export const CalendarFeedParams = z.object({ file: z.string().regex(/^[A-Za-z0-9_-]{43}\.ics$/) });
export const PlanEventsQuery = z.object({ days: z.coerce.number().int().min(1).max(366).default(90) }).strict();
export const PlanEventsResponse = z.object({
  from: IsoDay, through: IsoDay,
  items: z.array(NextEvent.extend({ olympiadId: z.number().int(), olympiadTitle: z.string() })),
});
/**
 * MAX bot reminders. `botConnected` — the user pressed «Начать» in the bot and has not stopped it since;
 * `botUrl` — link to the bot dialog (null while the bot is not configured on the server).
 */
export const NotificationSettings = z.object({ enabled: z.boolean(), botConnected: z.boolean(), botUrl: z.string().url().nullable() });
export const NotificationSettingsPatch = z.object({ enabled: z.boolean() }).strict();
export const AuthBody = z.object({ initData: z.string().min(1).max(16384) }).strict();
export const ErrorResponse = z.object({ error: z.string(), message: z.string() });
/** How many target directions and universities a profile may keep (the pickers in the profile show the same numbers). */
export const GOAL_LIMITS = { directions: 25, universities: 10 } as const;
export const ProfilePreferences = z.object({
  name: z.string().trim().min(1, 'Укажите имя').max(80),
  grade: z.number().int().min(1).max(11).nullable(),
  region: z.string().trim().max(100),
  subjects: z.array(z.number().int().positive()).max(35).refine(ids => new Set(ids).size === ids.length, 'Предметы не должны повторяться'),
  online: z.boolean(), onsite: z.boolean(),
  /** The goal: directions of study (codes from /directions) and universities (slugs from /universities). */
  directions: z.array(DirectionCode).max(GOAL_LIMITS.directions, `Можно выбрать не больше ${GOAL_LIMITS.directions} направлений`)
    .refine(v => new Set(v).size === v.length, 'Направления не должны повторяться').optional(),
  universities: z.array(Slug).max(GOAL_LIMITS.universities, `Можно выбрать не больше ${GOAL_LIMITS.universities} вузов`)
    .refine(v => new Set(v).size === v.length, 'Вузы не должны повторяться').optional(),
}).strict();
export const Avatar = z.string().max(1400000).refine(value => {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return false;
  try {
    const bytes = atob(match[2]!);
    if (bytes.length > 1024 * 1024) return false;
    if (match[1] === 'png') return bytes.startsWith('\x89PNG\r\n\x1a\n');
    if (match[1] === 'jpeg') return bytes.startsWith('\xff\xd8\xff');
    return bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP';
  } catch { return false; }
}, 'Выберите фото JPG, PNG или WebP размером до 1 МБ.').nullable();
export const ProfilePatch = ProfilePreferences.extend({ avatar: Avatar }).partial().refine(value => Object.keys(value).length > 0, 'Укажите изменения профиля');
export const UserProfile = ProfilePreferences.extend({
  // Profiles saved before the limit went down from 20 keep their universities until the user edits the goal.
  universities: z.array(Slug).max(20).optional(),
  avatar: Avatar.default(null),
  id: z.uuid(), maxUserId: z.string(), registeredAt: z.string().nullable(), createdAt: z.string(),
});
export type UserProfile = z.infer<typeof UserProfile>;
export type ProfilePreferences = z.infer<typeof ProfilePreferences>;
export type ProfilePatch = z.infer<typeof ProfilePatch>;
export const AuthResponse = z.object({ accessToken: z.string(), expiresIn: z.literal(3600), user: UserProfile });
export const VerifiedStageInput = z.object({
  olympiadId: z.number().int().positive(), key: z.string().min(1).max(200),
  name: z.string().trim().min(1).max(500), kind: z.enum(['registration', 'competition', 'other']),
  beginsOn: IsoDay.nullable(), endsOn: IsoDay.nullable(),
  sourceUrl: z.url().refine(v => /^https?:\/\//.test(v), 'Нужна HTTP(S) ссылка на источник'),
  verifiedAt: z.iso.datetime({ offset: true }),
}).strict().refine(s => s.beginsOn !== null || s.endsOn !== null, 'Укажите хотя бы одну дату')
  .refine(s => !s.beginsOn || !s.endsOn || s.beginsOn <= s.endsOn, 'Начало позже окончания');
export const VerifiedStagesFile = z.array(VerifiedStageInput).min(1).max(5000);
export type VerifiedStageInput = z.infer<typeof VerifiedStageInput>;

// Only conversational text and public catalog IDs may come from the client.
export const AssistantHistoryItem = z.object({
  role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(4000),
  olympiadIds: z.array(z.number().int().positive().max(2147483647)).max(5).default([]),
}).strict();
export const AssistantRequest = z.object({
  message: z.string().trim().min(1).max(2000),
  history: z.array(AssistantHistoryItem).max(10).default([]),
}).strict().refine(v => v.message.length + v.history.reduce((n, m) => n + m.content.length, 0) <= 12000,
  'Слишком длинная история разговора');
/**
 * The database had no answer and Olimp is already looking on the web: the app immediately sends `token`
 * to /assistant/web-search (no consent step). The token is a signed server ticket, never a client-built query.
 */
export const AssistantWebSearch = z.object({
  token: z.string().min(1).max(12000), question: z.string().max(2000),
  olympiadIds: z.array(z.number().int().positive()).max(3),
});
/** page / pdf — read on the web; faq — the olympiad FAQ of the app (data/faq) with its official sources. */
export const AssistantWebSource = z.object({
  title: z.string(), url: z.url().refine(url => /^https?:\/\//.test(url)), checkedAt: z.iso.datetime(), kind: z.enum(['page', 'pdf', 'faq']).optional(),
});
export const AssistantWebRequest = z.object({ token: z.string().min(1).max(12000) }).strict();
export const AssistantResponse = z.object({
  message: z.string().min(1).max(4000), olympiads: z.array(OlympiadCard).max(5),
  webSearch: AssistantWebSearch.optional(),
  webSources: z.array(AssistantWebSource).max(6).optional(),
  webDisclaimer: z.string().max(500).optional(),
});
export type AssistantRequest = z.infer<typeof AssistantRequest>;
export type AssistantResponse = z.infer<typeof AssistantResponse>;

/**
 * Minimal RFC 4180 reader: quoted fields, "" escapes, CRLF/LF, optional BOM. The delimiter is taken from the header line.
 * Shared by the Mini App (FAQ page) and the API (assistant knowledge), so both read the same data/*.csv files.
 */
export function parseDelimited(text: string): Record<string, string>[] {
  const source = text.replace(/^﻿/, '');
  const header = source.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = (header.match(/;/g)?.length ?? 0) >= (header.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i]!;
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field === '') quoted = true;
    else if (char === delimiter) { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
    } else field += char;
  }
  row.push(field);
  if (row.some(value => value.trim())) rows.push(row);
  const [columns, ...body] = rows;
  if (!columns) return [];
  return body.map(values => Object.fromEntries(columns.map((column, index) => [column.trim(), (values[index] ?? '').trim()])));
}

export type FaqSource = { name: string; url: string };
export type FaqEntry = { category: string; question: string; answer: string; sources: FaqSource[]; checkedAt: string | null };
/** data/faq/*.csv: category;question;answer;source_name;source_url;checked_at — several sources are separated by « | ». */
export function parseFaq(text: string): FaqEntry[] {
  return parseDelimited(text).flatMap(row => {
    const question = row.question ?? '', answer = row.answer ?? '';
    if (!question || !answer) return [];
    const names = (row.source_name ?? '').split(' | ').map(v => v.trim());
    const urls = (row.source_url ?? '').split('|').map(v => v.trim()).filter(Boolean);
    const sources = urls.flatMap((url, index) => /^https?:\/\//.test(url) ? [{ name: names[index] || new URL(url).hostname, url }] : []);
    const checkedAt = /^\d{4}-\d{2}-\d{2}$/.test(row.checked_at ?? '') ? row.checked_at! : null;
    return [{ category: row.category || 'Другое', question, answer, sources, checkedAt }];
  });
}
