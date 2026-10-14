import { PlusIcon, XIcon } from '@phosphor-icons/react';
import type { AttributeNode, Node } from '../../core/model';
import { useStore } from '../../state/store';
import { t } from '../../strings';
import { Button, Field, Toggle } from '../components/controls';

/** Codes and their labels in the current language (Entry Code + Entry overlays). */
export function EntriesEditor({ node, edit, id }: { node: AttributeNode; edit: (recipe: (draft: Node) => void) => void; id: string }) {
  const lang = useStore((state) => state.editLang);
  const entries = node.entries;
  const change = (recipe: (draft: AttributeNode) => void) => edit((draft) => draft.kind === 'attribute' && recipe(draft));

  return (
    <Field id={id} label={t.inspector.valueTranslations} hint={t.inspector.valueTranslationsHint}>
      <Toggle
        id={entries ? undefined : id}
        checked={!!entries}
        label={t.inspector.valueTranslations}
        onChange={(checked) =>
          change((draft) => {
            if (!checked) delete draft.entries;
            else draft.entries = { codes: draft.type === 'Boolean' ? ['true', 'false'] : [''], labels: {} };
          })
        }
      />
      {entries && (
        <table className="entries">
          <tbody>
            {entries.codes.map((code, index) => (
              <tr key={index}>
                <td>
                  <input
                    id={index === 0 ? id : undefined}
                    className="input input--mono"
                    aria-label={t.inspector.code}
                    value={code}
                    onChange={(event) =>
                      change((draft) => {
                        const old = draft.entries!.codes[index];
                        draft.entries!.codes[index] = event.target.value;
                        for (const labels of Object.values(draft.entries!.labels)) {
                          if (old in labels) {
                            labels[event.target.value] = labels[old];
                            delete labels[old];
                          }
                        }
                      })
                    }
                  />
                </td>
                <td>
                  <input
                    className="input"
                    aria-label={`${code} (${lang})`}
                    value={entries.labels[lang]?.[code] ?? ''}
                    onChange={(event) =>
                      change((draft) => {
                        draft.entries!.labels[lang] = { ...(draft.entries!.labels[lang] ?? {}), [code]: event.target.value };
                      })
                    }
                  />
                </td>
                <td style={{ width: 32 }}>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove ${code}`}
                    onClick={() =>
                      change((draft) => {
                        draft.entries!.codes.splice(index, 1);
                        for (const labels of Object.values(draft.entries!.labels)) delete labels[code];
                      })
                    }
                  >
                    <XIcon />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {entries && (
        <div>
          <Button size="small" variant="ghost" onClick={() => change((draft) => void draft.entries!.codes.push(''))}>
            <PlusIcon /> {t.inspector.addCode}
          </Button>
        </div>
      )}
    </Field>
  );
}
