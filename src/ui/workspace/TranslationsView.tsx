import { type Group, type LangTag, type Project, findNode } from '../../core/model';
import { useStore } from '../../state/store';
import { t } from '../../strings';

interface Row {
  id: string;
  path?: string;
  label: string;
  get: (project: Project, lang: LangTag) => string;
  set: (draft: Project, lang: LangTag, value: string) => void;
}

function metaRow(field: 'name' | 'description', label: string): Row {
  return {
    id: `meta-${field}`,
    label,
    get: (project, lang) => project.meta[lang]?.[field] ?? '',
    set: (draft, lang, value) => void (draft.meta[lang] = { ...(draft.meta[lang] ?? { name: '', description: '' }), [field]: value }),
  };
}

/** Every translatable string: credential name and description, labels, headlines and value translations. */
function rowsFor(project: Project): Row[] {
  const rows: Row[] = [metaRow('name', t.translations.name), metaRow('description', t.translations.description)];
  const visit = (group: Group, prefix: string) => {
    for (const node of group.children) {
      const path = prefix ? `${prefix}.${node.key}` : node.key;
      const nodeId = node.id;
      rows.push({
        id: `${nodeId}-label`,
        path,
        label: node.kind === 'group' ? t.translations.headline : t.translations.label,
        get: (p, lang) => findNode(p.root, nodeId)?.node.labels[lang] ?? '',
        set: (draft, lang, value) => {
          const target = findNode(draft.root, nodeId)?.node;
          if (!target) return;
          if (value) target.labels[lang] = value;
          else delete target.labels[lang];
        },
      });
      if (node.kind === 'attribute' && node.entries) {
        for (const code of node.entries.codes) {
          rows.push({
            id: `${nodeId}-entry-${code}`,
            path,
            label: t.translations.value(code),
            get: (p, lang) => {
              const target = findNode(p.root, nodeId)?.node;
              return target?.kind === 'attribute' ? (target.entries?.labels[lang]?.[code] ?? '') : '';
            },
            set: (draft, lang, value) => {
              const target = findNode(draft.root, nodeId)?.node;
              if (target?.kind !== 'attribute' || !target.entries) return;
              target.entries.labels[lang] = { ...(target.entries.labels[lang] ?? {}), [code]: value };
            },
          });
        }
      }
      if (node.kind === 'group') visit(node.group, path);
    }
  };
  visit(project.root, '');
  return rows;
}

export function TranslationsView() {
  const project = useStore((state) => state.project)!;
  const update = useStore((state) => state.update);
  const rows = rowsFor(project);
  return (
    <div className="translations">
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
