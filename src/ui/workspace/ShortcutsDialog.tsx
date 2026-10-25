import { t } from '../../strings';
import { Button, Dialog } from '../components/controls';
import { COMMANDS, type CommandScope, commandLabel, shortcutLabel } from '../lib/commands';

const SECTIONS: Array<{ scope: CommandScope; title: string }> = [
  { scope: 'tree', title: t.shortcuts.tree },
  { scope: 'workspace', title: t.shortcuts.workspace },
];

/**
 * Every shortcut of the command list (`commands.ts`), the tree's and the workspace's, with the keys labelled for the
 * platform. `?` opens it, as do the ⋯ menu and the palette. It lists the commands whatever applies now.
 */
export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title={t.commands.shortcuts} intro={t.shortcuts.intro} onClose={onClose} className="dialog--shortcuts">
      <div className="shortcuts-columns">
        {SECTIONS.map(({ scope, title }) => (
          <section key={scope} className="shortcuts" aria-label={title}>
            <h3 className="shortcuts__title">{title}</h3>
            <dl className="shortcuts__list">
              {COMMANDS.filter((entry) => entry.scope === scope && entry.keys).map((entry) => (
                <div key={entry.id} className="shortcuts__row">
                  <dt>{commandLabel(entry.id, 'shortcuts')}</dt>
                  <dd>
                    <kbd>{shortcutLabel(entry.id)}</kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <div className="dialog__actions">
        <Button onClick={onClose}>{t.shortcuts.close}</Button>
      </div>
    </Dialog>
  );
}
