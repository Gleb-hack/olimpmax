import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams, type SetURLSearchParams } from 'react-router-dom';
import { Button, EmptyState, Header, Loading, Notice, Icon } from '@olimp/ui';
import { api } from '../../lib/api';
import { useFilters, usePlan } from '../../lib/queries';
import { OlympiadCard } from './OlympiadCard';
import { CatalogPagination } from './CatalogPagination';
import { useProfile } from '../../lib/profile';
import { SubjectsDialog } from '../profile/SubjectsDialog';
import { UniversityCatalog, universitySearchId } from './UniversityCatalog';
import { FilterChip, MultiChoiceDialog, SingleChoiceDialog, SortDialog } from './CatalogDialogs';
import {
  catalogFilterKeys, catalogRequest, chipLabel, formatChoices, levelChoices, listParam, olympiadSorts, presetApplied, presetAvailable,
  presetParams, presetResultText, presetSummary, sortChoice,
} from './catalog-filters';
import { useOnboarding } from '../onboarding/onboarding-store';

/** «Олимпиады | Вузы» (Figma «Разделы каталога»); each mode keeps its own filters in the URL, switching starts from a clean list. */
export function CatalogModeSwitch({ universities, onChange }: { universities: boolean; onChange: (universities: boolean) => void }) {
  return <div className="segmented catalog-mode-switch" role="tablist" aria-label="Разделы каталога" data-tour="catalog-mode">
    <button type="button" role="tab" aria-selected={!universities} className={!universities ? 'is-active' : ''} onClick={() => onChange(false)}>Олимпиады</button>
    <button type="button" role="tab" aria-selected={universities} className={universities ? 'is-active' : ''} onClick={() => onChange(true)}>Вузы</button>
  </div>;
}

export function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const universities = params.get('mode') === 'universities';
  const switchMode = (next: boolean) => { if (next !== universities) setParams(next ? { mode: 'universities' } : {}); };
  const navigate = useNavigate();
  // Olympiads are searched on their own page; «Вузы» have the search field right on the list.
  const search = () => universities ? document.getElementById(universitySearchId)?.focus()
    : navigate('/search', { state: { backTo: `/catalog${params.size ? `?${params}` : ''}` } });
  const header = <Header title="Каталог" action={<button className="icon-button icon-button--blue" aria-label={universities ? 'Поиск вузов' : 'Поиск олимпиад'}
    onClick={search}><Icon name="search" size={18} /></button>} />;
  const modeSwitch = <CatalogModeSwitch universities={universities} onChange={switchMode} />;
  if (universities) return <>{header}<div className="catalog-controls">{modeSwitch}</div><UniversityCatalog params={params} setParams={setParams} /></>;
  return <OlympiadCatalog params={params} setParams={setParams} header={header} modeSwitch={modeSwitch} />;
}

type Popup = 'subjects' | 'grade' | 'format' | 'level' | 'sort' | null;

/**
 * Figma «📱 Каталог» and its states «подборка применена» and «подборка недоступна (профиль не заполнен)»:
 * sections, «Персональная подборка», filter chips with their popups, «Сбросить» and «Сортировать».
 */
