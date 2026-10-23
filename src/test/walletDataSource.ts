/**
 * Test-only port of how the swiyu wallets find an attribute's claims path, written without the production
 * code so that it checks the exporter independently.
 *
 * Both wallets take the capture base's Data Source overlays of the newest version and map each attribute to
 * `{ format: path }` (iOS `OverlayBundleAttributesGenerator.getDataSourcesForAttributes`, Android
 * `GenerateOcaClaimDataImpl.getDataSourcesForAttributes`). They then look the path up by format:
 * - iOS v1.18.0: always `vc+sd-jwt` (`VcSdJwt+AnyCredential.format`, `OcaClusterGenerator` L82).
 * - iOS v1.19.0: the credential's JWT `typ`, then the other format (`OcaClusterGenerator.getDataSource`).
 * - Android v1.19.0: the `format` of the issuer metadata's credential configuration, exact match only
 *   (`GenerateOcaDisplaysImpl` L98).
 */
type Overlay = Record<string, unknown> & { type: string; capture_base: string };
type Bundle = { overlays: Overlay[] };

export type CredentialFormat = 'vc+sd-jwt' | 'dc+sd-jwt';
export type Wallet = 'ios-1.18' | 'ios-1.19' | 'android-1.19';

const DATA_SOURCE_TYPES = ['extend/overlays/data_source/2.0', 'extend/overlays/data_source/1.0'];

export function walletDataSources(bundle: Bundle, captureBase: string): Map<string, Map<string, unknown>> {
  const overlays = bundle.overlays.filter((overlay) => overlay.capture_base === captureBase);
  const latest = DATA_SOURCE_TYPES.find((type) => overlays.some((overlay) => overlay.type === type));
  const sources = new Map<string, Map<string, unknown>>();
  for (const overlay of overlays.filter((candidate) => candidate.type === latest)) {
    for (const [attribute, path] of Object.entries(overlay.attribute_sources as Record<string, unknown>)) {
      if (!sources.has(attribute)) sources.set(attribute, new Map());
      sources.get(attribute)!.set(overlay.format as string, path);
    }
  }
  return sources;
}

/** The path `wallet` uses for a credential in `format` (`typ` on iOS 1.19, issuer metadata on Android), or undefined. */
export function walletPath(sources: Map<string, unknown> | undefined, wallet: Wallet, format: CredentialFormat): unknown {
  if (!sources) return undefined;
  const other: CredentialFormat = format === 'vc+sd-jwt' ? 'dc+sd-jwt' : 'vc+sd-jwt';
  switch (wallet) {
    case 'ios-1.18':
      return sources.get('vc+sd-jwt');
    case 'ios-1.19':
      return sources.get(format) ?? sources.get(other);
    case 'android-1.19':
      return sources.get(format);
  }
}
