import type { ReactNode } from 'react';
import type { LangTag } from '../../core/model';
import { useStore } from '../../state/store';
import { I14yReset } from './I14yLink';
import { type TranslationRow, editingFirst } from './translationRows';

/** What the input of one language row gets. */
export interface LanguageInput {
  /** The field id for the editing language, so issue and change jumps land on it; a derived id for the others. */
  id: string;
  lang: LangTag;
  /** Set for the rows the field's `<label>` does not name, that is every language but the editing one. */
  ariaLabel?: string;
  value: string;
  /** Whether the text is empty in a project with several languages, so it is highlighted. */
  empty: boolean;
  onChange: (value: string) => void;
}

/**
 * One translatable text in the form: a row per language, the editing language first and marked, each with its
 * language code and, for an I14Y-linked attribute, a reset to I14Y's text. With one language, only the input.
 */
export function LanguageRows({
  id,
  label,
  row,
  langs,
  input,
}: {
  id: string;
  /** Names the other languages' inputs, as `label (lang)`. */
  label: string;
  row: TranslationRow;
  /** The languages to list; the project's by default. */
  langs?: LangTag[];
  input: (props: LanguageInput) => ReactNode;
}) {
  const project = useStore((state) => state.project)!;
  const editLang = useStore((state) => state.editLang);
  const update = useStore((state) => state.update);
  const languages = langs ?? project.languages;
  const props = (lang: LangTag): LanguageInput => {
    const value = row.get(project, lang);
    return {
      id: lang === editLang ? id : `${id}--${lang}`,
      lang,
      ariaLabel: lang === editLang ? undefined : `${label} (${lang})`,
      value,
      empty: languages.length > 1 && value === '',
      onChange: (text) => update((draft) => row.set(draft, lang, text)),
    };
  };

  const reset = (lang: LangTag) => (
    <I14yReset current={row.get(project, lang)} i14yText={row.i14y?.(project, lang)} onReset={(text) => update((draft) => row.set(draft, lang, text))} />
  );

  if (languages.length <= 1) {
    if (!row.i14y) return input(props(editLang));
    return (
      <div className="lang-row lang-row--single">
        <div className="lang-row__input">{input(props(editLang))}</div>
        {reset(editLang)}
      </div>
    );
  }
  return (
    <div className="lang-rows">
      {editingFirst(languages, editLang).map((lang) => (
        <div key={lang} className="lang-row" data-editing={lang === editLang || undefined}>
          <code className="lang-row__code">{lang}</code>
          <div className="lang-row__input">{input(props(lang))}</div>
          {reset(lang)}
        </div>
      ))}
    </div>
  );
}
