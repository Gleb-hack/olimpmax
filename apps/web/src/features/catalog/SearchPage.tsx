import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowUpLeft, History, Search, X } from 'lucide-react';
import { Button, EmptyState, Loading, Notice } from '@olimp/ui';
import { api } from '../../lib/api';
import { usePlan } from '../../lib/queries';
import { localKeys, readSearchHistory } from '../../lib/local-data';
import { useUI } from '../../lib/ui-store';
import { OlympiadCard } from './OlympiadCard';
import { Comparison } from './CatalogPage';

const popular = [{ label: 'Информатика', query: 'Информатика' }, { label: 'Математика', query: 'Математика' }, { label: 'ВсОШ', query: 'Всероссийская олимпиада' }, { label: 'Физика', query: 'Физика' }];
export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const backTo = typeof location.state?.backTo === 'string' && /^\/catalog(?:\?|$)/.test(location.state.backTo) ? location.state.backTo : '/catalog';
  const urlQuery = (params.get('q') || '').slice(0, 200);
  const [input, setInput] = useState(urlQuery);
  const [history, setHistory] = useState(readSearchHistory);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const plan = usePlan();
  const selected = useUI(state => state.comparisonIds);
  const clearComparison = useUI(state => state.clearComparison);
  useEffect(() => { setInput(urlQuery); }, [urlQuery]);
  useEffect(() => {
    if (input.trim() === urlQuery) return;
    const timer = setTimeout(() => setParams(input.trim() ? { q: input.trim() } : {}, { replace: true, state: location.state }), 350);
    return () => clearTimeout(timer);
  }, [input, urlQuery, setParams, location.state]);
  const results = useInfiniteQuery({
    queryKey: ['search', urlQuery], enabled: !!urlQuery,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => api.catalog(new URLSearchParams({ q: urlQuery, page: String(pageParam), pageSize: '20' }).toString(), signal),
    getNextPageParam: last => last.page * last.pageSize < last.total ? last.page + 1 : undefined,
  });
  useEffect(() => {
    if (!urlQuery || !results.isSuccess) return;
    const timer = setTimeout(() => {
      const next = [urlQuery, ...readSearchHistory().filter(value => value.toLocaleLowerCase('ru') !== urlQuery.toLocaleLowerCase('ru'))].slice(0, 8);
      setHistory(next);
      try { localStorage.setItem(localKeys.searchHistory(), JSON.stringify(next)); } catch { /* Search remains usable when storage is unavailable. */ }
    }, 1000);
    return () => clearTimeout(timer);
  }, [urlQuery, results.isSuccess]);
  function chooseQuery(query: string) { setInput(query); setParams(query ? { q: query } : {}, { replace: true, state: location.state }); }
  const items = results.data?.pages.flatMap(page => page.items) ?? [];
  const total = results.data?.pages[0]?.total ?? 0;
  const waiting = input.trim() !== urlQuery;
  const saved = new Set(plan.data?.items.map(entry => entry.olympiad.id));
  return <>
    <h1 className="sr-only" tabIndex={-1}>Поиск олимпиад</h1>
    <div className="search-page__header"><Link to={backTo} className="icon-button back-button" aria-label="Назад в каталог"><ArrowLeft size={19} /></Link><form className="search-page__field" role="search" onSubmit={event => { event.preventDefault(); chooseQuery(input.trim()); inputRef.current?.blur(); }}><Search size={18} /><input ref={inputRef} aria-label="Поиск олимпиад" placeholder="Поиск олимпиад" autoComplete="off" enterKeyHint="search" maxLength={200} value={input} onChange={event => setInput(event.target.value)} />{input && <button type="button" aria-label="Очистить поиск" onClick={() => { chooseQuery(''); inputRef.current?.focus(); }}><X size={17} /></button>}</form></div>
    {!input.trim() ? <div className="search-start"><section><h2>Популярные запросы</h2><div className="subject-tabs">{popular.map(item => <button key={item.label} className="chip" onClick={() => chooseQuery(item.query)}>{item.label}</button>)}</div></section><section className="section"><h2>История поиска</h2>{history.length ? <div className="search-history">{history.map(query => <button key={query} className="search-history__row" onClick={() => chooseQuery(query)}><History size={16} /><span>{query}</span><ArrowUpLeft size={17} /></button>)}</div> : <p className="hint">Здесь появятся ваши последние запросы</p>}</section></div> : <>
      <p className="section-caption search-count" aria-live="polite">{waiting || results.isPending ? 'Ищем олимпиады…' : `Результаты · ${total}`}</p>
      {waiting || results.isPending ? <Loading label="Поиск…" /> : results.isError && !results.data ? <EmptyState icon={Search} title="Не удалось выполнить поиск" action={<Button onClick={() => results.refetch()}>Попробовать снова</Button>}>{results.error.message}</EmptyState> : !items.length ? <EmptyState icon={Search} title="Ничего не найдено">Попробуйте другое название олимпиады или предмет.</EmptyState> : <><div className="catalog-list">{items.map(item => <OlympiadCard key={item.id} item={item} saved={saved.has(item.id)} tracking={plan.data?.items.find(entry => entry.olympiad.id === item.id)?.tracking} returnTo={backTo} backTo={`/search?${new URLSearchParams({ q: urlQuery })}`} />)}</div>{results.hasNextPage ? <Button className="full-width search-more" variant="secondary" disabled={results.isFetchingNextPage} onClick={() => results.fetchNextPage()}>{results.isFetchingNextPage ? 'Загружаем…' : 'Показать ещё'}</Button> : <p className="hint search-end">Больше олимпиад по этому запросу не найдено</p>}{results.isFetchNextPageError && <Notice tone="error">Не удалось загрузить следующую страницу. Попробуйте ещё раз.</Notice>}</>}
      {selected.length > 0 && <div className="compare-bar search-comparison"><span>Выбрано для сравнения</span><b>{selected.length}</b><button disabled={selected.length !== 2} onClick={() => setComparisonOpen(true)}>Сравнить →</button><button className="icon-button" aria-label="Сбросить сравнение" onClick={clearComparison}><X size={14} /></button></div>}
    </>}{comparisonOpen && <Comparison onClose={() => setComparisonOpen(false)} />}
  </>;
}
