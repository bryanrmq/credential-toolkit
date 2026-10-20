import { clearLink, suggestLinks } from '../../core/import/i14y';
import { type AttributeNode, walkNodes } from '../../core/model';
import { useStore } from '../../state/store';
import { t } from '../../strings';
import { Button } from '../components/controls';
import { linkToI14y, useI14yCatalogue } from '../lib/i14y';

/**
 * After a bundle is opened: how many attributes look like I14Y concepts, with Review (opens the
 * first) and Link for those with one clear match. Nothing is linked until the issuer confirms.
 */
export function I14yMatchBanner({ onReview }: { onReview: () => void }) {
  const project = useStore((state) => state.project)!;
  const review = useStore((state) => state.i14yReview);
  const { select, dismissI14yReview } = useStore.getState();
  const { catalogue } = useI14yCatalogue(review);
  if (!review || !catalogue) return null;

  const matched: { node: AttributeNode; clear?: string }[] = [];
  for (const { node } of walkNodes(project.root)) {
    if (node.kind !== 'attribute' || suggestLinks(node, catalogue, project.languages).length === 0) continue;
    matched.push({ node, clear: clearLink(node, catalogue, project.languages)?.id });
  }
  if (matched.length === 0) return null;
  const clear = matched.filter((match) => match.clear);
  const ambiguous = matched.length - clear.length;

  return (
    <section className="report" aria-label={t.i14yMatch.bannerRegion}>
      <div className="row row--between row--wrap">
        <p className="report__text">
          {t.i14yMatch.bannerBody(matched.length)} {ambiguous > 0 && t.i14yMatch.ambiguous(ambiguous)} {t.i14yMatch.linkHint}
        </p>
        <div className="row">
          <Button
            size="small"
            onClick={() => {
              select({ kind: 'node', id: matched[0].node.id });
              onReview();
            }}
          >
            {t.i14yMatch.review}
          </Button>
          {clear.length > 0 && (
            <Button size="small" variant="primary" onClick={() => void linkToI14y(clear.map((match) => ({ nodeId: match.node.id, conceptId: match.clear! })))}>
              {t.i14yMatch.linkAll(clear.length)}
            </Button>
          )}
          <Button size="small" variant="ghost" onClick={dismissI14yReview}>
            {t.i14yMatch.dismiss}
          </Button>
        </div>
      </div>
    </section>
  );
}
