import { CheckIcon, TranslateIcon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import type { LangTag, ReviewMark } from '../../core/model';
import { confirmReview, reviewMarkAt, samePlace } from '../../core/review';
import { useStore } from '../../state/store';
import { t } from '../../strings';
import { Button } from '../components/controls';
import { translateMissing, useTranslationState } from '../lib/translate';
import { hasTranslator } from '../lib/translator';
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

/** After a suggested text that needs review: who suggested it, and Confirm, which clears the mark as one undo step. */
function ReviewMarker({ mark, label }: { mark: ReviewMark; label: string }) {
  const update = useStore((state) => state.update);
  const confirm = () =>
    update((draft) => void confirmReview(draft, (other) => other.lang === mark.lang && samePlace(other.place, mark.place)));
  return (
    <span className="lang-row__review">
      <span className="review-tag" title={t.review.tagTitle[mark.source]}>
        {t.review.tag[mark.source]}
      </span>
      <Button size="small" className="review-confirm" aria-label={t.review.confirmText(label, mark.lang)} onClick={confirm}>
        <CheckIcon size={12} /> {t.review.confirm}
      </Button>
    </span>
  );
}

/**
 * On an empty row, at the end of its input: fills it with the browser's translation from the editing language,
 * marked for review. Typing hides it, as the row is then no longer empty.
 */
function SuggestTranslation({ row, lang, label }: { row: TranslationRow; lang: LangTag; label: string }) {
  const editLang = useStore((state) => state.editLang);
  // One translation at a time.
  const running = useTranslationState((state) => state.running);
  return (
    <Button
      size="small"
      className="lang-row__suggest"
      disabled={running}
      aria-label={t.translate.suggestText(label, lang, editLang)}
      title={t.translate.suggestFrom(editLang)}
      onClick={() => void translateMissing({ place: row.place, lang })}
    >
      <TranslateIcon size={12} /> <span className="lang-row__suggest-label">{t.translate.suggestFrom(editLang)}</span>
    </Button>
  );
}

/**
 * One translatable text in the form: a row per language, the editing language first and marked, each with its
 * language code and, for an I14Y-linked attribute, a reset to I14Y's text. A suggested text that needs review
 * has a dashed frame, a tag saying who suggested it and Confirm. Where the browser translates on the device, an
 * empty row offers a translation from the editing language. With one language, only the input, unless it has a
 * reset or a review mark.
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

  const markOf = (lang: LangTag) => reviewMarkAt(project, row.place, lang);
  const reviewMarker = (mark: ReviewMark | undefined) => mark && <ReviewMarker mark={mark} label={label} />;
  // Only from a text in the editing language, into an empty one.
  const canSuggest = hasTranslator() && row.get(project, editLang).trim() !== '';
  const suggest = (lang: LangTag) =>
    canSuggest && lang !== editLang && row.get(project, lang) === '' && <SuggestTranslation row={row} lang={lang} label={label} />;

  const reset = (lang: LangTag) => (
    <I14yReset current={row.get(project, lang)} i14yText={row.i14y?.(project, lang)} onReset={(text) => update((draft) => row.set(draft, lang, text))} />
  );

  if (languages.length <= 1) {
    const mark = markOf(editLang);
    if (!row.i14y && !mark) return input(props(editLang));
    return (
      <div className="lang-row lang-row--single" data-review={mark?.source}>
        <div className="lang-row__input">{input(props(editLang))}</div>
        {reset(editLang)}
        {reviewMarker(mark)}
      </div>
    );
  }
  return (
    <div className="lang-rows">
      {editingFirst(languages, editLang).map((lang) => {
        const mark = markOf(lang);
        return (
          <div key={lang} className="lang-row" data-editing={lang === editLang || undefined} data-review={mark?.source}>
            <code className="lang-row__code">{lang}</code>
            <div className="lang-row__input">
              {input(props(lang))}
              {suggest(lang)}
            </div>
            {reset(lang)}
            {reviewMarker(mark)}
          </div>
        );
      })}
    </div>
  );
}
