import { ArrowRightIcon } from '@phosphor-icons/react';
import { useRef } from 'react';
import { importBundle } from '../../core/import/bundle';
import { EXAMPLES, summariseBundle } from '../../examples/examples';
import { deleteDraft, selectResumeDraft, useDrafts } from '../../state/persistence';
import { useStore } from '../../state/store';
import { t } from '../../strings';
import { useReveal } from '../lib/reveal';

const ROWS = EXAMPLES.map((example) => ({ ...example, summary: summariseBundle(example.bundle) }));

/** Real bundles that open straight in the editor. Loaded lazily so the bundles stay out of the main chunk. */
export function Examples() {
  const load = useStore((state) => state.load);
  const ref = useRef<HTMLElement>(null);
  useReveal(ref);

  const open = async (bundle: unknown) => {
    const result = await importBundle(bundle);
    const replaced = selectResumeDraft(useDrafts.getState());
    if (replaced && !window.confirm(t.start.confirmReplaceDraft)) return;
    load(result.project, result.report, { reviewI14y: true });
    if (replaced) void deleteDraft(replaced.id);
  };

  return (
    <section className="examples" ref={ref} aria-labelledby="examples-title">
      <div className="reveal">
        <h2 id="examples-title" className="examples__title">
          {t.start.examples.title}
        </h2>
        <p className="examples__intro">{t.start.examples.intro}</p>
        <ul className="examples__list">
          {ROWS.map(({ id, bundle, summary }) => (
            <li key={id}>
              <button type="button" className="example" onClick={() => void open(bundle)}>
                <span className="example__thumbnail" style={{ background: summary.background }} aria-hidden="true">
                  {summary.logo && <img src={summary.logo} alt="" />}
                </span>
                <span className="example__text">
                  <span className="example__name">{t.start.examples.items[id].title}</span>
                  <span className="example__body">{t.start.examples.items[id].body}</span>
                  <span className="example__meta">
                    {t.start.examples.attributes(summary.attributeCount)} · {summary.languages.join(' ')}
                  </span>
                </span>
                <span className="btn btn--secondary btn--small example__action">
                  {t.start.examples.open} <ArrowRightIcon />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
