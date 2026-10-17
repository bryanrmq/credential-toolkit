import { useStore } from '../../state/store';
import { t } from '../../strings';
import { allRows } from './translationRows';

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
                    <input
                      className="input"
                      aria-label={`${row.path ? `${row.path} ` : ''}${row.label} (${lang})`}
                      data-empty={value === ''}
                      value={value}
                      onChange={(event) => update((draft) => row.set(draft, lang, event.target.value))}
                    />
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
