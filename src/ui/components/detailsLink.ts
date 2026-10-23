import { type HTMLAttributes, createContext, useContext } from 'react';

/**
 * How a details screen is linked to the editor: the node the editor has selected, whose rows and groups are
 * outlined, and what picking a row or a group title does. Without a provider nothing is linked.
 */
export interface DetailsLink {
  selected?: string;
  pick?: (id: string) => void;
}

export const DetailsLinkContext = createContext<DetailsLink>({});

export const useDetailsLink = () => useContext(DetailsLinkContext);

/** `data-linked` on an element drawn for `nodeId` while the editor has that node selected. */
export function linkedProps(link: DetailsLink, nodeId: string | undefined): { 'data-linked'?: '' } {
  return nodeId !== undefined && nodeId === link.selected ? { 'data-linked': '' } : {};
}

/**
 * A claim row's role: a button that picks its attribute, or a plain group for a row no attribute maps to (an
 * unmatched sample claim).
 */
export function rowProps(link: DetailsLink, nodeId: string | undefined): HTMLAttributes<HTMLElement> {
  const { pick } = link;
  if (nodeId === undefined || !pick) return { role: 'group' };
  return {
    role: 'button',
    tabIndex: 0,
    onClick: () => pick(nodeId),
    onKeyDown: (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      pick(nodeId);
    },
    ...linkedProps(link, nodeId),
  };
}
