import { CheckCircleIcon, WarningIcon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import type { Baseline } from '../../core/baseline';
import type { ProjectChange } from '../../core/compare';
import { t } from '../../strings';
import { type ChangesState, canGoToChange, changeRow, goToChange, groupChanges } from '../lib/changes';
import { fullDateTime } from '../lib/relativeTime';
import { LoadBaselineButton } from './LoadBaselineButton';

/**
 * The Output pane's Changes tab: what changed since the published baseline, and the `#integrity` warning.
 * `current` is the current output's `#integrity`, once the bundle is built; `copy` renders its copy button.
 * `onJump` runs after a click took the user to a change's field.
 */
export function ChangesView({
  baseline,
  state,
  current,
  copy,
  onJump,
}: {
  baseline: Baseline | null;
  state: ChangesState;
  current: string | null;
  copy: ReactNode;
  onJump?: (change: ProjectChange) => void;
}) {
  if (!baseline || state.status === 'none') {
    return (
      <div className="changes">
        <p className="changes__prompt">{t.changes.noBaseline}</p>
        <LoadBaselineButton />
      </div>
    );
  }
  if (state.status === 'working') return <p className="field__hint">{t.output.working}</p>;

  const integrityChanged = current !== null && current !== state.integrity;
  const jump = (change: ProjectChange) => {
    goToChange(change);
    onJump?.(change);
  };

  return (
    <div className="changes">
      {state.changes.length === 0 && !integrityChanged ? (
        <p className="changes__none">
          <CheckCircleIcon size={16} />
          {t.changes.none}
        </p>
      ) : (
        <>
          {integrityChanged && (
            <p className="changes__warning" role="status">
              <WarningIcon size={16} />
              <span>{t.changes.integrityChanged}</span>
            </p>
          )}
          <dl className="changes__integrity">
            <div className="changes__integrity-row changes__integrity-row--published">
              <dt>{t.changes.published}</dt>
              <dd>
                <code>{state.integrity}</code>
              </dd>
            </div>
            {current !== null && (
              <div className="changes__integrity-row changes__integrity-row--current">
                <dt>{t.changes.current}</dt>
                <dd>
                  <code>{current}</code>
                  {copy}
                </dd>
              </div>
            )}
          </dl>
          {groupChanges(state.changes).map((group) => (
            <section key={group.section} aria-label={t.changes.sections[group.section]}>
              <h3 className="changes__heading">{t.changes.sections[group.section]}</h3>
              <ul className="changes__list">
                {group.changes.map((change, index) => (
                  <ChangeRow key={index} change={change} onJump={jump} />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
      <div className="changes__footer">
        <span>{t.changes.compared(t.changes.sources[baseline.source], fullDateTime(baseline.setAt))}</span>
        <LoadBaselineButton variant="ghost" />
      </div>
    </div>
  );
}

function ChangeRow({ change, onJump }: { change: ProjectChange; onJump: (change: ProjectChange) => void }) {
  const { subject, detail } = changeRow(change);
  const linked = canGoToChange(change);
  const tag = <span className={`change-tag change-tag--${change.tag}`}>{t.changes.tags[change.tag]}</span>;
  return (
    // The whole row jumps to the field; the subject button makes that reachable by keyboard.
    <li className={linked ? 'changes__row changes__row--link' : 'changes__row'} onClick={linked ? () => onJump(change) : undefined}>
      {tag}
      {linked ? (
        <button type="button" className="changes__subject">
          {subject}
        </button>
      ) : (
        <span className="changes__subject">{subject}</span>
      )}
      {detail && <span className="changes__detail">{detail}</span>}
    </li>
  );
}
