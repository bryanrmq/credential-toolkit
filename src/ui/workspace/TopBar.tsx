import { DownloadSimpleIcon, MagnifyingGlassIcon, SidebarSimpleIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { type Ref, type RefObject, useLayoutEffect, useRef } from 'react';
import { hasUnreviewed } from '../../core/review';
import { type Area, isOutputShown, useStore } from '../../state/store';
import type { ExportState } from '../../state/useExport';
import { t } from '../../strings';
import { Badge, Button, Menu, type MenuItem, Segmented, Tabs } from '../components/controls';
import { blocksBundle, groupIssues, useIssues } from '../issues';
import { downloadBundle } from '../lib/baseline';
import { type CommandId, applies, ariaKeyShortcuts, commandLabel, runCommand, shortcutLabel } from '../lib/commands';
import { RELEASES_PAGE, useLatestRelease } from '../lib/latestRelease';
import { THEMES, setTheme, useTheme } from '../lib/theme';
import { useTranslationState } from '../lib/translate';
import { useWideWindow } from '../lib/wideWindow';
import { Wordmark } from '../Wordmark';

/** A menu item that runs command `id`, with its keys. */
function commandItem(id: CommandId): MenuItem {
  return { label: commandLabel(id), shortcut: shortcutLabel(id), ariaKeyShortcuts: ariaKeyShortcuts(id), onSelect: () => runCommand(id) };
}

/**
 * What leaves the top bar, in this order, while the project name would otherwise get less room than it needs (24
 * characters, then 12): the app name, Beta flag and release (to the menu) with the search shortcut, then the language
 * switch (for a dropdown), then the view toggle (to the menu), and on a phone, where the issue count needs its room
 * too, the ring mark and then the search button (to the menu). Each step is a word in the bar's `data-fit`.
 */
const FIT_STEPS = ['brand', 'lang', 'view', 'mark', 'search'];

/**
 * Sets the bar's `data-fit` to the fewest steps that keep `lead` from overflowing and the actions inside the bar's
 * padding, on resize and when `content` changes.
 */
function useFit(lead: RefObject<HTMLElement | null>, content: string) {
  useLayoutEffect(() => {
    const element = lead.current;
    const bar = element?.parentElement;
    if (!element || !bar) return;
    const actions = element.nextElementSibling;
    // Once the lead is empty it can't overflow, but the actions (which never shrink) can run past the padding.
    const fits = () =>
      element.scrollWidth <= element.clientWidth &&
      (!actions || actions.getBoundingClientRect().right <= bar.getBoundingClientRect().right - parseFloat(getComputedStyle(bar).paddingRight) + 0.5);
    const fit = () => {
      for (let steps = 0; steps <= FIT_STEPS.length; steps++) {
        bar.setAttribute('data-fit', FIT_STEPS.slice(0, steps).join(' '));
        if (fits()) return;
      }
    };
    fit();
    // The bar keeps its size whatever the steps, so this only fires when the window changes.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    observer?.observe(bar);
    // Geist arrives after the first layout and is wider than the fallback.
    void document.fonts?.ready.then(fit);
    return () => observer?.disconnect();
  }, [lead, content]);
}

/** Shows the issues; `firstError` puts the focus on the first error rather than on the list. */
export type ShowIssues = (options?: { firstError?: boolean }) => void;

/**
 * One row at every width, in order of priority: the project name, the area switch, the language,
 * the issue counts, then the actions. The name keeps at least 12 characters: other things leave the bar
 * first (`useFit`), and below 960 px the language switcher becomes a dropdown and the view toggle moves
 * into the menu (see `.wide-only` / `.narrow-only` in styles/workspace.css).
 * The controls that belong to the OCA keep their place, hidden, on the Metadata page, so nothing after
 * them moves when the area changes. Below 1000 px, where Output is one of the pane tabs, the Output
 * toggle is left out, and the search button (the command palette) shows only its icon. On a phone the issue counts
 * become one icon with the number of issues, so the issues stay one tap away in either area.
 * Download is the only primary button of the workspace. While errors block it, it stays focusable,
 * says how many errors to fix and, when pressed, shows the issues with the first error focused.
 */
export function TopBar({ exportState, onShowIssues, ref }: { exportState: ExportState; onShowIssues: ShowIssues; ref?: Ref<HTMLElement> }) {
  const project = useStore((state) => state.project)!;
  const editLang = useStore((state) => state.editLang);
  const view = useStore((state) => state.view);
  const area = useStore((state) => state.area);
  const outputOpen = useStore(isOutputShown);
  const theme = useTheme((state) => state.theme);
  const { setEditLang, setView, setArea, setOutputOpen, close } = useStore.getState();
  const areas = (['oca', 'metadata'] as const).map((value) => ({ value, label: t.workspace.areas[value] }));
  const wide = useWideWindow();
  const release = useLatestRelease();
  // Re-renders the menu when a translation starts or ends, since "Translate missing languages" waits for it.
  useTranslationState((state) => state.running);
  const groups = groupIssues(useIssues());
  const errors = groups.filter((group) => group.severity === 'error').length;
  const warnings = groups.length - errors;
  const name = project.meta[editLang]?.name || t.workspace.untitled;
  const blocking = groups.filter(blocksBundle).length;
  // The Translations view shows every language, so the editing language does nothing there.
  const langIdle = area === 'oca' && view === 'translations';
  const blocked = blocking > 0;
  // Every label the button can show sits in one cell, so its width stays put across areas and errors.
  const downloadLabels = [t.workspace.download, t.workspace.downloadOcaBundle, ...(blocked ? [t.workspace.fixErrors(blocking)] : [])];
  const downloadLabel = blocked ? t.workspace.fixErrors(blocking) : area === 'oca' ? t.workspace.download : t.workspace.downloadOcaBundle;
  // A control of the OCA on the Metadata page: it keeps its room but can't be seen, focused or read.
  const ocaSlot = (className: string) =>
    area === 'oca' ? { className } : { className: `${className} topbar__slot--idle`.trim(), 'aria-hidden': true, inert: true };
  const leadRef = useRef<HTMLDivElement>(null);
  // What changes the width of the bar's content; the name's own length doesn't, it truncates.
  useFit(leadRef, [area, wide, project.languages.length, errors, warnings, blocking, release?.tag].join());

  return (
    <header className="topbar" ref={ref}>
      <div className="topbar__lead" ref={leadRef}>
        <Wordmark compact />
        <span className="topbar__divider" aria-hidden="true">
          /
        </span>
        <span className="topbar__name" title={name}>
          {name}
        </span>
        <div className="topbar__areas wide-only">
          <Tabs label={t.workspace.area} value={area} onChange={setArea} options={areas} />
        </div>
      </div>
      <div className="topbar__actions" data-tour="topbar">
        <Segmented
          className="wide-only topbar__lang"
          label={t.workspace.editingLanguage}
          disabled={langIdle}
          title={langIdle ? t.workspace.editingLanguageAll : undefined}
          value={editLang}
          onChange={setEditLang}
          options={project.languages.map((lang) => ({ value: lang, label: lang }))}
        />
        <select
          className="select select--compact narrow-only topbar__lang-select"
          aria-label={t.workspace.editingLanguage}
          disabled={langIdle}
          title={langIdle ? t.workspace.editingLanguageAll : undefined}
          value={editLang}
          onChange={(event) => setEditLang(event.target.value)}
        >
          {project.languages.map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </select>
        <select
          className="select select--compact narrow-only"
          aria-label={t.workspace.area}
          value={area}
          onChange={(event) => setArea(event.target.value as Area)}
        >
          {areas.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span {...ocaSlot('topbar__slot wide-only topbar__view')}>
          <Segmented
            label={t.workspace.view}
            value={view}
            onChange={setView}
            options={[
              { value: 'editor', label: t.workspace.editor },
              { value: 'translations', label: t.workspace.translations },
            ]}
          />
        </span>
        {groups.length > 0 && (
          <Button
            variant="ghost"
            size="small"
            className={errors > 0 ? 'topbar__issues topbar__issues--error' : 'topbar__issues'}
            title={t.issues.show}
            aria-label={t.issues.showCounts([
              ...(errors > 0 ? [t.workspace.errorCount(errors)] : []),
              ...(warnings > 0 ? [t.workspace.warningCount(warnings)] : []),
            ])}
            onClick={() => onShowIssues()}
          >
            <span className="topbar__issue-badges hide-phone">
              {errors > 0 && <Badge tone="red">{t.workspace.errorCount(errors)}</Badge>}
              {warnings > 0 && <Badge tone="yellow">{t.workspace.warningCount(warnings)}</Badge>}
            </span>
            <span className="topbar__issue-count">
              <WarningCircleIcon size={16} />
              {groups.length}
            </span>
          </Button>
        )}
        {/* The Output pane belongs to the OCA; the Metadata page has its own preview column. */}
        {wide && (
          <Button
            {...ocaSlot('')}
            variant="ghost"
            size="icon"
            aria-label={outputOpen ? t.workspace.hideOutput : t.workspace.showOutput}
            aria-pressed={outputOpen}
            aria-keyshortcuts="Meta+Alt+B Control+Alt+B"
            title={outputOpen ? t.workspace.hideOutputTitle : t.workspace.showOutputTitle}
            data-output-toggle=""
            onClick={() => setOutputOpen(!outputOpen)}
          >
            <SidebarSimpleIcon mirrored />
          </Button>
        )}
        {/* For touch and narrow windows too, where the tree commands are otherwise keyboard or right-click only. */}
        <Button
          variant="ghost"
          size={wide ? 'small' : 'icon'}
          className="topbar__palette"
          aria-label={t.palette.title}
          aria-keyshortcuts={ariaKeyShortcuts('workspace.palette')}
          title={t.palette.title}
          onClick={() => runCommand('workspace.palette')}
        >
          <MagnifyingGlassIcon size={16} />
          {wide && <kbd aria-hidden="true">{shortcutLabel('workspace.palette')}</kbd>}
        </Button>
        <Button
          variant="primary"
          className="topbar__download"
          // Blocked by errors, it stays focusable and leads to them; while the bundle is still being built it waits.
          disabled={!blocked && exportState.status !== 'ready'}
          aria-disabled={blocked || undefined}
          title={blocked ? t.workspace.downloadBlocked(blocking) : undefined}
          onClick={() => {
            if (blocked) return onShowIssues({ firstError: true });
            // What was downloaded is what gets published: the Changes tab compares with it from now on.
            if (exportState.status === 'ready') downloadBundle(exportState.outputs);
          }}
        >
          <DownloadSimpleIcon />
          <span className="topbar__download-label label-phone-hidden">
            {downloadLabels.map((label) => (
              <span key={label} aria-hidden={label === downloadLabel ? undefined : true} className={label === downloadLabel ? undefined : 'topbar__download-spare'}>
                {label}
              </span>
            ))}
          </span>
        </Button>
        <Menu
          label={t.workspace.moreActions}
          items={[
            commandItem('workspace.manageLanguages'),
            // Only on the OCA, when a linked attribute lacks a text its I14Y concept may have.
            ...(applies('workspace.fillFromI14y') ? [commandItem('workspace.fillFromI14y')] : []),
            // Only with the browser's on-device translator and some text to fill.
            ...(applies('workspace.translateMissing') ? [commandItem('workspace.translateMissing')] : []),
            // Only while some suggested text waits for review.
            ...(hasUnreviewed(project) ? [commandItem('workspace.confirmSuggestions')] : []),
            { label: t.workspace.editorView, className: 'narrow-only', onSelect: () => setView('editor') },
            { label: t.workspace.translationsView, className: 'narrow-only', onSelect: () => setView('translations') },
            { ...commandItem('workspace.palette'), className: 'search-only' },
            commandItem('workspace.tour'),
            commandItem('workspace.shortcuts'),
            {
              label: t.workspace.about(t.appName, release?.tag, t.beta),
              className: 'compact-only',
              onSelect: () => window.open(release?.url ?? RELEASES_PAGE, '_blank', 'noopener,noreferrer'),
            },
            ...THEMES.map((value, index) => ({
              label: t.workspace.theme[value],
              checked: value === theme,
              separatorBefore: index === 0,
              onSelect: () => setTheme(value),
            })),
            { ...commandItem('workspace.saveProjectFile'), separatorBefore: true },
            commandItem('workspace.openProjectFile'),
            {
              label: t.workspace.newProject,
              onSelect: close,
            },
          ]}
        />
      </div>
    </header>
  );
}
