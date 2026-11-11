import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchTools } from '@/registry';

type Props = { open: boolean; onClose: () => void };

/** Native dialog with a combobox input and a listbox. Results come from the registry search. */
export function CommandSearch({ open, onClose }: Props) {
  const dlg = useRef<HTMLDialogElement>(null);
  const navigate = useNavigate();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const results = useMemo(() => searchTools(query), [query]);
  const idx = Math.min(active, Math.max(results.length - 1, 0));
  const current = results[idx];

  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (open && !d.open) {
      setQuery('');
      setActive(0);
      d.showModal();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  const pick = (id: string) => {
    dlg.current?.close(); // restores focus to the opener first; the route change then moves focus to main
    navigate(`/tools/${id}`);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const n = results.length;
    if (e.key === 'ArrowDown' && n) {
      e.preventDefault();
      setActive((i) => (i + 1) % n);
    } else if (e.key === 'ArrowUp' && n) {
      e.preventDefault();
      setActive((i) => (i - 1 + n) % n);
    } else if (e.key === 'Enter' && current) {
      e.preventDefault();
      pick(current.id);
    }
  };

  return (
    <dialog ref={dlg} className="cmd" aria-label="Search tools" onClose={onClose}>
      <div className="cmd__inner">
        <input
          type="text"
          className="cmd__input"
          role="combobox"
          aria-label="Search tools"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={current ? `${listId}-${current.id}` : undefined}
          placeholder="Search by task, e.g. shrink or pdf"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        <ul id={listId} role="listbox" aria-label="Matching tools" className="cmd__list">
          {results.map((t, i) => (
            <li
              key={t.id}
              id={`${listId}-${t.id}`}
              role="option"
              aria-selected={i === idx}
              className="cmd__opt"
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(t.id)}
            >
              <t.icon aria-hidden="true" />
              <span className="cmd__name">{t.name}</span>
              <span className="cmd__desc">{t.description}</span>
            </li>
          ))}
        </ul>
        {results.length === 0 && <p className="cmd__empty">No tool matches. Try a task, such as “shrink” or “pdf”.</p>}
      </div>
    </dialog>
  );
}
