import { useEffect } from 'react';
import { t } from '../../strings';
import { Button, Dialog } from '../components/controls';
import { useTranslationState } from '../lib/translate';

/**
 * Before the browser downloads a translation model: which pairs, and that the text stays on the device.
 * Cancel, Escape or a click outside does nothing at all.
 */
export function TranslationNotice() {
  const notice = useTranslationState((state) => state.notice);
  // A notice still open when the workspace goes is a Cancel, so the translation it holds ends.
  useEffect(() => () => useTranslationState.getState().notice?.answer(false), []);
  if (!notice) return null;
  const cancel = () => notice.answer(false);
  return (
    <Dialog className="dialog--notice" title={t.translate.noticeTitle} intro={t.translate.notice(notice.pairs)} onClose={cancel}>
      <div className="dialog__actions">
        <Button variant="ghost" onClick={cancel}>
          {t.translate.cancel}
        </Button>
        <Button variant="primary" autoFocus onClick={() => notice.answer(true)}>
          {t.translate.download}
        </Button>
      </div>
    </Dialog>
  );
}
