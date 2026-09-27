import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, Icon } from '@olimp/ui';

export function CatalogPagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, index) => start + index);
  return <nav className="pagination" aria-label="Страницы каталога">
    <div className="pagination__numbers">{pages.map(number => <Button key={number} variant={number === page ? 'primary' : 'secondary'} aria-label={`Страница ${number}`} aria-current={number === page ? 'page' : undefined} onClick={() => { if (number !== page) onChange(number); }}>{number}</Button>)}</div>
    <div className="pagination__controls">
      <Button variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>Назад</Button>
      <button type="button" className="pagination__jump" aria-haspopup="dialog" aria-label={`Страница ${page} из ${totalPages}. Выбрать страницу`} disabled={totalPages <= 1} onClick={() => setPickerOpen(true)}>
        <span>{page} из {totalPages}</span><Icon name="chevron-down" size={16} />
      </button>
      <Button variant="secondary" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Далее</Button>
    </div>
    {pickerOpen && <PagePicker page={page} totalPages={totalPages} onClose={() => setPickerOpen(false)}
      onChoose={number => { setPickerOpen(false); if (number !== page) onChange(number); }} />}
  </nav>;
}

/** Compact grid of all pages instead of a long native list: 32 pages fit into seven short rows. */
function PagePicker({ page, totalPages, onChoose, onClose }: { page: number; totalPages: number; onChoose: (page: number) => void; onClose: () => void }) {
  const current = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // After the dialog opens: keep the current page in view and focused for keyboard users.
    const frame = requestAnimationFrame(() => {
      current.current?.scrollIntoView({ block: 'nearest' });
      current.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return <Dialog title="Перейти на страницу" className="page-picker" onClose={onClose}>
    <div className="page-picker__grid">{Array.from({ length: totalPages }, (_, index) => index + 1).map(number =>
      <button key={number} ref={number === page ? current : undefined} type="button"
        className={`page-picker__page${number === page ? ' is-current' : ''}`} aria-current={number === page ? 'page' : undefined}
        aria-label={`Страница ${number}`} onClick={() => onChoose(number)}>{number}</button>)}
    </div>
  </Dialog>;
}
