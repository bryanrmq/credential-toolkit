import { t } from '../../strings';

/** What is being edited (kind and language), its name, and for attributes and groups the technical key. */
export function InspectorHeader({ kind, lang, title, technicalKey }: { kind: string; lang: string; title: string; technicalKey?: string }) {
  return (
    <header className="inspector__header">
      <p className="inspector__eyebrow">
        {kind}
        <span aria-hidden="true">·</span>
        {t.inspector.editing}
        <span className="tag-mono">{lang}</span>
      </p>
      <div className="inspector__heading">
        <h1 className="inspector__title">{title}</h1>
        {technicalKey && technicalKey !== title && <code className="tag-mono">{technicalKey}</code>}
      </div>
    </header>
  );
}
