import { useLayoutEffect, useRef } from 'react';
import { useStore } from '../../state/store';
import { t } from '../../strings';
import { I14yReset } from './I14yLink';
import { allRows } from './translationRows';

const fieldSizing = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('field-sizing', 'content');

/**
 * A translation cell: a textarea that wraps its one line of text and grows with it, so no cell clips it. CSS `field-sizing: content`
 * sizes it where supported; elsewhere its height follows its scroll height.
 */
function CellText({ value, ariaLabel, onChange }: { value: string; ariaLabel: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const area = ref.current;
    if (fieldSizing || !area) return;
    area.style.height = 'auto';
    area.style.height = `${area.scrollHeight + area.offsetHeight - area.clientHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      className="input translations__text"
      rows={1}
      aria-label={ariaLabel}
      data-empty={value === ''}
      value={value}
      // The texts are single lines: the textarea only wraps them.
      onKeyDown={(event) => event.key === 'Enter' && event.preventDefault()}
      onChange={(event) => onChange(event.target.value.replace(/[\r\n]+/g, ' '))}
    />
  );
}

/**
 * Every translatable text in every language, one row each. The first column stays in view while the table scrolls
 * sideways; the top bar's editing-language switch does nothing here, so it is disabled.
 */
export function TranslationsView() {
  const project = useStore((state) => state.project)!;
  const update = useStore((state) => state.update);
  const rows = allRows(project);
  return (
    <div className="translations" data-tour="translations">
      <table>
        <thead>
          <tr>
            <th scope="col">{t.translations.text}</th>
            {project.languages.map((lang) => (
              <th scope="col" key={lang}>
                {lang}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                {row.path && <code>{row.path} </code>}
                <span className={row.path ? 'field__hint' : undefined}>{row.label}</span>
              </td>
              {project.languages.map((lang) => {
                const value = row.get(project, lang);
                return (
                  <td key={lang}>
                    <div className="translations__cell">
                      <CellText
                        ariaLabel={`${row.path ? `${row.path} ` : ''}${row.label} (${lang})`}
                        value={value}
                        onChange={(text) => update((draft) => row.set(draft, lang, text))}
                      />
                      <I14yReset current={value} i14yText={row.i14y?.(project, lang)} onReset={(text) => update((draft) => row.set(draft, lang, text))} />
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
