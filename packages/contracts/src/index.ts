import { z } from 'zod';

export const Format = z.enum(['onsite', 'online', 'hybrid', 'unknown']);
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
  origin: z.enum(['csv', 'verified_import']),
});
export const NextEvent = z.object({
  stageId: z.string().uuid(), name: z.string().nullable(), date: IsoDay,
  kind: z.enum(['starts', 'ends']), timezone: z.literal('Europe/Moscow'),
  sourceUrl: z.string().url(),
});
export const CalendarState = z.enum(['unknown', 'unverified', 'verified', 'needs_review', 'no_upcoming', 'not_held']);
export const OlympiadCard = z.object({
  id: z.number().int(), title: z.string(), description: z.string().nullable(),
  organizers: z.array(z.string()).optional(),
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
export const ProfilePatch = ProfilePreferences.partial().refine(value => Object.keys(value).length > 0, 'Укажите изменения профиля');
export const UserProfile = ProfilePreferences.extend({
  id: z.uuid(), maxUserId: z.string(), registeredAt: z.string().nullable(), createdAt: z.string(),
});
export type UserProfile = z.infer<typeof UserProfile>;
export type ProfilePreferences = z.infer<typeof ProfilePreferences>;
export type ProfilePatch = z.infer<typeof ProfilePatch>;
export const AuthResponse = z.object({ accessToken: z.string(), expiresIn: z.literal(3600), user: UserProfile });
// Data that exists only on the user's device; the client sends it so the export file is complete.
export const ExportDevice = z.object({
  avatar: z.string().max(1500000).regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).nullable(),
  searchHistory: z.array(z.string().trim().min(1).max(200)).max(8),
}).strict();
export const ExportRequest = z.object({ device: ExportDevice }).strict();
export const ExportTicket = z.object({ path: z.string(), fileName: z.string(), expiresIn: z.number().int().positive() });
export const exportNotStored = [
  'Переписка с Олимпом не сохраняется: она живёт только в открытом приложении и очищается при перезагрузке.',
  'Запросы к поиску в интернете и их результаты не сохраняются.',
];
export const AccountExport = z.object({
  format: z.literal('olimpmax-export'), version: z.literal(1), exportedAt: z.string(),
  account: z.object({ id: z.uuid(), maxUserId: z.string(), maxDisplayName: z.string(), createdAt: z.string(), registeredAt: z.string().nullable(), updatedAt: z.string() }),
  profile: z.object({ name: z.string(), grade: z.number().int().nullable(), region: z.string(),
    subjects: z.array(z.object({ id: z.number().int(), name: z.string() })), online: z.boolean(), onsite: z.boolean() }),
  plan: z.array(z.object({ olympiadId: z.number().int(), title: z.string(), sourceUrl: z.string(), tracking: z.boolean(), note: z.string().nullable(), savedAt: z.string() })),
  device: ExportDevice,
  notStored: z.array(z.string()),
});
export type ExportDevice = z.infer<typeof ExportDevice>;
export type AccountExport = z.infer<typeof AccountExport>;
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
