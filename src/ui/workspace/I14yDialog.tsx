import { useEffect, useState } from 'react';
import { type I14yHit, addConcepts, i14yLanguage, textIn } from '../../core/import/i14y';
import type { ReportNote } from '../../core/import/report';
import { useStore } from '../../state/store';
import { t } from '../../strings';
import { Badge, Button, Dialog } from '../components/controls';
import { fetchConcept, searchConcepts, statusLabel, statusTone } from '../lib/i14y';

const SEARCH_DELAY_MS = 300;

type SearchState = { kind: 'idle' } | { kind: 'searching' } | { kind: 'done'; hits: I14yHit[] } | { kind: 'failed' };

/** Searches I14Y and adds the picked concepts as attributes at the end of the group `groupId`. */
export function I14yDialog({ groupId, onAdded, onClose }: { groupId: string; onAdded: (nodeIds: string[]) => void; onClose: () => void }) {
  const editLang = useStore((state) => state.editLang);
  const { update, setReport } = useStore.getState();
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<SearchState>({ kind: 'idle' });
  const [picked, setPicked] = useState<I14yHit[]>([]);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = query.trim();
  const shown: SearchState = trimmed.length < 2 ? { kind: 'idle' } : search;

  useEffect(() => {
    if (trimmed.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearch({ kind: 'searching' });
      searchConcepts(trimmed, i14yLanguage(editLang) ?? 'de', controller.signal)
        .then((hits) => setSearch({ kind: 'done', hits }))
        .catch(() => !controller.signal.aborted && setSearch({ kind: 'failed' }));
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, editLang]);

  const toggle = (hit: I14yHit, checked: boolean) =>
    setPicked((current) => (checked ? [...current, hit] : current.filter((existing) => existing.id !== hit.id)));

  const submit = async () => {
    if (picked.length === 0) return;
    setError(null);
    setAdding(true);
    try {
      const concepts = await Promise.all(picked.map((hit) => fetchConcept(hit.id)));
      let added: { nodeIds: string[]; report: ReportNote[] } = { nodeIds: [], report: [] };
      update((draft) => {
        const { nodes, report } = addConcepts(draft, groupId, concepts);
        added = { nodeIds: nodes.map((node) => node.id), report };
      });
      setReport(added.report);
      onAdded(added.nodeIds);
      onClose();
    } catch {
      setError(t.i14y.unreachable);
      setAdding(false);
    }
  };

  return (
    <Dialog title={t.i14y.title} intro={t.i14y.intro} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="field">
          <label className="field__label" htmlFor="i14y-search">
            {t.i14y.search}
          </label>
          <input
            id="i14y-search"
            className="input"
            type="search"
            autoFocus
            autoComplete="off"
            placeholder={t.i14y.placeholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && event.preventDefault()}
          />
          <p className="field__hint">{t.i14y.privacy}</p>
        </div>
        <div className="i14y-results" aria-live="polite" aria-busy={shown.kind === 'searching'}>
          {shown.kind === 'searching' && <p className="field__hint">{t.i14y.searching}</p>}
          {shown.kind === 'failed' && (
            <p className="error-text" role="alert">
              {t.i14y.unreachable}
            </p>
          )}
          {shown.kind === 'done' && shown.hits.length === 0 && <p className="field__hint">{t.i14y.noResults}</p>}
          {shown.kind === 'done' && shown.hits.length > 0 && (
            <ul className="i14y-results__list">
              {shown.hits.map((hit) => (
                <li key={hit.id}>
                  <label className="i14y-hit">
                    <input
                      type="checkbox"
                      aria-label={`${textIn(hit.name, editLang) || hit.identifier} (${hit.identifier})`}
                      checked={picked.some((existing) => existing.id === hit.id)}
                      onChange={(event) => toggle(hit, event.target.checked)}
                    />
                    <span className="i14y-hit__body">
                      <span className="i14y-hit__name">{textIn(hit.name, editLang) || hit.identifier}</span>
                      <span className="i14y-hit__meta">
                        <span className="mono">{hit.identifier}</span>
                        <span>{t.i14y.types[hit.conceptType]}</span>
                        <Badge tone={statusTone(hit.registrationStatus)}>{statusLabel(hit.registrationStatus)}</Badge>
                      </span>
                      <span className="i14y-hit__publisher">{textIn(hit.publisher, editLang)}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <div className="dialog__actions">
          {picked.length > 0 && <span className="field__hint i14y-selected">{t.i14y.selected(picked.length)}</span>}
          <Button variant="ghost" onClick={onClose}>
            {t.i14y.cancel}
          </Button>
          <Button variant="primary" type="submit" disabled={adding || picked.length === 0}>
            {t.i14y.add(picked.length)}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
