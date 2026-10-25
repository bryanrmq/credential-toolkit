import { CaretDownIcon, FileArrowUpIcon, GlobeIcon } from '@phosphor-icons/react';
import { useCallback, useState } from 'react';
import { useStore } from '../../state/store';
import { t } from '../../strings';
import { PopupMenu, type PopupMenuItem } from '../components/PopupMenu';
import { Button } from '../components/controls';
import { chooseBaselineFile, hostingUrlOf, loadBaselineFromUrl } from '../lib/baseline';

/**
 * "Load published bundle": a dropdown that replaces the open draft's baseline, from the hosting URL or from a bundle
 * file. Without a hosting URL, "From the hosting URL" is still listed, disabled, saying where to set one. The project
 * itself never changes.
 * The Changes tab shows it as a secondary button with nothing to compare with, and a ghost one in its footer.
 */
export function LoadBaselineButton({ variant = 'secondary' }: { variant?: 'secondary' | 'ghost' }) {
  const canFetch = useStore((state) => hostingUrlOf(state.project) !== null);
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; returnFocus: HTMLElement } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  const items: PopupMenuItem[] = [
    {
      label: t.baseline.fromUrl,
      icon: <GlobeIcon />,
      disabled: !canFetch,
      hint: canFetch ? undefined : t.baseline.fromUrlHint,
      onSelect: () => void loadBaselineFromUrl(),
    },
    { label: t.baseline.fromFile, icon: <FileArrowUpIcon />, onSelect: chooseBaselineFile },
  ];

  return (
    <>
      <Button
        size="small"
        variant={variant}
        aria-haspopup="menu"
        aria-expanded={menu !== null}
        onClick={(event) => {
          const button = event.currentTarget;
          const rect = button.getBoundingClientRect();
          setMenu({ at: { x: rect.right, y: rect.bottom + 4 }, returnFocus: button });
        }}
      >
        {t.baseline.load} <CaretDownIcon />
      </Button>
      {menu && <PopupMenu label={t.baseline.load} at={menu.at} sections={[items]} returnFocus={menu.returnFocus} align="end" onClose={closeMenu} />}
    </>
  );
}
