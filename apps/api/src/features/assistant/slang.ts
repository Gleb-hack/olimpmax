// School and admission slang → full names, before the model classifies a message.
// «матеша» → математика, «общага» → обществознание, «вышка» → НИУ ВШЭ, «ЗЭ» → заключительный этап.
// The model still sees the original text; this adds a normalized copy, a glossary and deterministic subject hints,
// so a short slang request («олимпы по матеше 9 класс») is never classified as off-topic or left without a subject.

type Entry = {
  pattern: string;
  /** Replacement in the normalized text; null keeps the word and only explains it in the glossary. */
  replacement: string | null;
  meaning: string;
  /** Exact subject name from the catalog (`subjects.name`). */
  subject?: string;
  /** University slug from data/reference/universities.csv. */
  university?: string;
};

const LETTER = '\\p{L}\\p{N}';
const languages: Record<string, string> = {
  'английск': 'Английский язык', 'немецк': 'Немецкий язык', 'французск': 'Французский язык', 'испанск': 'Испанский язык',
  'итальянск': 'Итальянский язык', 'китайск': 'Китайский язык', 'японск': 'Японский язык', 'корейск': 'Корейский язык',
  'арабск': 'Арабский язык', 'латинск': 'Латинский язык', 'русск': 'Русский язык',
};

