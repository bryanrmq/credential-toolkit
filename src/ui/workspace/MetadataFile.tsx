import type { ReactNode } from 'react';
import type { MetadataPlaceholder } from '../../core/export/issuerMetadata';
import { t } from '../../strings';
import { Badge, Button } from '../components/controls';
import { useIssues } from '../issues';
import { CopyButton } from './CopyButton';
import { OutputFileHeader } from './OutputFileHeader';

/** `text` with every placeholder in `placeholders` wrapped in a yellow mark. */
function highlighted(text: string, placeholders: MetadataPlaceholder[]): ReactNode[] {
  if (placeholders.length === 0) return [text];
  const pattern = new RegExp(`(${placeholders.map(({ text: placeholder }) => placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`);
  // With one capture group, `split` puts the matches at the odd indexes.
  return text.split(pattern).map((part, index) =>
    index % 2 === 1 ? (
      <mark key={index} className="placeholder">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

/**
 * A generated metadata file, `vct.json` or `issuer_metadata.json`: the file header every output shares, the
 * placeholders the issuer still has to replace (or "Ready" when none are left), the text with those placeholders marked
 * and, while the `vct_metadata_uri#integrity` is missing, the command that computes it, with a button (`onIssuerUrl`)
 * to the Issuer URL field that lets the tool compute it instead. `text` and `placeholders` are what the core gives
 * (`buildTypeMetadata`, `buildIssuerMetadata`, `filePlaceholders`), shown and downloaded unchanged.
 * The download is blocked while the project has errors, issuer ones included: the file would carry them.
 */
export function MetadataFile({
  fileName,
  text,
  placeholders,
  onIssuerUrl,
}: {
  fileName: string;
  text: string;
  placeholders: MetadataPlaceholder[];
  onIssuerUrl: () => void;
}) {
  const errors = useIssues().filter((issue) => issue.severity === 'error');
  const integrity = placeholders.find((placeholder) => placeholder.integrity && placeholder.command);

  return (
    <div className="metadata-file">
      <OutputFileHeader fileName={fileName} text={text} blocking={errors.length} />

      {placeholders.length > 0 ? (
        <section className="metadata-file__placeholders" aria-label={t.output.file.replaceBeforeUse}>
          <h3 className="metadata-file__heading">
            {t.output.file.replaceBeforeUse} <Badge tone="yellow">{placeholders.length}</Badge>
          </h3>
          <ul className="placeholder-list">
            {placeholders.map((placeholder) => (
              <li key={placeholder.text} className="placeholder-list__row">
                <code className="placeholder">{placeholder.text}</code>
                <span className="placeholder-list__why">{placeholder.explanation}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="metadata-file__ready" title={t.output.file.readyTitle}>
          <Badge tone="green">{t.output.file.ready}</Badge>
        </p>
      )}

      {integrity?.command && (
        <section className="metadata-file__integrity" aria-label={t.output.file.integrityTitle}>
          <h3 className="metadata-file__heading">{t.output.file.integrityTitle}</h3>
          <p className="field__hint">
            {t.output.file.integrityHint(integrity.text)} {t.output.file.computeIntegrity.before}
            <Button variant="link" onClick={onIssuerUrl}>
              {t.metadata.url}
            </Button>
            {t.output.file.computeIntegrity.after}
          </p>
          <div className="integrity__value">
            <code>{integrity.command}</code>
            <CopyButton text={integrity.command} label={t.output.file.copyCommand} iconOnly />
          </div>
        </section>
      )}

      <pre className="code-block">{highlighted(text, placeholders)}</pre>
    </div>
  );
}