function OlympiadCatalog({ params, setParams, header, modeSwitch }: { params: URLSearchParams; setParams: SetURLSearchParams; header: ReactNode; modeSwitch: ReactNode }) {
  const paramsRef = useRef(params);
  useEffect(() => { paramsRef.current = params; }, [params]);
  const [popup, setPopup] = useState<Popup>(null);
  const filters = useFilters();
  const plan = usePlan();
  const { profile } = useProfile();
  const query = catalogRequest(params, profile);
  const catalog = useQuery({ queryKey: ['catalog', query.toString()], queryFn: ({ signal }) => api.catalog(query.toString(), signal) });
  const commit = (next: URLSearchParams) => { next.delete('page'); paramsRef.current = next; setParams(next); };
  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(paramsRef.current);
    value ? next.set(key, value) : next.delete(key);
    commit(next);
  };
  // «Сбросить» clears the filters and keeps the chosen order.
  const reset = () => {
    const next = new URLSearchParams();
    const sort = paramsRef.current.get('sort');
    if (sort) next.set('sort', sort);
    commit(next);
  };
  // The tour shows how the selection works even before the profile is filled in; the page under it cannot be tapped.
  const touring = useOnboarding(tour => tour.active);
  const available = presetAvailable(profile) || touring;
  const applied = presetApplied(params, profile);
  const applyPreset = () => {
    const next = presetParams(profile);
    const sort = paramsRef.current.get('sort');
    if (sort) next.set('sort', sort);
    commit(next);
  };
  const subjects = filters.data?.subjects ?? [];
  const chosenSubjects = listParam(params, 'subjectIds');
  const chosenGrades = listParam(params, 'grades');
  const chosenFormats = listParam(params, 'formats');
  const chosenLevels = listParam(params, 'levels');
  const chosenUniversities = listParam(params, 'universities');
  const chosenDirections = listParam(params, 'directions');
  const labelOf = (options: readonly { value: string; label: string }[], values: string[]) => values.map(value => options.find(option => option.value === value)?.label ?? value);
  const universityNames = chosenUniversities.map(slug => filters.data?.universities?.find(item => item.slug === slug)?.name ?? slug);
  const hasFilters = catalogFilterKeys.some(key => params.has(key));
  const sort = sortChoice(params);
  const savedIds = new Set(plan.data?.items.map(entry => entry.olympiad.id));
  const backTo = `/catalog${params.size ? `?${params}` : ''}`;

  return <>
    {header}
    <div className="catalog-controls">
      {modeSwitch}
      <PersonalBanner available={available} applied={applied} summary={presetSummary(profile, subjects) || (touring ? 'Класс, предметы и цели из твоего профиля' : '')} onApply={applyPreset} onUndo={reset} />
      <div className="filter-chips" role="group" aria-label="Фильтры">
        <FilterChip icon="book" label={chipLabel('Предмет', chosenSubjects.map(id => subjects.find(subject => String(subject.id) === id)?.name ?? 'Предмет'))}
          active={chosenSubjects.length > 0} onClick={() => setPopup('subjects')} />
        <FilterChip icon="graduation-cap" label={chipLabel('Класс', chosenGrades.map(grade => `${grade} класс`))} active={chosenGrades.length > 0} onClick={() => setPopup('grade')} />
        <FilterChip icon="list" label={chipLabel('Формат', labelOf(formatChoices, chosenFormats))} active={chosenFormats.length > 0} onClick={() => setPopup('format')} />
        <FilterChip icon="bar-chart" label={chipLabel('Уровень', labelOf(levelChoices, chosenLevels))} active={chosenLevels.length > 0} onClick={() => setPopup('level')} />
        {chosenUniversities.length > 0 && <FilterChip icon="graduation-cap" label={`Льготы: ${chipLabel('', universityNames)}`} active onClick={() => updateParam('universities', '')} onClear={() => updateParam('universities', '')} />}
        {chosenDirections.length > 0 && <FilterChip icon="target" label={`Направления: ${chosenDirections.length}`} active onClick={() => updateParam('directions', '')} onClear={() => updateParam('directions', '')} />}
      </div>
      <div className="catalog-utils">
        <button type="button" className="catalog-util catalog-util--reset" disabled={!hasFilters} onClick={reset}><Icon name="refresh" size={15} />Сбросить</button>
        <button type="button" className="catalog-util" aria-haspopup="dialog" onClick={() => setPopup('sort')}>
          <Icon name="sort" size={15} />{sort === 'relevant' ? 'Сортировать' : olympiadSorts.find(option => option.value === sort)?.label}</button>
      </div>
    </div>
    {filters.isError && <Notice tone="warning">Список предметов не загрузился. <button className="text-button" onClick={() => filters.refetch()}>Повторить</button></Notice>}
    {applied && catalog.data ? <p className="catalog-result catalog-result--preset" aria-live="polite"><Icon name="check" size={15} />{presetResultText(catalog.data.total)}</p>
      : <div className="results-label" aria-live="polite"><span>{catalog.data ? `Найдено: ${catalog.data.total}` : 'Каталог олимпиад'}</span><span>{hasFilters ? 'По вашим фильтрам' : 'Все предметы'}</span></div>}
    {catalog.isPending ? <Loading label="Загружаем олимпиады…" /> : catalog.isError ? <EmptyState title="Не удалось загрузить каталог" action={<Button onClick={() => catalog.refetch()}>Попробовать снова</Button>}>{catalog.error.message}</EmptyState> : !catalog.data.items.length ? <EmptyState icon="search" title="Ничего не нашлось" action={<Button variant="secondary" onClick={reset}>Сбросить фильтры</Button>}>{applied ? 'Под твой профиль сейчас ничего нет. Сбрось подборку или выбери меньше предметов в профиле.' : 'Попробуйте другой запрос или выберите меньше фильтров.'}</EmptyState> : <>
      <div className="catalog-list">{catalog.data.items.map(item => <OlympiadCard key={item.id} item={item} saved={savedIds.has(item.id)} tracking={plan.data?.items.find(entry => entry.olympiad.id === item.id)?.tracking} backTo={backTo} />)}</div>
      <CatalogPagination page={catalog.data.page} totalPages={Math.max(1, Math.ceil(catalog.data.total / catalog.data.pageSize))} onChange={page => { updateParam('page', String(page)); window.scrollTo(0, 0); }} />
    </>}
    {popup === 'subjects' && <SubjectsDialog value={chosenSubjects.map(Number)} onApply={value => updateParam('subjectIds', value.join(','))} onClose={() => setPopup(null)} />}
    {popup === 'grade' && <SingleChoiceDialog title="Выберите класс" value={chosenGrades[0] ?? ''} onPick={value => updateParam('grades', value)} onClose={() => setPopup(null)}
      options={Array.from({ length: 11 }, (_, index) => ({ value: String(index + 1), label: `${index + 1} класс` }))} />}
    {popup === 'format' && <MultiChoiceDialog title="Формат участия" options={formatChoices} value={chosenFormats} onApply={value => updateParam('formats', value.join(','))} onClose={() => setPopup(null)} />}
    {popup === 'level' && <MultiChoiceDialog title="Уровень олимпиады" hint="Уровень из перечня Минобрнауки" options={levelChoices} value={chosenLevels} onApply={value => updateParam('levels', value.join(','))} onClose={() => setPopup(null)} />}
    {popup === 'sort' && <SortDialog options={olympiadSorts} value={sort} onPick={value => updateParam('sort', value === 'relevant' ? '' : value)} onClose={() => setPopup(null)} />}
  </>;
}