const entries: Entry[] = [
  // --- subjects (more specific patterns first: «физра» before «физа») ---
  { pattern: 'физр\\p{L}*|физ-ра|физ-ры|физ-ре|физ-ру|физкульт\\p{L}*', replacement: 'физическая культура', meaning: 'физическая культура', subject: 'Физическая культура' },
  { pattern: 'матеш\\p{L}*|матан\\p{L}*|матем|матик[аиуеой]|матех[аиуеой]|матек[аиуеой]', replacement: 'математика', meaning: 'математика', subject: 'Математика' },
  // «инфа» also means «информация» («нет инфы о сроках»): informatics only after «по», before «олимпиада»/class, or alone.
  { pattern: '(?<=по\\s)(?:инф[аыуео]|инфой)|инф[аеу](?=\\s+(?:олимп|\\d|класс))|инфочк\\p{L}*|инфошк\\p{L}*|инфорк\\p{L}*|информ[аыуе]', replacement: 'информатика', meaning: 'информатика', subject: 'Информатика' },
  { pattern: '(?<=по\\s)(?:прог[аиуеы]|прогой)|кодинг\\p{L}*', replacement: 'программирование (информатика)', meaning: 'программирование — олимпиады по информатике', subject: 'Информатика' },
  { pattern: 'физ[ауые]|физой|физон\\p{L}*|физос\\p{L}*|физик[уе]?(?=\\s+олимп)', replacement: 'физика', meaning: 'физика', subject: 'Физика' },
  { pattern: 'хим[аыуе]|химой|химоз\\p{L}*|химк[аиуеой]', replacement: 'химия', meaning: 'химия', subject: 'Химия' },
  { pattern: 'биш[аиуеой]|биол[аыуеой]|биох[аиуеой]|био', replacement: 'биология', meaning: 'биология', subject: 'Биология' },
  // «олимпиада по общаге» — обществознание; «есть ли общага в МФТИ» — общежитие: only the glossary explains the second case.
  { pattern: '(?<=по\\s)общаг\\p{L}*|общаг\\p{L}*(?=\\s+(?:олимп|\\d|класс))', replacement: 'обществознание', meaning: 'обществознание', subject: 'Обществознание' },
  { pattern: 'общаг\\p{L}*', replacement: null, meaning: 'в школьном сленге — обществознание; в разговоре о вузе — общежитие' },
  { pattern: 'общ[аиуы]|общ-во|обществоз|(?<=по\\s)обществ[уеа]', replacement: 'обществознание', meaning: 'обществознание', subject: 'Обществознание' },
  { pattern: 'русич\\p{L}*|русяз\\p{L}*|рус\\.?\\s?яз\\.?', replacement: 'русский язык', meaning: 'русский язык', subject: 'Русский язык' },
  { pattern: '(?<!\\d\\s?)литр[аыуеой]|лит-р[аыуеой]|литер[аыуеой]', replacement: 'литература', meaning: 'литература', subject: 'Литература' },
  { pattern: 'истор|истух\\p{L}*|исторя', replacement: 'история', meaning: 'история', subject: 'История' },
  { pattern: 'англ|англ[аиуе]|англ\\.|инглиш\\p{L}*|англиш\\p{L}*|англюс\\p{L}*', replacement: 'английский язык', meaning: 'английский язык', subject: 'Английский язык' },
  { pattern: 'дойч\\p{L}*', replacement: 'немецкий язык', meaning: 'немецкий язык', subject: 'Немецкий язык' },
  { pattern: 'гег[аиуеой]|геогр|геогр[ау]|гео', replacement: 'география', meaning: 'география', subject: 'География' },
  { pattern: 'экон|эконом|экономк[аиуеой]', replacement: 'экономика', meaning: 'экономика', subject: 'Экономика' },
  { pattern: 'астр[аыуеой]', replacement: 'астрономия', meaning: 'астрономия', subject: 'Астрономия' },
  { pattern: 'эко|экол[аыуеой]', replacement: 'экология', meaning: 'экология', subject: 'Экология' },
  { pattern: 'обж|обзр', replacement: 'ОБЗР', meaning: 'ОБЗР — основы безопасности и защиты Родины (раньше ОБЖ)', subject: 'ОБЗР' },
  { pattern: 'мхк', replacement: 'искусство (МХК)', meaning: 'искусство (МХК)', subject: 'Искусство' },
  { pattern: '(?<=по\\s)(?:труд[уаеы]|трудам)|трудовик\\p{L}*', replacement: 'технология', meaning: 'технология (труд)', subject: 'Технология' },
  { pattern: 'лингв[аыуеой]|линг[аиуеой]', replacement: 'лингвистика', meaning: 'лингвистика', subject: 'Лингвистика' },
  { pattern: 'робот(?:ы|ов|ам|ами|ах)|робо', replacement: 'робототехника', meaning: 'робототехника', subject: 'Робототехника' },
  // --- olympiads, stages and admission ---
  { pattern: 'олимп(?:ы|ов|ам|ами|ах|ку|ки|ка|ке|кой|ок|ках)|олимпиадк\\p{L}*|олимпиадок', replacement: 'олимпиады', meaning: 'олимпиады' },
  { pattern: 'вош[аеиу]?|вошем|всош[аеиу]?|всошем|всерос|всеросс|всероск[аиуеой]|всерк[аиуеой]', replacement: 'ВсОШ (Всероссийская олимпиада школьников)', meaning: 'ВсОШ — Всероссийская олимпиада школьников' },
  { pattern: 'шэ', replacement: 'школьный этап', meaning: 'школьный этап ВсОШ' },
  { pattern: 'мэ|муниц|муник|муниципалк[аиуеой]', replacement: 'муниципальный этап', meaning: 'муниципальный этап ВсОШ' },
  { pattern: 'рэ|регионалк[аиуеой]|региональник\\p{L}*', replacement: 'региональный этап', meaning: 'региональный этап ВсОШ' },
  { pattern: 'зэ|заключ|заключк[аиуеой]|закл|финалк[аиуеой]', replacement: 'заключительный этап', meaning: 'заключительный этап (финал)' },
  { pattern: 'межнар\\p{L}*', replacement: 'международная олимпиада', meaning: 'международная олимпиада' },
  { pattern: 'ломоносовк[аиуеой]|ломик', replacement: 'олимпиада «Ломоносов»', meaning: 'олимпиада «Ломоносов» (МГУ)' },
  { pattern: 'пвг', replacement: 'олимпиада «Покори Воробьёвы горы!»', meaning: 'олимпиада «Покори Воробьёвы горы!» (МГУ)' },
  { pattern: 'высшк[аиуеой]|вышкинск(?:ая|ой|ую)\\s+олимпиад\\p{L}*', replacement: 'олимпиада «Высшая проба»', meaning: 'олимпиада «Высшая проба» (НИУ ВШЭ)' },
  { pattern: 'бвишк\\p{L}*|бвишник\\p{L}*|бвих[аиуеой]', replacement: 'БВИ', meaning: 'БВИ — поступление без вступительных испытаний' },
  { pattern: 'стобалльник\\p{L}*|сотк[аиуеой]|соточк[аиуеой]', replacement: '100 баллов ЕГЭ', meaning: '100 баллов ЕГЭ по профильному предмету' },
  { pattern: 'допы|допов|допах|допам', replacement: 'дополнительные вступительные испытания (ДВИ)', meaning: 'ДВИ — дополнительные вступительные испытания' },
  { pattern: 'егэшк\\p{L}*', replacement: 'ЕГЭ', meaning: 'ЕГЭ' },
  { pattern: 'огэшк\\p{L}*', replacement: 'ОГЭ', meaning: 'ОГЭ' },
  // --- universities ---
  { pattern: 'вышк[аиуеой]|вшэ', replacement: 'НИУ ВШЭ', meaning: 'НИУ ВШЭ (Высшая школа экономики)', university: 'hse' },
  { pattern: 'бауманк[аиуеой]|бауманск\\p{L}*', replacement: 'МГТУ им. Н.Э. Баумана', meaning: 'МГТУ им. Н.Э. Баумана', university: 'bmstu' },
  { pattern: 'физтех(?!\\s*[.-]?\\s*код)', replacement: null, meaning: 'МФТИ; «Физтех» — также название олимпиады МФТИ', university: 'mipt' },
  { pattern: 'мифишк\\p{L}*', replacement: 'НИЯУ МИФИ', meaning: 'НИЯУ МИФИ', university: 'mephi' },
  { pattern: 'мгимошк\\p{L}*', replacement: 'МГИМО', meaning: 'МГИМО', university: 'mgimo' },
  { pattern: 'плешк[аиуеой]|плехановк[аиуеой]|плеханк[аиуеой]', replacement: 'РЭУ им. Г.В. Плеханова', meaning: 'РЭУ им. Г.В. Плеханова', university: 'rea' },
  { pattern: 'финашк[аиуеой]|финунивер\\p{L}*|финуник\\p{L}*', replacement: 'Финансовый университет', meaning: 'Финансовый университет при Правительстве РФ', university: 'fa' },
  { pattern: 'политех(?:[аеуи]|ом)?', replacement: null, meaning: 'политехнический университет; в Петербурге — СПбПУ Петра Великого (уточни город)', university: 'spbstu' },
  { pattern: 'мисиз|стали\\s+и\\s+сплавов', replacement: 'МИСИС', meaning: 'Университет МИСИС', university: 'misis' },
  { pattern: 'ранх[аиуеой]?|ранепа|президентск(?:ая|ой|ую)\\s+академи\\p{L}*', replacement: 'РАНХиГС', meaning: 'РАНХиГС', university: 'ranepa' },
  { pattern: 'лумумб\\p{L}*', replacement: 'РУДН', meaning: 'РУДН им. Патриса Лумумбы', university: 'rudn' },
  { pattern: 'кутафинк[аиуеой]', replacement: 'МГЮА им. О.Е. Кутафина', meaning: 'МГЮА им. О.Е. Кутафина', university: 'msal' },
  { pattern: 'менделеевк[аиуеой]', replacement: 'РХТУ им. Д.И. Менделеева', meaning: 'РХТУ им. Д.И. Менделеева', university: 'muctr' },
  { pattern: 'мирэашк\\p{L}*|мирея', replacement: 'РТУ МИРЭА', meaning: 'РТУ МИРЭА', university: 'mirea' },
  { pattern: 'мгушк\\p{L}*', replacement: 'МГУ', meaning: 'МГУ им. М.В. Ломоносова', university: 'msu' },
  { pattern: 'спбгушк\\p{L}*', replacement: 'СПбГУ', meaning: 'СПбГУ', university: 'spbu' },
  { pattern: 'итмошк\\p{L}*', replacement: 'ИТМО', meaning: 'ИТМО', university: 'itmo' },
  { pattern: 'сеченовк[аиуеой]|перв(?:ый|ого|ом|ому)\\s+мед\\p{L}*', replacement: 'Сеченовский Университет', meaning: 'Сеченовский Университет (Первый МГМУ)', university: 'sechenov' },
  { pattern: 'казанск(?:ий|ого|ом)\\s+мед\\p{L}*', replacement: 'Казанский ГМУ', meaning: 'Казанский ГМУ', university: 'kazan-gmu' },
];

