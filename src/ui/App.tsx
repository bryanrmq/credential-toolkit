import { IconContext } from '@phosphor-icons/react';
import { useEffect } from 'react';
import { startAutosave } from '../state/persistence';
import { useStore } from '../state/store';
import { ErrorBoundary } from './ErrorBoundary';
import { StartScreen } from './start/StartScreen';
import { Workspace } from './workspace/Workspace';

const ICONS = { weight: 'bold' as const, size: 16 };

export function App() {
  const hasProject = useStore((state) => state.project !== null);
  useEffect(() => startAutosave(), []);
  return (
    <IconContext.Provider value={ICONS}>
      <ErrorBoundary>{hasProject ? <Workspace /> : <StartScreen />}</ErrorBoundary>
    </IconContext.Provider>
  );
}
