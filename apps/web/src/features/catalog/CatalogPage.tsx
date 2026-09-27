import { useEffect, useRef, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDownUp, BookOpen, GraduationCap, ListFilter, RefreshCw, Search, Split, X } from 'lucide-react';
import { Button, Dialog, EmptyState, Header, Loading, Notice, Select } from '@olimp/ui';
import { api } from '../../lib/api';
import { useFilters, usePlan } from '../../lib/queries';
import { useUI } from '../../lib/ui-store';
import { formats, gradeLabel, levelLabel, scheduleLabel } from '../../lib/format';
import { OlympiadCard } from './OlympiadCard';

export function Comparison({ onClose }: { onClose: () => void }) {
  const ids = useUI(state => state.comparisonIds);
  const queries = useQueries({ queries: ids.map(id => ({ queryKey: ['olympiad', id], queryFn: () => api.detail(id) })) });
  const items = queries.flatMap(query => query.data ? [query.data] : []);
  return <Dialog title="Сравнение олимпиад" onClose={onClose}><p className="muted dialog-intro">Выбрано: {ids.length}</p>
    {queries.some(query => query.isPending) ? <Loading /> : queries.some(query => query.isError) ? <Notice tone="error">Не удалось загрузить сравнение. Закройте окно и попробуйте ещё раз.</Notice> : <div className="comparison-wrap"><table className="comparison-table"><thead><tr><th>Параметр</th>{items.map(item => <th key={item.id}>{item.title}</th>)}</tr></thead><tbody>
      {(['Предметы', 'Формат', 'Классы', 'Уровень олимпиады', 'Расписание'] as const).map((label, index) => <tr key={label}><th>{label}</th>{items.map(item => <td key={item.id}>{[item.subjects.map(s => s.name).join(', '), formats[item.format], gradeLabel(item), levelLabel(item), scheduleLabel(item)][index]}</td>)}</tr>)}
    </tbody></table></div>}<Button className="full-width" onClick={onClose}>Готово</Button>
  </Dialog>;
}

export function CatalogPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const paramsRef = useRef(params);
  useEffect(() => { paramsRef.current = params; }, [params]);
  const [sortOpen, setSortOpen] = useState(false);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const selected = useUI(state => state.comparisonIds);
  const clearComparison = useUI(state => state.clearComparison);
  const filters = useFilters();
  const plan = usePlan();
  const query = new URLSearchParams(params);
  query.set('pageSize', '20');
  const catalog = useQuery({ queryKey: ['catalog', query.toString()], queryFn: ({ signal }) => api.catalog(query.toString(), signal) });
  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(paramsRef.current);
    value ? next.set(key, value) : next.delete(key);
    if (key !== 'page') next.delete('page');
    paramsRef.current = next;
    setParams(next);
  };
  const reset = () => { paramsRef.current = new URLSearchParams(); setParams({}); };
  const savedIds = new Set(plan.data?.items.map(entry => entry.olympiad.id));
  const hasFilters = ['q', 'subjectIds', 'grades', 'formats'].some(key => params.has(key));
  return <>
    <Header title="Каталог" action={<button className="icon-button icon-button--blue" aria-label="Поиск олимпиад" onClick={() => navigate('/search', { state: { backTo: `/catalog${params.size ? `?${params}` : ''}` } })}><Search size={20} /></button>} />
    <div className="filter-grid">
      <Select label="Предмет" placeholder="Предмет" icon={BookOpen} searchable searchPlaceholder="Найти предмет" value={params.get('subjectIds') || ''} onChange={value => updateParam('subjectIds', value)} options={[{ value: '', label: 'Все предметы' }, ...(filters.data?.subjects.map(subject => ({ value: String(subject.id), label: subject.name })) ?? [])]} />
      <Select label="Класс" placeholder="Класс" icon={GraduationCap} align="right" value={params.get('grades') || ''} onChange={value => updateParam('grades', value)} options={[{ value: '', label: 'Все классы' }, ...Array.from({ length: 11 }, (_, index) => ({ value: String(index + 1), label: `${index + 1} класс` }))]} />
      <Select label="Формат" placeholder="Формат" icon={ListFilter} value={params.get('formats') || ''} onChange={value => updateParam('formats', value)} options={[{ value: '', label: 'Любой формат' }, ...Object.entries(formats).map(([value, label]) => ({ value, label }))]} />
      <button className="reset-filter" onClick={reset}><RefreshCw size={16} />Сбросить фильтры</button>
    </div>
    {filters.isError && <Notice tone="warning">Список предметов не загрузился. <button className="text-button" onClick={() => filters.refetch()}>Повторить</button></Notice>}
    <Button className="full-width sort-button" onClick={() => setSortOpen(true)}><ArrowDownUp size={16} />{params.get('sort') === 'name' ? 'По названию' : 'Сортировать'}</Button>
    {selected.length > 0 && <div className="compare-bar"><Split size={16} /><span>Выбрано для сравнения</span><b>{selected.length}</b><button disabled={selected.length !== 2} onClick={() => setComparisonOpen(true)}>Сравнить →</button><button className="icon-button" aria-label="Сбросить сравнение" onClick={clearComparison}><X size={14} /></button></div>}
    <div className="results-label" aria-live="polite"><span>{catalog.data ? `Найдено: ${catalog.data.total}` : 'Каталог олимпиад'}</span><span>{hasFilters ? 'По вашим фильтрам' : 'Все предметы'}</span></div>
    {catalog.isPending ? <Loading label="Загружаем олимпиады…" /> : catalog.isError ? <EmptyState title="Не удалось загрузить каталог" action={<Button onClick={() => catalog.refetch()}>Попробовать снова</Button>}>{catalog.error.message}</EmptyState> : !catalog.data.items.length ? <EmptyState icon={Search} title="Ничего не нашлось" action={<Button variant="secondary" onClick={reset}>Сбросить фильтры</Button>}>Попробуйте другой запрос или выберите меньше фильтров.</EmptyState> : <>
      <div className="catalog-list">{catalog.data.items.map(item => <OlympiadCard key={item.id} item={item} saved={savedIds.has(item.id)} tracking={plan.data?.items.find(entry => entry.olympiad.id === item.id)?.tracking} backTo={`/catalog${params.size ? `?${params}` : ''}`} />)}</div>
      <div className="pagination"><Button variant="secondary" disabled={catalog.data.page <= 1} onClick={() => { updateParam('page', String(catalog.data.page - 1)); window.scrollTo(0, 0); }}>Назад</Button><span>{catalog.data.page} / {Math.max(1, Math.ceil(catalog.data.total / 20))}</span><Button variant="secondary" disabled={catalog.data.page * 20 >= catalog.data.total} onClick={() => { updateParam('page', String(catalog.data.page + 1)); window.scrollTo(0, 0); }}>Далее</Button></div>
    </>}
    {sortOpen && <Dialog title="Сортировка" onClose={() => setSortOpen(false)}><div className="choice-list">{[{ value: 'rating', label: 'По рейтингу источника', description: 'Сначала с высоким рейтингом' }, { value: 'name', label: 'По названию', description: 'От А до Я' }].map(option => <label key={option.value} className="choice-row"><input type="radio" name="sort" value={option.value} checked={(params.get('sort') || 'rating') === option.value} onChange={() => { updateParam('sort', option.value); setSortOpen(false); }} /><span><strong>{option.label}</strong><small>{option.description}</small></span></label>)}</div></Dialog>}
    {comparisonOpen && <Comparison onClose={() => setComparisonOpen(false)} />}
  </>;
}
