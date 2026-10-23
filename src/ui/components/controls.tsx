import { DotsThreeIcon, WarningCircleIcon, WarningIcon } from '@phosphor-icons/react';
import { type ButtonHTMLAttributes, Fragment, type ReactNode, useEffect, useRef, useState } from 'react';
import type { Issue } from '../../core/validate';
import { useStore } from '../../state/store';
import { type IssueGroup, groupFixes, groupIssues, issueFixes, useFieldIssues, useIssues } from '../issues';
import { withKeys } from './keys';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'normal' | 'small' | 'icon';
};

export function Button({ variant = 'secondary', size = 'normal', className = '', type = 'button', ...rest }: ButtonProps) {
  const classes = ['btn', `btn--${variant}`, size !== 'normal' ? `btn--${size}` : '', className].filter(Boolean).join(' ');
  return <button type={type} className={classes} {...rest} />;
}

export function Badge({ tone, children }: { tone: 'red' | 'yellow' | 'blue' | 'green' | 'gray'; children: ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

interface FieldProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}

/** Label, input, hint and the validation issues that point at this input. */
export function Field({ id, label, hint, children }: FieldProps) {
  const issues = useFieldIssues(id);
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint && <p className="field__hint">{typeof hint === 'string' ? withKeys(hint) : hint}</p>}
      {issues.map((issue, index) => (
        <Fragment key={index}>
          <p className={`field__issue field__issue--${issue.severity}`}>
            {issue.severity === 'error' ? <WarningCircleIcon size={14} /> : <WarningIcon size={14} />}
            {issue.summary}
          </p>
          <InlineIssueFixes issue={issue} />
        </Fragment>
      ))}
    </div>
  );
}

/** The fix buttons of one issue group; nothing when the group has no fix. */
export function IssueFixes({ group }: { group: IssueGroup }) {
  const project = useStore((state) => state.project);
  const fixing = useStore((state) => state.fixing);
  const applyFixes = useStore((state) => state.applyFixes);
  const options = project ? groupFixes(group, project) : [];
  if (options.length === 0) return null;
  return (
    <span className="issue-fixes">
      {options.map((option) => (
        <Button key={option.label} size="small" disabled={fixing} onClick={() => void applyFixes([option.fixes])}>
          {option.label}
        </Button>
      ))}
    </span>
  );
}

/** The fix buttons for an issue shown next to its input: those of the group the issue belongs to. */
export function InlineIssueFixes({ issue }: { issue: Issue }) {
  const project = useStore((state) => state.project);
  const group = groupIssues(useIssues()).find((candidate) => candidate.issues.includes(issue));
  // The buttons fix the whole group, but only show where this issue itself can be fixed.
  if (!group || !project || issueFixes(issue, project).length === 0) return null;
  return <IssueFixes group={group} />;
}

export function Toggle({ id, checked, onChange, label }: { id?: string; checked: boolean; onChange: (checked: boolean) => void; label: ReactNode }) {
  return (
    <label className="toggle">
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Tabs<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: ReactNode }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          className="tabs__tab"
          aria-selected={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className = '',
}: {
  value: T;
  options: Array<{ value: T; label: ReactNode }>;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div className={`segmented ${className}`.trim()} role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={option.value === value} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

export interface MenuItem {
  label: string;
  onSelect: () => void;
  className?: string;
  /** Draws a line above the item, starting a new group. */
  separatorBefore?: boolean;
  /** The item's keys, as `shortcutLabel` shows them, and for `aria-keyshortcuts`. */
  shortcut?: string;
  ariaKeyShortcuts?: string;
}

/** A "⋯" button with a small list of actions. Closes on selection, outside click or Escape. */
export function Menu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <Button size="icon" variant="ghost" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <DotsThreeIcon size={18} />
      </Button>
      {open && (
        <div className="menu__list" role="menu" aria-label={label}>
          {items.map((item) => (
            <Fragment key={item.label}>
              {item.separatorBefore && <div role="separator" className="menu__separator" />}
              <button
                type="button"
                role="menuitem"
                className={`menu__item ${item.className ?? ''}`.trim()}
                aria-keyshortcuts={item.ariaKeyShortcuts}
                onClick={() => {
                  setOpen(false);
                  // The item is about to disappear: give focus back to the trigger first, so whatever the item
                  // opens (a dialog, the tour) can hand it back there when it closes.
                  ref.current?.querySelector<HTMLElement>('[aria-haspopup="menu"]')?.focus();
                  item.onSelect();
                }}
              >
                {item.label}
                {item.shortcut && (
                  <span aria-hidden="true">
                    <kbd>{item.shortcut}</kbd>
                  </span>
                )}
              </button>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

export function Dialog({ title, intro, children, onClose }: { title: string; intro?: ReactNode; children: ReactNode; onClose: () => void }) {
  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} onKeyDown={(event) => event.key === 'Escape' && onClose()}>
        <h2 className="dialog__title">{title}</h2>
        {intro && <p className="dialog__intro">{intro}</p>}
        {children}
      </div>
    </div>
  );
}