const compiled = entries.map(entry => ({ ...entry, regex: new RegExp(`(?<![${LETTER}])(?:${entry.pattern})(?![${LETTER}])`, 'giu') }));
// «олимпиада по немецкому», «по русскому» → «… языку». «Русский медвежонок» and full «русскому языку» stay as they are.
const languageRegex = new RegExp(`(?<=по\\s)(${Object.keys(languages).join('|')})(?:ому|ий)(?!\\s+(?:язык|медвеж))(?![${LETTER}])`, 'giu');

export type SlangTerm = { term: string; meaning: string };
export type SlangResult = { text: string; glossary: SlangTerm[]; subjects: string[]; universities: string[] };

export function normalizeSlang(input: string): SlangResult {
  const glossary = new Map<string, string>();
  const subjects = new Set<string>(), universities = new Set<string>();
  // A message that is just «инфа» / «прога» is the subject, not «информация» / «программа».
  const bare = input.trim().toLocaleLowerCase('ru');
  if (/^(?:инф[аыуе]|прог[аиуе]|общаг\p{L}*)(?:[?!.\s]*|\s+\d{1,2}.*)$/u.test(bare)) input = `по ${input.trim()}`;
  let text = input.replace(languageRegex, (match, stem: string) => {
    const subject = languages[stem.toLocaleLowerCase('ru')]!;
    glossary.set(match.toLocaleLowerCase('ru'), subject.toLocaleLowerCase('ru'));
    subjects.add(subject);
    return subject.toLocaleLowerCase('ru');
  });
  for (const entry of compiled) {
    text = text.replace(entry.regex, match => {
      glossary.set(match.toLocaleLowerCase('ru'), entry.meaning);
      if (entry.subject) subjects.add(entry.subject);
      if (entry.university) universities.add(entry.university);
      return entry.replacement ?? match;
    });
  }
  return { text, glossary: [...glossary].map(([term, meaning]) => ({ term, meaning })), subjects: [...subjects], universities: [...universities] };
}

