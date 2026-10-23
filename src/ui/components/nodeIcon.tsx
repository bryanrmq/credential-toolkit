import {
  BinaryIcon,
  CalendarBlankIcon,
  FolderSimpleIcon,
  HashIcon,
  ImageIcon,
  ListBulletsIcon,
  StackIcon,
  TextTIcon,
  ToggleLeftIcon,
} from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { KNOWN_STANDARDS, type Node, isArrayType } from '../../core/model';

/** A node's type icon, as the Structure tree and the command palette show it. */
export function nodeIcon(node: Node): ReactNode {
  if (node.kind === 'group') return node.array ? <StackIcon /> : <FolderSimpleIcon />;
  const type = isArrayType(node.type) ? node.type.array : node.type;
  if (isArrayType(node.type)) return <ListBulletsIcon />;
  if (node.standard === KNOWN_STANDARDS.dataUrl) return <ImageIcon />;
  if (type === 'Numeric') return <HashIcon />;
  if (type === 'Boolean') return <ToggleLeftIcon />;
  if (type === 'DateTime') return <CalendarBlankIcon />;
  if (type === 'Binary') return <BinaryIcon />;
  return <TextTIcon />;
}
