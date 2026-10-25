import { MagnifyingGlassIcon } from '@phosphor-icons/react';
import { type KeyboardEvent, type ReactNode, useId, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from '../../state/store';
import { t } from '../../strings';
import { nodeIcon } from '../components/nodeIcon';
import { type Command, availableCommands, commandLabel, runCommand, shortcutLabel } from '../lib/commands';
import { type NodeEntry, findNodes, nodeEntries, rankMatches } from '../lib/palette';
import { useWideWindow } from '../lib/wideWindow';

type Result = { kind: 'node'; entry: NodeEntry } | { kind: 'command'; command: Command };

/**
 * The command palette (⌘K, or the top bar's search button): finds attributes and groups by label, key
 * and path, and the commands that apply now (`palette.ts` ranks them). Choosing an attribute reveals it
 * in the tree (`onReveal`); choosing a command runs it on the current selection. Focus stays in the
 * search field (combobox pattern) and goes back to where it was when the palette closes. On narrow
 * windows it is a full-width sheet at the top.
 */
export function CommandPalette({ onClose, onReveal }: { onClose: () => void; onReveal: (id: string) => void }) {
  const project = useStore((state) => state.project)!;
  const editLang = useStore((state) => state.editLang);
  const wide = useWideWindow();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // Where focus was when the palette opened: it goes back there when the palette closes.
  const [returnFocus] = useState(() => document.activeElement);
  const id = useId();
  const optionId = (index: number) => `${id}-option-${index}`;

  const blank = query.trim() === '';
  const commands = availableCommands().filter((entry) => entry.id !== 'workspace.palette');
  // With an empty query, only the commands that apply now.
  const nodes = blank ? [] : findNodes(nodeEntries(project, editLang), query);
  const shownCommands = blank ? commands : rankMatches(commands, query, (entry) => [commandLabel(entry.id), ...(entry.keywords ?? [])]);
  const results: Result[] = [
    ...nodes.map((entry): Result => ({ kind: 'node', entry })),
    ...shownCommands.map((entry): Result => ({ kind: 'command', command: entry })),
  ];
  const current = results.length ? Math.min(active, results.length - 1) : -1;

  useLayoutEffect(() => inputRef.current?.focus(), []);
  useLayoutEffect(() => {
    if (current >= 0) document.getElementById(optionId(current))?.scrollIntoView?.({ block: 'nearest' });
  });

  const close = () => {
    onClose();
    if (returnFocus instanceof HTMLElement) returnFocus.focus();
  };

  // Focus goes back first, so that the command (or the tree) can move it on from there.
  const choose = (result: Result) => {
    close();
    if (result.kind === 'node') onReveal(result.entry.node.id);
    else runCommand(result.command.id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (results.length) setActive((current + (event.key === 'ArrowDown' ? 1 : results.length - 1)) % results.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (current >= 0) choose(results[current]);
    } else if (event.key === 'Tab') {
      // Focus stays in the search field.
      event.preventDefault();
    }
  };

  const option = (index: number, content: ReactNode) => (
    <div
      key={index}
      id={optionId(index)}
      role="option"
      aria-selected={index === current}
      className="palette__option"
      onMouseMove={() => index !== current && setActive(index)}
      // The search field keeps focus.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => choose(results[index])}
    >
      {content}
    </div>
  );

  const nodeOption = ({ node, label, path, parent }: NodeEntry, index: number) =>
    option(
      index,
      <>
        <span className="palette__icon">{nodeIcon(node)}</span>
        <span className="palette__label">{label || node.key}</span>
        <span className="palette__path">{path}</span>
        {parent && <span className="palette__meta">{parent}</span>}
      </>,
    );

  const commandOption = (entry: Command, index: number) => {
    const Icon = entry.icon;
    const shortcut = shortcutLabel(entry.id);
    return option(
      index,
      <>
        <span className="palette__icon">
          <Icon />
        </span>
        <span className="palette__label palette__label--grow">{commandLabel(entry.id)}</span>
        {shortcut && <kbd className="palette__meta">{shortcut}</kbd>}
      </>,
    );
  };

  return (
    <div className={wide ? 'palette-backdrop' : 'palette-backdrop palette-backdrop--sheet'} onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <div className={wide ? 'palette' : 'palette palette--sheet'} role="dialog" aria-modal="true" aria-label={t.palette.title}>
        <div className="palette__search">
          <MagnifyingGlassIcon size={16} aria-hidden="true" />
          <input
            ref={inputRef}
            className="palette__input"
            role="combobox"
            aria-label={t.palette.search}
            aria-expanded={results.length > 0}
            aria-controls={`${id}-list`}
            aria-autocomplete="list"
            aria-activedescendant={current >= 0 ? optionId(current) : undefined}
            placeholder={t.palette.search}
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />
          <kbd aria-hidden="true">esc</kbd>
        </div>
        <div className="palette__results">
          <div role="listbox" id={`${id}-list`} aria-label={t.palette.title}>
            {nodes.length > 0 && (
              <div role="group" aria-labelledby={`${id}-attributes`}>
                <div className="palette__heading" id={`${id}-attributes`} role="presentation">
                  {t.palette.attributes}
                </div>
                {nodes.map((entry, index) => nodeOption(entry, index))}
              </div>
            )}
            {shownCommands.length > 0 && (
              <div role="group" aria-labelledby={`${id}-commands`}>
                <div className="palette__heading" id={`${id}-commands`} role="presentation">
                  {t.palette.commands}
                </div>
                {shownCommands.map((entry, index) => commandOption(entry, nodes.length + index))}
              </div>
            )}
          </div>
          {results.length === 0 && (
            <p className="palette__empty" role="status">
              {t.palette.noResults}
            </p>
          )}
        </div>
        <div className="palette__footer" aria-hidden="true">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> {t.palette.move}
          </span>
          <span>
            <kbd>↵</kbd> {t.palette.openOrRun}
          </span>
          <span>
            <kbd>esc</kbd> {t.palette.close}
          </span>
        </div>
      </div>
    </div>
  );
}
