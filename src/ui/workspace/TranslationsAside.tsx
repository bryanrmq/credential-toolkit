import { useStore } from '../../state/store';
import { t } from '../../strings';
import { I14yReset } from './I14yLink';
import type { TranslationRow } from './translationRows';

/**
 * The selected item's texts in every language, next to the form (below it in a narrow pane).
 * A language chip switches the form to that language.
 */
export function TranslationsAside({ rows }: { rows: TranslationRow[] }) {
  const project = useStore((state) => state.project)!;
  const editLang = useStore((state) => state.editLang);
  const { update, setEditLang } = useStore.getState();

  return (
    <aside className="translations-aside" aria-label={t.inspector.translationsTitle}>
      <h2 className="translations-aside__title">{t.inspector.translationsTitle}</h2>
      <p className="field__hint">{t.inspector.translationsHint}</p>
      {rows.map((row) => (
        <div key={row.id} className="translations-aside__group">
          <span className="field__label">{row.label}</span>
          {project.languages.map((lang) => {
            const value = row.get(project, lang);
            return (
              <div key={lang} className="translations-aside__row">
                <button
                  type="button"
                  className="chip"
                  aria-pressed={lang === editLang}
                  title={t.inspector.switchLanguage(lang)}
                  onClick={() => setEditLang(lang)}
                >
                  {lang}
                </button>
                <input
                  className="input"
                  aria-label={`${row.label} (${lang})`}
                  data-empty={value === ''}
                  value={value}
                  onChange={(event) => update((draft) => row.set(draft, lang, event.target.value))}
                />
                <I14yReset current={value} i14yText={row.i14y?.(project, lang)} onReset={(text) => update((draft) => row.set(draft, lang, text))} />
              </div>
            );
          })}
        </div>
      ))}
    </aside>
  );
}
