import { ArrowDownIcon, ArrowUpIcon, TrashIcon } from '@phosphor-icons/react';
import { Fragment, useState } from 'react';
import { LANGUAGE_NAMES, isValidLanguageTag } from '../../core/langs';
import { addLanguage, moveLanguage, removeLanguage } from '../../core/operations';
import { useStore } from '../../state/store';
import { t } from '../../strings';
import { Badge, Button, Dialog, InlineIssueFixes } from '../components/controls';
import { useFieldIssues } from '../issues';

export function LanguagesDialog() {
  const project = useStore((state) => state.project)!;
  const { update, setLanguagesOpen } = useStore.getState();
  const [tag, setTag] = useState('');
  const issues = useFieldIssues('field-languages');
  const missingDefaults = Object.keys(LANGUAGE_NAMES).filter((lang) => !project.languages.includes(lang));
  const error = tag === '' ? null : !isValidLanguageTag(tag) ? t.languagesDialog.invalid : project.languages.includes(tag) ? t.languagesDialog.exists : null;
  const close = () => setLanguagesOpen(false);

  return (
    <Dialog title={t.languagesDialog.title} intro={t.languagesDialog.intro} onClose={close}>
      <ul className="language-list" id="field-languages" tabIndex={-1}>
        {project.languages.map((lang, index) => (
          <li key={lang}>
            <span className="grow">
              {LANGUAGE_NAMES[lang] ?? lang} <code>{lang}</code> {index === 0 && <Badge tone="gray">{t.languagesDialog.first}</Badge>}
            </span>
            <Button size="icon" variant="ghost" aria-label={t.languagesDialog.moveUp} disabled={index === 0} onClick={() => update((draft) => moveLanguage(draft, lang, index - 1))}>
              <ArrowUpIcon />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t.languagesDialog.moveDown}
              disabled={index === project.languages.length - 1}
              onClick={() => update((draft) => moveLanguage(draft, lang, index + 1))}
            >
              <ArrowDownIcon />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="btn--danger-hover"
              aria-label={`${t.languagesDialog.remove} ${lang}`}
              disabled={project.languages.length === 1}
              onClick={() => window.confirm(t.languagesDialog.confirmRemove(lang)) && update((draft) => removeLanguage(draft, lang))}
            >
              <TrashIcon />
            </Button>
          </li>
        ))}
      </ul>
      {issues.map((issue, index) => (
        <Fragment key={index}>
          <p className={`field__issue field__issue--${issue.severity}`}>{issue.message}</p>
          <InlineIssueFixes issue={issue} />
        </Fragment>
      ))}
      {missingDefaults.length > 0 && (
        <div className="row row--wrap language-defaults">
          {missingDefaults.map((lang) => (
            <Button key={lang} size="small" onClick={() => update((draft) => addLanguage(draft, lang))}>
              + {LANGUAGE_NAMES[lang]} <code>{lang}</code>
            </Button>
          ))}
        </div>
      )}
      <form
        className="row"
        onSubmit={(event) => {
          event.preventDefault();
          if (error || tag === '') return;
          update((draft) => addLanguage(draft, tag));
          setTag('');
        }}
      >
        <input
          className="input input--mono"
          aria-label={t.languagesDialog.custom}
          placeholder={t.languagesDialog.custom}
          value={tag}
          aria-invalid={!!error}
          onChange={(event) => setTag(event.target.value)}
        />
        <Button type="submit" disabled={!!error || tag === ''}>
          {t.languagesDialog.add}
        </Button>
      </form>
      {error && <p className="error-text">{error}</p>}
      <div className="dialog__actions">
        <Button variant="primary" onClick={close}>
          {t.languagesDialog.done}
        </Button>
      </div>
    </Dialog>
  );
}