/**
 * «Персональная подборка»: one tap turns the profile into catalog filters. Applied — «✓ Применено», a tap takes it off;
 * with an empty profile — «Персональная подборка недоступна» and a way to fill the profile in.
 */
function PersonalBanner({ available, applied, summary, onApply, onUndo }: { available: boolean; applied: boolean; summary: string; onApply: () => void; onUndo: () => void }) {
  if (!available) return <section className="personal-banner personal-banner--unavailable" aria-labelledby="personal-banner-title">
    <div className="personal-banner__row">
      <span className="personal-banner__icon" aria-hidden="true"><Icon name="alert-triangle" size={20} /></span>
      <span className="personal-banner__copy"><strong id="personal-banner-title">Персональная подборка недоступна</strong><small>Заполни класс и предметы в профиле — это займёт 1 минуту</small></span>
    </div>
    <Link className="personal-banner__action personal-banner__action--wide" to="/profile/edit">Заполнить профиль</Link>
  </section>;
  return <section className={`personal-banner ${applied ? 'is-applied' : ''}`} aria-labelledby="personal-banner-title">
    <div className="personal-banner__row">
      <span className="personal-banner__icon" aria-hidden="true"><Icon name="sparkle" size={18} /></span>
      <span className="personal-banner__copy"><strong id="personal-banner-title">{applied ? 'Персональная подборка применена' : 'Персональная подборка'}</strong>{summary && <small>{summary}</small>}</span>
      <button type="button" className="personal-banner__action" aria-pressed={applied} onClick={applied ? onUndo : onApply}
        aria-label={applied ? 'Персональная подборка применена. Нажмите, чтобы снять' : undefined}>{applied ? <><Icon name="check" size={13} />Применено</> : 'Применить'}</button>
    </div>
  </section>;
}
