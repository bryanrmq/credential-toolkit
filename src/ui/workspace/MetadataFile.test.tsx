// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ISSUER_METADATA_FILE_NAME, VCT_INTEGRITY_PLACEHOLDER, filePlaceholders, servedTypeMetadataUri, vctIntegrityCommand } from '../../core/export/issuerMetadata';
import { VCT_FILE_NAME } from '../../core/export/outputs';
import { exportProject } from '../../core/export/project';
import { emptyProject, ensureIssuer, newAttribute } from '../../core/model';
import type { Issue } from '../../core/validate';
import { IssuesContext } from '../issues';
import { MetadataFile } from './MetadataFile';

function project(issuerUrl?: string) {
  const result = emptyProject(['de-CH']);
  result.meta['de-CH'] = { name: 'Hundebewilligung', description: 'Für Hundehalter' };
  result.root.children.push(newAttribute('name', { source: ['name'], labels: { 'de-CH': 'Name' } }));
  result.hosting = { mode: 'dataUrl' };
  const issuer = ensureIssuer(result);
  issuer.name['de-CH'] = 'Kanton Bern';
  if (issuerUrl) issuer.url = issuerUrl;
  return result;
}

/** Both files and their placeholders, as the core gives them. */
async function files(issuerUrl?: string) {
  const exported = await exportProject(project(issuerUrl));
  if (!exported.ok) throw new Error('the test project has errors');
  const placeholders = (file: string) => filePlaceholders(exported).find((entry) => entry.file === file)!.placeholders;
  return {
    vct: { fileName: VCT_FILE_NAME, text: exported.vct.text, placeholders: placeholders(VCT_FILE_NAME) },
    issuer: { fileName: ISSUER_METADATA_FILE_NAME, text: exported.issuerMetadata.json, placeholders: placeholders(ISSUER_METADATA_FILE_NAME) },
  };
}

const anError = { severity: 'error', code: 'issuer-url-invalid', message: 'Enter a valid URL', summary: 'Enter a valid URL' } as unknown as Issue;

function show(file: Awaited<ReturnType<typeof files>>['vct'], issues: Issue[] = [], onIssuerUrl = () => {}) {
  return render(
    <IssuesContext.Provider value={issues}>
      <MetadataFile {...file} onIssuerUrl={onIssuerUrl} />
    </IssuesContext.Provider>,
  );
}

const placeholderList = () => screen.queryByRole('region', { name: 'Replace before use' });
const integrityBlock = () => screen.queryByRole('region', { name: 'After deploying, compute the integrity' });

let saved: Blob[];
beforeEach(() => {
  saved = [];
  URL.createObjectURL = vi.fn((blob: Blob) => {
    saved.push(blob);
    return 'blob:file';
  });
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

describe('A metadata file', () => {
  it('downloads and copies the exact text the core returns, under its file name, and shows its size', async () => {
    const { vct } = await files();
    const user = userEvent.setup();
    show(vct);

    // The header every output file shares: name, size, then Copy and Download, both secondary.
    expect(screen.getByText('vct.json')).toHaveClass('file-header__name');
    const download = screen.getByRole('button', { name: 'Download vct.json' });
    expect(download).toHaveTextContent('Download');
    expect(download).toHaveClass('btn--secondary');
    await user.click(download);
    expect(saved).toHaveLength(1);
    expect(await saved[0].text()).toBe(vct.text);

    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await navigator.clipboard.readText()).toBe(vct.text);
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();

    const bytes = new TextEncoder().encode(vct.text).length;
    expect(screen.getByText(`${(bytes / 1024).toFixed(1)} KB`)).toBeInTheDocument();
    expect(document.querySelector('pre')!.textContent).toBe(vct.text);
  });

  it('lists exactly the placeholders the core reports, with a count, and marks them in the text', async () => {
    const { issuer } = await files();
    show(issuer);
    expect(issuer.placeholders.map((entry) => entry.text)).toEqual(['${external-url}', VCT_INTEGRITY_PLACEHOLDER]);

    const list = within(placeholderList()!);
    expect(list.getByText('2')).toHaveClass('badge', 'badge--yellow');
    const rows = list.getAllByRole('listitem');
    expect(rows.map((row) => row.querySelector('code')!.textContent)).toEqual(issuer.placeholders.map((entry) => entry.text));
    expect(rows[0]).toHaveTextContent(issuer.placeholders[0].explanation);
    expect(screen.queryByText('Ready')).not.toBeInTheDocument();

    const marks = [...document.querySelectorAll('pre mark.placeholder')].map((mark) => mark.textContent);
    const occurrences = (text: string) => issuer.text.split(text).length - 1;
    expect(marks.filter((mark) => mark === '${external-url}')).toHaveLength(occurrences('${external-url}'));
    expect(marks.filter((mark) => mark === VCT_INTEGRITY_PLACEHOLDER)).toHaveLength(1);
    expect(document.querySelector('pre')!.textContent).toBe(issuer.text);
  });

  it('shows "Ready" when no placeholder is left', () => {
    show({ fileName: VCT_FILE_NAME, text: '{\n  "vct": "https://issuer.example.ch/oid4vci/vct/dog"\n}', placeholders: [] });
    expect(screen.getByText('Ready')).toHaveClass('badge', 'badge--green');
    expect(placeholderList()).not.toBeInTheDocument();
    expect(document.querySelector('pre mark')).not.toBeInTheDocument();
  });

  it('shows the integrity command without an Issuer URL, and copies it', async () => {
    const { issuer } = await files();
    const user = userEvent.setup();
    show(issuer);
    const block = within(integrityBlock()!);
    const command = vctIntegrityCommand(servedTypeMetadataUri(project()));
    expect(command).toContain("'${external-url}/oid4vci/vct/");
    expect(block.getByText(command)).toBeInTheDocument();
    await user.click(block.getByRole('button', { name: 'Copy command' }));
    expect(await navigator.clipboard.readText()).toBe(command);
  });

  it('offers the Issuer URL field instead of the command, without naming the page you are on', async () => {
    const { issuer } = await files();
    const onIssuerUrl = vi.fn();
    const user = userEvent.setup();
    show(issuer, [], onIssuerUrl);
    const block = integrityBlock()!;
    expect(block).toHaveTextContent('Or fill in Issuer URL to have it computed.');
    expect(block).not.toHaveTextContent('Metadata page');
    await user.click(within(block).getByRole('button', { name: 'Issuer URL' }));
    expect(onIssuerUrl).toHaveBeenCalledOnce();
  });

  it('leaves the integrity command out with an Issuer URL, where the file has the integrity', async () => {
    const { issuer } = await files('https://issuer.example.ch');
    show(issuer);
    expect(integrityBlock()).not.toBeInTheDocument();
    expect(issuer.text).not.toContain(VCT_INTEGRITY_PLACEHOLDER);
    expect(issuer.text).toMatch(/"vct_metadata_uri#integrity": "sha256-[A-Za-z0-9+/]+=*"/);
    expect(within(placeholderList()!).getAllByRole('listitem')).toHaveLength(1);
  });

  it('blocks the download while the project has errors, with the usual tooltip', async () => {
    const { vct } = await files();
    const user = userEvent.setup();
    show(vct, [anError]);
    const download = screen.getByRole('button', { name: 'Download vct.json' });
    expect(download).toBeDisabled();
    expect(download).toHaveAttribute('title', 'Fix 1 error to download');
    await user.click(download);
    expect(saved).toHaveLength(0);
    // Copy still works: the text is there to read.
    expect(screen.getByRole('button', { name: 'Copy' })).toBeEnabled();
  });
});
