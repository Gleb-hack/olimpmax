import { z } from 'zod';

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
  scheduleStatus: ScheduleStatus.optional(),
  sort: z.enum(['rating', 'name']).default('rating'),
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
export const SeriesRef = z.object({ slug: Slug, name: z.string() });
export const UniversityRef = z.object({ slug: Slug, name: z.string(), city: z.string() });
export const Benefit = z.object({
  university: UniversityRef, kind: BenefitKind, diploma: BenefitDiploma,
  minScore: z.number().int().nullable(), maxScore: z.number().int().nullable(), requirement: z.string().nullable(),
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
});
export const OlympiadDetail = OlympiadCard.extend({
  organizers: z.array(z.string()), contacts: z.array(z.string()), documents: z.array(z.string()),
  featuresRaw: z.string().nullable(), calendarRaw: z.string().nullable(), scheduleUpdatedRaw: z.string().nullable(),
  stages: z.array(Stage), rawSource: z.record(z.string(), z.string()), importedAt: z.string(),
  /** Original olimpiada.ru calendar when calendarRaw shows the reference schedule. */
  catalogCalendarRaw: z.string().nullable().optional(),
  seriesInfo: SeriesInfo.nullable().optional(),
  benefits: OlympiadBenefits.optional(),
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
export const UniversityListResponse = z.object({
  items: z.array(UniversityRef.extend({ fullName: z.string().nullable(), seriesCount: z.number().int(), olympiadCount: z.number().int() })),
});
export const SeriesBenefit = Benefit.omit({ university: true }).extend({ series: SeriesRef, olympiadIds: z.array(z.number().int()) });
export const UniversityResponse = UniversityRef.extend({ fullName: z.string().nullable(), benefits: z.array(SeriesBenefit) });
export const SeriesStage = z.object({
  id: z.string().uuid(), position: z.number().int(), name: z.string(), kind: z.enum(['registration', 'competition', 'other']),
  rawDates: z.string(), mode: StageMode.nullable(), beginsOn: IsoDay.nullable(), endsOn: IsoDay.nullable(),
});
export const SeriesResponse = SeriesInfo.extend({
  aliases: z.array(z.string()), stages: z.array(SeriesStage), benefits: z.array(Benefit),
  olympiads: z.array(z.object({ id: z.number().int(), title: z.string(), inCatalog: z.boolean(),
    profiles: z.array(z.string()), level: z.string().nullable() })),
});
export const PlanPatch = z.object({ tracking: z.boolean().optional(), note: z.string().trim().max(2000).nullable().optional() })
  .strict().refine(v => Object.keys(v).length > 0, 'Укажите tracking или note');
export const PlanItem = z.object({
  olympiad: OlympiadCard, tracking: z.boolean(), note: z.string().nullable(), savedAt: z.string(),
  stages: z.array(Stage), calendarRaw: z.string().nullable(),
});
export const PlanResponse = z.object({ items: z.array(PlanItem), total: z.number().int() });
export const PlanEventsQuery = z.object({ days: z.coerce.number().int().min(1).max(366).default(90) }).strict();
export const PlanEventsResponse = z.object({
  from: IsoDay, through: IsoDay,
  items: z.array(NextEvent.extend({ olympiadId: z.number().int(), olympiadTitle: z.string() })),
});
export const AuthBody = z.object({ initData: z.string().min(1).max(16384) }).strict();
export const ErrorResponse = z.object({ error: z.string(), message: z.string() });
export const ProfilePreferences = z.object({
  name: z.string().trim().min(1, 'Укажите имя').max(80),
  grade: z.number().int().min(1).max(11).nullable(),
  region: z.string().trim().max(100),
  subjects: z.array(z.number().int().positive()).max(35).refine(ids => new Set(ids).size === ids.length, 'Предметы не должны повторяться'),
  online: z.boolean(), onsite: z.boolean(),
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
  verifiedAt: z.iso.datetime({ offset: true }), verifiedBy: z.string().trim().min(1).max(200),
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
export const AssistantWebOffer = z.object({
  token: z.string().min(1).max(12000), question: z.string().max(2000),
  olympiads: z.array(z.object({ id: z.number().int().positive(), title: z.string() })).min(1).max(3),
});
export const AssistantWebSource = z.object({
  title: z.string(), url: z.url().refine(url => /^https?:\/\//.test(url)), checkedAt: z.iso.datetime(), kind: z.enum(['page', 'search_result']).optional(),
});
export const AssistantWebRequest = z.object({ token: z.string().min(1).max(12000) }).strict();
export const AssistantResponse = z.object({
  message: z.string().min(1).max(4000), olympiads: z.array(OlympiadCard).max(5),
  offerOnly: z.boolean().optional(),
  webSearchOffer: AssistantWebOffer.optional(),
  webSources: z.array(AssistantWebSource).max(6).optional(),
  webDisclaimer: z.string().max(500).optional(),
});
export type AssistantRequest = z.infer<typeof AssistantRequest>;
export type AssistantResponse = z.infer<typeof AssistantResponse>;
