import { Button } from '@olimp/ui';

export function CatalogPagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, index) => start + index);
  return <nav className="pagination" aria-label="Страницы каталога">
    <div className="pagination__numbers">{pages.map(number => <Button key={number} variant={number === page ? 'primary' : 'secondary'} aria-label={`Страница ${number}`} aria-current={number === page ? 'page' : undefined} onClick={() => { if (number !== page) onChange(number); }}>{number}</Button>)}</div>
    <div className="pagination__controls">
      <Button variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>Назад</Button>
      <label className="pagination__jump"><span className="sr-only">Перейти на страницу</span><select aria-label="Перейти на страницу" value={page} onChange={event => onChange(Number(event.target.value))}>{Array.from({ length: totalPages }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1} из {totalPages}</option>)}</select></label>
      <Button variant="secondary" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Далее</Button>
    </div>
  </nav>;
}
