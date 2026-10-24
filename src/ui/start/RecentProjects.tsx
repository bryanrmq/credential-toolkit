import { DotsThreeIcon, DownloadSimpleIcon, FolderOpenIcon, IdentificationCardIcon, TextboxIcon, TrashIcon } from '@phosphor-icons/react';
import { type KeyboardEvent, type MouseEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { type DraftSummary, deleteDraft, draftDisplayName, openDraft, renameDraft, restoreDraft, useDrafts } from '../../state/persistence';
import { useStore } from '../../state/store';
import { t } from '../../strings';
import { Button } from '../components/controls';
import { PopupMenu, type PopupMenuItem } from '../components/PopupMenu';
import { usesCommandKey } from '../lib/platform';
import { downloadDraftProjectFile, openProjectFile } from '../lib/projectFile';
import { fullDateTime, relativeTime } from '../lib/relativeTime';

/** How many drafts show until "Show all". */
export const RECENT_LIMIT = 8;

/** The draft row's menu: which draft, where it opens and where focus goes back. */
interface RowMenu {
  draft: DraftSummary;
  index: number;
  at: { x: number; y: number };
  align: 'start' | 'end';
  returnFocus: HTMLElement | null;
}

const untitled = (draft: DraftSummary) => !draft.customName && !draft.credentialName;

/** The time now, again every minute, so "2 min ago" keeps up while the start screen stays open. */
function useNow(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * The drafts stored in this browser, the most recent first: a row opens its draft, and its menu (the ⋯ button,
 * right-click, ⇧F10 or the context-menu key) renames it inline (F2), downloads it as a project file or deletes
 * it (⌫) with an Undo toast. Shows the newest `RECENT_LIMIT` until "Show all"; nothing at all without drafts.
 */
export function RecentProjects() {
  const drafts = useDrafts((state) => state.drafts);
  const showUndoable = useStore((state) => state.showUndoable);
  const showError = useStore((state) => state.showError);
  const [showAll, setShowAll] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<RowMenu | null>(null);
  const now = useNow();
  const listRef = useRef<HTMLUListElement>(null);
  // After a rename ended with ⏎ or Escape, its row takes focus back.
  const refocusId = useRef<string | null>(null);
  // After deleting draft `id`, the row that took its place (or the last one) takes focus.
  const focusAfterDelete = useRef<{ id: string; index: number } | null>(null);

  const shown = showAll ? drafts : drafts.slice(0, RECENT_LIMIT);

  const openButton = (id: string) =>
    [...(listRef.current?.querySelectorAll<HTMLElement>('.recent__row') ?? [])]
      .find((row) => row.dataset.draft === id)
      ?.querySelector<HTMLElement>('button.recent__open');

  useLayoutEffect(() => {
    if (renaming || !refocusId.current) return;
    openButton(refocusId.current)?.focus();
    refocusId.current = null;
  }, [renaming]);

  useLayoutEffect(() => {
    const pending = focusAfterDelete.current;
    if (!pending || drafts.some((draft) => draft.id === pending.id)) return;
    focusAfterDelete.current = null;
    const rows = listRef.current?.querySelectorAll<HTMLElement>('.recent__open') ?? [];
    rows[Math.min(pending.index, rows.length - 1)]?.focus();
  }, [drafts]);

  const closeMenu = useCallback(() => setMenu(null), []);

  if (drafts.length === 0) return null;

  const open = async (id: string) => {
    if (!(await openDraft(id))) showError(t.start.recent.unreadable);
  };

  const download = async (id: string) => {
    if (!(await downloadDraftProjectFile(id))) showError(t.start.recent.unreadable);
  };

  const remove = async (draft: DraftSummary, index: number) => {
    const name = draftDisplayName(draft);
    focusAfterDelete.current = { id: draft.id, index };
    const record = await deleteDraft(draft.id);
    if (record) showUndoable(t.start.recent.deleted(name), () => void restoreDraft(record));
  };

  const endRename = (draft: DraftSummary, name: string | null, refocus: boolean) => {
    if (refocus) refocusId.current = draft.id;
    setRenaming(null);
    if (name === null) return;
    const value = name.trim();
    if (value !== (draft.customName || draft.credentialName)) void renameDraft(draft.id, value);
  };

  const sections = (draft: DraftSummary, index: number): PopupMenuItem[][] => [
    [
      { label: t.start.recent.rename, icon: <TextboxIcon />, shortcut: 'F2', onSelect: () => setRenaming(draft.id) },
      { label: t.start.recent.download, icon: <DownloadSimpleIcon />, onSelect: () => void download(draft.id) },
    ],
    [
      {
        label: t.start.recent.delete,
        icon: <TrashIcon />,
        shortcut: usesCommandKey() ? '⌫' : 'Del',
        danger: true,
        onSelect: () => void remove(draft, index),
      },
    ],
  ];

  const onRowKeyDown = (draft: DraftSummary, index: number, event: KeyboardEvent<HTMLLIElement>) => {
    if (renaming === draft.id || event.altKey || event.metaKey || event.ctrlKey) return;
    const menuKey = event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey);
    if (menuKey) {
      const row = event.currentTarget.getBoundingClientRect();
      setMenu({ draft, index, at: { x: row.left + 24, y: row.bottom }, align: 'start', returnFocus: openButton(draft.id) ?? null });
    } else if (event.shiftKey) {
      return;
    } else if (event.key === 'F2') {
      setRenaming(draft.id);
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
      void remove(draft, index);
    } else {
      return;
    }
    event.preventDefault();
  };

  const onRowContextMenu = (draft: DraftSummary, index: number, event: MouseEvent<HTMLLIElement>) => {
    if (renaming === draft.id) return;
    event.preventDefault();
    setMenu({ draft, index, at: { x: event.clientX, y: event.clientY }, align: 'start', returnFocus: openButton(draft.id) ?? null });
  };

  return (
    <section className="recent" aria-labelledby="recent-title">
      <div className="start__heading-row">
        <h2 id="recent-title" className="start__heading">
          {t.start.recent.title}
        </h2>
        <Button variant="ghost" size="small" onClick={openProjectFile}>
          <FolderOpenIcon /> {t.projectFile.open}
        </Button>
      </div>
      <ul className="recent__list" ref={listRef}>
        {shown.map((draft, index) => {
          const name = draftDisplayName(draft);
          const menuOpen = menu?.draft.id === draft.id;
          const content = (
            <>
              <IdentificationCardIcon className="recent__icon" size={16} aria-hidden="true" />
              {renaming === draft.id ? (
                <RenameInput draft={draft} onDone={(value, refocus) => endRename(draft, value, refocus)} />
              ) : (
                <span className={untitled(draft) ? 'recent__name recent__name--untitled' : 'recent__name'}>{name}</span>
              )}
              <span className="recent__languages">{draft.languages.join(' ')}</span>
              <time className="recent__time" dateTime={new Date(draft.updatedAt).toISOString()} title={fullDateTime(draft.updatedAt)}>
                {relativeTime(draft.updatedAt, now)}
              </time>
            </>
          );
          return (
            <li
              key={draft.id}
              className="recent__row"
              data-draft={draft.id}
              onKeyDown={(event) => onRowKeyDown(draft, index, event)}
              onContextMenu={(event) => onRowContextMenu(draft, index, event)}
            >
              {renaming === draft.id ? (
                <div className="recent__open recent__open--renaming">{content}</div>
              ) : (
                <button type="button" className="recent__open" onClick={() => void open(draft.id)}>
                  {content}
                </button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="recent__actions"
                aria-label={t.start.recent.actions(name)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={(event) => {
                  const button = event.currentTarget;
                  const rect = button.getBoundingClientRect();
                  setMenu(menuOpen ? null : { draft, index, at: { x: rect.right, y: rect.bottom + 4 }, align: 'end', returnFocus: button });
                }}
              >
                <DotsThreeIcon size={16} weight="bold" />
              </Button>
            </li>
          );
        })}
      </ul>
      {!showAll && drafts.length > RECENT_LIMIT && (
        <button type="button" className="recent__more" onClick={() => setShowAll(true)}>
          {t.start.recent.showAll(drafts.length)}
        </button>
      )}
      {menu && (
        <PopupMenu
          label={t.start.recent.actions(draftDisplayName(menu.draft))}
          at={menu.at}
          align={menu.align}
          sections={sections(menu.draft, menu.index)}
          returnFocus={menu.returnFocus}
          onClose={closeMenu}
        />
      )}
    </section>
  );
}

/** The draft's name as an inline input: ⏎ and leaving the input commit, Escape keeps the old name (`null`). */
function RenameInput({ draft, onDone }: { draft: DraftSummary; onDone: (name: string | null, refocus: boolean) => void }) {
  const [text, setText] = useState(draft.customName || draft.credentialName);
  const ref = useRef<HTMLInputElement>(null);
  // ⏎ and Escape end the rename before the input goes away, so its blur must not end it again.
  const done = useRef(false);
  const finish = (name: string | null, refocus: boolean) => {
    if (done.current) return;
    done.current = true;
    onDone(name, refocus);
  };
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      className="input recent__rename"
      aria-label={t.start.recent.renameInput(draftDisplayName(draft))}
      placeholder={t.drafts.untitled}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => finish(text, false)}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Enter') finish(text, true);
        else if (event.key === 'Escape') finish(null, true);
        else return;
        event.preventDefault();
        event.stopPropagation();
      }}
    />
  );
}
