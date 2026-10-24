import { useEffect, useState } from 'react';
import { type BundleJson, buildBundle } from '../core/export/bundle';
import { type BuiltIssuerMetadata, buildIssuerMetadata, vctMetadataIntegrity } from '../core/export/issuerMetadata';
import { type ExportOutputs, buildOutputs } from '../core/export/outputs';
import { type BuiltTypeMetadata, buildTypeMetadata } from '../core/export/typeMetadata';
import type { Project } from '../core/model';

export type ExportState =
  | { status: 'working' }
  | { status: 'ready'; bundle: BundleJson; outputs: ExportOutputs; vct: BuiltTypeMetadata; issuerMetadata: BuiltIssuerMetadata }
  | { status: 'failed'; error: string };

const EXPORT_DELAY_MS = 150;

/**
 * Rebuilds the bundle, its outputs, the Type Metadata and the Issuer Metadata shortly after the project changes, as
 * `exportProject` does but whatever the issues: the pane shows the files while the user fixes them.
 */
export function useExport(project: Project | null): ExportState {
  const [state, setState] = useState<ExportState>({ status: 'working' });
  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const { bundle } = await buildBundle(project);
        const outputs = await buildOutputs(project, bundle);
        const vct = buildTypeMetadata(project, outputs);
        const issuerMetadata = buildIssuerMetadata(project, await vctMetadataIntegrity(project, vct.text));
        if (!cancelled) setState({ status: 'ready', bundle, outputs, vct, issuerMetadata });
      } catch (error) {
        if (!cancelled) setState({ status: 'failed', error: error instanceof Error ? error.message : String(error) });
      }
    }, EXPORT_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [project]);
  return state;
}
