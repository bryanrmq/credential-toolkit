import { type KeyboardEvent, useRef, useState } from 'react';
import type { ClaimsPath } from '../../core/model';
import { formatPath, parsePath } from '../../core/paths';
import { t } from '../../strings';

export function TextInput({
  id,
  value,
  onChange,
  placeholder,
  mono = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <input
      id={id}
      className={mono ? 'input input--mono' : 'input'}
      value={value}
      placeholder={placeholder}
      spellCheck={!mono}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/** A suggestion from outside the project, such as an I14Y concept, offered under an input while typing. */
export interface Suggestion {
  id: string;
  label: string;
  detail?: string;
}

export interface SuggestionSource {
  heading: string;
  /** Called when the input gets focus, for example to start loading what `find` searches. */
  prepare?: () => void;
  find: (text: string) => Suggestion[];
  pick: (suggestion: Suggestion) => void;
}

/**
 * The list of `source` suggestions for what was just typed. Nothing is highlighted until the arrow
 * keys move into the list, so Enter keeps doing what it does without suggestions.
 */
function useSuggestions(id: string, source: SuggestionSource | undefined) {
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const items = source && query !== null ? source.find(query) : [];
  const listId = `${id}-suggested`;
  const close = () => {
    setQuery(null);
    setActive(-1);
  };
  const choose = (item: Suggestion) => {
    close();
    source?.pick(item);
  };
  return {
    open: items.length > 0,
    listId,
    activeId: active >= 0 && active < items.length ? `${listId}-${active}` : undefined,
    prepare: () => source?.prepare?.(),
    type: (text: string) => {
      if (!source) return;
      setQuery(text);
      setActive(-1);
    },
    close,
    /** Moves through the list, takes the highlighted suggestion or closes the list. Returns whether it used the key. */
    keyDown: (event: KeyboardEvent<HTMLInputElement>): boolean => {
      if (!items.length) return false;
      if (event.key === 'ArrowDown') setActive((index) => (index + 1) % items.length);
      else if (event.key === 'ArrowUp') setActive((index) => (index <= 0 ? items.length - 1 : index - 1));
      else if (event.key === 'Escape') close();
      else if (event.key === 'Enter' && active >= 0 && active < items.length) choose(items[active]);
      else return false;
      event.preventDefault();
      return true;
    },
    list: items.length > 0 && (
      <div className="suggestions suggestions--sourced">
        <p className="suggestions__heading" id={`${listId}-heading`}>
          {source?.heading}
        </p>
        <ul id={listId} role="listbox" aria-labelledby={`${listId}-heading`}>
          {items.map((item, index) => (
            <li
              key={item.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => {
                event.preventDefault();
                choose(item);
              }}
            >
              <span className="suggestions__label">{item.label}</span>
              {item.detail && <span className="suggestions__detail">{item.detail}</span>}
            </li>
          ))}
        </ul>
      </div>
    ),
  };
}

/** Text input that commits on blur or Enter (Escape reverts), for edits that ripple through the project. */
export function CommitInput({
  id,
  value,
  onCommit,
  mono = false,
  suggestions,
}: {
  id: string;
  value: string;
  onCommit: (value: string) => void;
  mono?: boolean;
  suggestions?: SuggestionSource;
}) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  // Picking a suggestion replaces what was typed, so the half-typed text is never committed.
  const sourced = useSuggestions(id, suggestions && { ...suggestions, pick: (item) => (setText(value), suggestions.pick(item)) });
  if (seen !== value) {
    setSeen(value);
    setText(value);
  }
  const commit = () => {
    if (text !== value) onCommit(text);
  };
  const input = (
    <input
      id={id}
      className={mono ? 'input input--mono' : 'input'}
      value={text}
      spellCheck={!mono}
      {...(suggestions && {
        role: 'combobox',
        'aria-autocomplete': 'list' as const,
        'aria-expanded': sourced.open,
        'aria-controls': sourced.listId,
        'aria-activedescendant': sourced.activeId,
      })}
      onFocus={sourced.prepare}
      onChange={(event) => {
        setText(event.target.value);
        sourced.type(event.target.value);
      }}
      onBlur={() => {
        sourced.close();
        commit();
      }}
      onKeyDown={(event) => {
        if (sourced.keyDown(event)) return;
        if (event.key === 'Enter') commit();
        if (event.key === 'Escape') setText(value);
      }}
    />
  );
  return suggestions ? (
    <div className="suggest-input">
      {input}
      {sourced.list}
    </div>
  ) : (
    input
  );
}

/** Edits a claims path as text; keeps invalid text local and only commits valid paths. */
export function PathInput({ id, value, onChange }: { id: string; value: ClaimsPath; onChange: (path: ClaimsPath) => void }) {
  const external = JSON.stringify(value);
  const [text, setText] = useState(() => formatPath(value));
  const [seen, setSeen] = useState(external);
  // When the path changes elsewhere (e.g. a rename), show it — unless it is what the user just typed.
  if (seen !== external) {
    setSeen(external);
    if (JSON.stringify(parsePath(text)) !== external) setText(formatPath(value));
  }
  const parsed = parsePath(text);
  return (
    <>
      <input
        id={id}
        className="input input--mono"
        value={text}
        aria-invalid={parsed === null}
        spellCheck={false}
        onChange={(event) => {
          setText(event.target.value);
          const next = parsePath(event.target.value);
          if (next) onChange(next);
        }}
      />
      {parsed === null && <p className="field__issue field__issue--error">{t.inspector.sourceInvalid}</p>}
    </>
  );
}

const OPEN_EXPRESSION = /\{\{([^{}]*)$/;

/** Text input with `{{` autocomplete for attribute paths, and optionally other suggestions while no `{{` is open. */
export function TemplateInput({
  id,
  value,
  onChange,
  paths,
  placeholder,
  suggestions: source,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  paths: string[];
  placeholder?: string;
  suggestions?: SuggestionSource;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const suggestions = query === null ? [] : paths.filter((path) => path.toLowerCase().includes(query.toLowerCase())).slice(0, 12);
  const sourced = useSuggestions(id, source);
  const sourcedOpen = suggestions.length === 0 && sourced.open;

  const refreshQuery = (text: string, caret: number) => {
    const match = OPEN_EXPRESSION.exec(text.slice(0, caret));
    setQuery(match ? match[1] : null);
    setActive(0);
  };

  const insert = (path: string) => {
    const input = inputRef.current;
    if (!input) return;
    const caret = input.selectionStart ?? value.length;
    const before = value.slice(0, caret).replace(OPEN_EXPRESSION, `{{${path}}}`);
    const after = value.slice(caret).replace(/^[^{}]*\}\}/, '');
    onChange(before + after);
    setQuery(null);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(before.length, before.length);
    });
  };

  return (
    <div className="template-input">
      <input
        ref={inputRef}
        id={id}
        className="input"
        value={value}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={suggestions.length > 0 || sourcedOpen}
        aria-controls={sourcedOpen ? sourced.listId : `${id}-suggestions`}
        aria-activedescendant={sourcedOpen ? sourced.activeId : undefined}
        aria-autocomplete="list"
        onFocus={sourced.prepare}
        onChange={(event) => {
          onChange(event.target.value);
          refreshQuery(event.target.value, event.target.selectionStart ?? event.target.value.length);
          sourced.type(event.target.value);
        }}
        onBlur={() => {
          sourced.close();
          setTimeout(() => setQuery(null), 120);
        }}
        onKeyDown={(event) => {
          if (!suggestions.length) {
            sourced.keyDown(event);
            return;
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((index) => (index + 1) % suggestions.length);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((index) => (index - 1 + suggestions.length) % suggestions.length);
          } else if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault();
            insert(suggestions[active]);
          } else if (event.key === 'Escape') {
            setQuery(null);
          }
        }}
      />
      {suggestions.length > 0 && (
        <ul className="suggestions" id={`${id}-suggestions`} role="listbox">
          {suggestions.map((path, index) => (
            <li
              key={path}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => {
                event.preventDefault();
                insert(path);
              }}
            >
              {path}
            </li>
          ))}
        </ul>
      )}
      {sourcedOpen && sourced.list}
    </div>
  );
}