const fillers = new Set(['дай', 'давай', 'скинь', 'подкинь', 'глянь', 'нибудь', 'олимпиады', 'олимпиада', 'олимпиаду', 'олимпиад', 'по', 'для', 'на', 'в', 'и', 'а', 'или', 'мне', 'нам', 'есть', 'какие', 'какая', 'какую',
  'найди', 'найти', 'подбери', 'подобрать', 'покажи', 'посоветуй', 'хочу', 'нужны', 'нужна', 'интересуют', 'интересует', 'класс', 'класса', 'классов', 'кл',
  'онлайн', 'очно', 'очные', 'дистанционно', 'дистанционные', 'заочно', 'ещё', 'еще', 'тоже', 'пожалуйста', 'плиз', 'пж', 'ну', 'вот', 'что', 'нибудь', 'нить']);
/** «олимпы по матеше 9 класс» — only a subject, grade and format: a catalog search, never an off-topic message. */
export function isBareSubjectRequest(normalized: string, subjects: string[]) {
  if (!subjects.length) return false;
  let rest = normalized.toLocaleLowerCase('ru');
  for (const subject of subjects) rest = rest.replaceAll(subject.toLocaleLowerCase('ru'), ' ');
  rest = rest.replace(/\(информатика\)|программирование/g, ' ');
  const words = (rest.match(/[\p{L}\p{N}]+/gu) ?? []).filter(word => !fillers.has(word) && !/^\d{1,2}(?:й|го|ый|ом)?$/.test(word)
    && !/^(?:перв|втор|трет|четвёрт|четверт|пят|шест|седьм|восьм|девят|десят|одиннадцат)\p{L}*$/u.test(word));
  return words.length === 0;
}
