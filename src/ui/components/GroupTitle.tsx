import type { ReactNode } from 'react';
import { useDetailsLink } from './detailsLink';

/** A group title's text, as a button that picks the group when it comes from a node. */
export function GroupTitle({ nodeId, children }: { nodeId: string | undefined; children: ReactNode }) {
  const { pick } = useDetailsLink();
  if (nodeId === undefined || !pick) return children;
  return (
    <button type="button" className="details-link__title" onClick={() => pick(nodeId)}>
      {children}
    </button>
  );
}
