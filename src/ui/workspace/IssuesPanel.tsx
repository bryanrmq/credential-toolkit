import { CaretDownIcon, CaretUpIcon, CheckCircleIcon, WarningCircleIcon, WarningIcon, WrenchIcon } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import type { Issue } from '../../core/validate';
import { useStore } from '../../state/store';
import { t } from '../../strings';
import { Badge, Button, IssueFixes } from '../components/controls';
import { PaneResizer } from '../components/PaneResizer';
import { fixAllGroups, goToIssue, groupIssues, issueLocation, useIssues } from '../issues';
import { DEFAULT_ISSUES_HEIGHT, ISSUES_HEIGHT_LIMITS, clampIssuesHeight, loadIssuesHeight, saveIssuesHeight } from '../lib/paneLayout';

const BODY_ID = 'issues-panel-body';

/**
 * The issue list along the bottom of the workspace, under every pane and under the Translations view. The header
 * always shows; collapsing it gives the panes the space back. While open, the top edge resizes the list, which
 * scrolls on its own; the height is remembered like the pane widths. On a narrow window the panel is not docked:
 * it is the Issues pane, filling the space with no handle and no collapse button.
 * `focusRequest` moves the focus to the list each time it changes (the top-bar buttons bump it), or to the first
 * error's summary with `focusFirstError` (the blocked Download);
 * `onJump` runs after a click took the user to an issue's field.
 */
export function IssuesPanel({
  open,
  onOpenChange,
  docked = true,
  focusRequest = 0,
  focusFirstError = false,
  onJump,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  docked?: boolean;
  focusRequest?: number;
  focusFirstError?: boolean;
  onJump?: (issue: Issue) => void;
}) {
  const project = useStore((state) => state.project)!;
  const fixing = useStore((state) => state.fixing);
  const applyFixes = useStore((state) => state.applyFixes);
  const groups = groupIssues(useIssues());
  const errors = groups.filter((group) => group.severity === 'error').length;
  const warnings = groups.length - errors;
  const fixAll = fixAllGroups(groups, project);
  const expanded = open || !docked;
  const panelRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (focusRequest === 0) return;
    const firstError = focusFirstError ? listRef.current?.querySelector<HTMLElement>('[data-severity="error"] .issues__summary') : null;
    (firstError ?? listRef.current)?.focus();
  }, [focusRequest, focusFirstError]);
  const [height, setHeight] = useState(loadIssuesHeight);
  const heightRef = useRef(height);
  const resize = (value: number) => {
    // The room is what the panes above have now plus the list's own height.
    const panes = panelRef.current?.previousElementSibling?.clientHeight ?? 0;
    heightRef.current = clampIssuesHeight(value, panes > 0 ? panes + heightRef.current : undefined);
    setHeight(heightRef.current);
  };
  const commit = () => saveIssuesHeight(heightRef.current);
  const jump = (issue: Issue) => {
    goToIssue(issue);
    onJump?.(issue);
  };

  return (
    <section className={docked ? 'issues-panel' : 'issues-panel issues-panel--pane'} aria-label={t.issues.title} ref={panelRef} data-tour="issues">
      {docked && open && (
        <PaneResizer
          label={t.issues.resize}
          value={height}
          min={ISSUES_HEIGHT_LIMITS[0]}
          max={ISSUES_HEIGHT_LIMITS[1]}
          direction={-1}
          orientation="horizontal"
          onResize={resize}
          onCommit={commit}
          onReset={() => {
            resize(DEFAULT_ISSUES_HEIGHT);
            commit();
          }}
        />
      )}
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
          {docked && (
            <Button
              variant="ghost"
              size="icon"
              className="issues-panel__toggle"
              aria-label={open ? t.issues.collapse : t.issues.expand}
              title={open ? t.issues.collapse : t.issues.expand}
              aria-expanded={open}
              aria-controls={BODY_ID}
              onClick={() => onOpenChange(!open)}
            >
              {open ? <CaretDownIcon size={14} /> : <CaretUpIcon size={14} />}
            </Button>
          )}
        </div>
      </div>
      {expanded && (
        <div className="issues-panel__body" id={BODY_ID} style={docked ? { height } : undefined}>
          {groups.length === 0 ? (
            <p className="empty-state">
              <CheckCircleIcon size={18} className="empty-state__icon" />
              <br />
              {t.issues.empty}
            </p>
          ) : (
            <ul className="issues" ref={listRef} tabIndex={-1}>
              {groups.map((group, index) => (
                // The whole row jumps to the field; the summary button makes that reachable by keyboard, and the
                // chips and fix buttons stop the click so they do their own thing.
                <li key={index} data-severity={group.severity} onClick={() => jump(group.issues[0])}>
                  {group.severity === 'error' ? (
                    <WarningCircleIcon size={14} className="issue-icon--error" />
                  ) : (
                    <WarningIcon size={14} className="issue-icon--warning" />
                  )}
                  <button type="button" className="issues__summary">
                    {group.summary}
                  </button>
                  {/* Every row has the same four cells (icon, summary, where, fixes), even when one is empty. */}
                  <span className="issues__where">
                    <span className="issues__location">{issueLocation(group.issues[0], project)}</span>
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
                  </span>
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
