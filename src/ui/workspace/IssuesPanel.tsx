import { CaretDownIcon, CaretUpIcon, CheckCircleIcon, WarningCircleIcon, WarningIcon, WrenchIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import type { Issue } from '../../core/validate';
import { useStore } from '../../state/store';
import { t } from '../../strings';
import { Badge, Button, IssueFixes } from '../components/controls';
import { fixAllGroups, goToIssue, groupIssues, issueLocation, useIssues } from '../issues';

const BODY_ID = 'issues-panel-body';

/**
 * The issue list along the bottom of the workspace, under every pane. The header always shows; collapsing it
 * gives the panes the space back. `onJump` runs after a click took the user to an issue's field.
 */
export function IssuesPanel({ onJump }: { onJump?: (issue: Issue) => void }) {
  const project = useStore((state) => state.project)!;
  const fixing = useStore((state) => state.fixing);
  const applyFixes = useStore((state) => state.applyFixes);
  const groups = groupIssues(useIssues());
  const errors = groups.filter((group) => group.severity === 'error').length;
  const warnings = groups.length - errors;
  const fixAll = fixAllGroups(groups, project);
  const [open, setOpen] = useState(true);
  const jump = (issue: Issue) => {
    goToIssue(issue);
    onJump?.(issue);
  };

  return (
    <section className="issues-panel" aria-label={t.issues.title}>
      <div className="issues-panel__header">
        <div className="issues-panel__lead">
          <span className="pane__title">{t.issues.title}</span>
          {groups.length === 0 && <Badge tone="green">{t.issues.none}</Badge>}
          {errors > 0 && <Badge tone="red">{t.workspace.errorCount(errors)}</Badge>}
          {warnings > 0 && <Badge tone="yellow">{t.workspace.warningCount(warnings)}</Badge>}
        </div>
        <div className="issues-panel__actions">
          {fixAll.length > 0 && (
            <Button variant="ghost" size="small" disabled={fixing} onClick={() => void applyFixes(fixAll)}>
              <WrenchIcon /> {t.fixes.fixAll(fixAll.length)}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="issues-panel__toggle"
            aria-label={open ? t.issues.collapse : t.issues.expand}
            title={open ? t.issues.collapse : t.issues.expand}
            aria-expanded={open}
            aria-controls={BODY_ID}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <CaretDownIcon size={14} /> : <CaretUpIcon size={14} />}
          </Button>
        </div>
      </div>
      {open && (
        <div className="issues-panel__body" id={BODY_ID}>
          {groups.length === 0 ? (
            <p className="empty-state">
              <CheckCircleIcon size={20} style={{ color: 'var(--green-text)' }} />
              <br />
              {t.issues.empty}
            </p>
          ) : (
            <ul className="issues">
              {groups.map((group, index) => (
                // The whole row jumps to the field; the summary button makes that reachable by keyboard, and the
                // chips and fix buttons stop the click so they do their own thing.
                <li key={index} onClick={() => jump(group.issues[0])}>
                  {group.severity === 'error' ? (
                    <WarningCircleIcon size={14} className="issue-icon--error" />
                  ) : (
                    <WarningIcon size={14} className="issue-icon--warning" />
                  )}
                  <button type="button" className="issues__summary">
                    {group.summary}
                  </button>
                  {group.langs.length > 0 && (
                    <span className="issues__langs" onClick={(event) => event.stopPropagation()}>
                      {group.langs.map((lang) => (
                        <button
                          key={lang}
                          type="button"
                          className="chip"
                          onClick={() => jump(group.issues.find((issue) => 'lang' in issue.target && issue.target.lang === lang)!)}
                        >
                          {lang}
                        </button>
                      ))}
                    </span>
                  )}
                  <span className="issues__location">{issueLocation(group.issues[0], project)}</span>
                  <span className="issues__fixes" onClick={(event) => event.stopPropagation()}>
                    <IssueFixes group={group} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
