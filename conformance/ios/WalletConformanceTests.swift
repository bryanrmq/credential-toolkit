// Credential Toolkit conformance harness (conformance/ios in bryanrmq/credential-toolkit).
// `run.sh` copies this file into the wallet checkout at the pinned tag (BITOpenIDTests, which already imports
// BITOca) and runs it on an iOS simulator. It runs the wallet's own code on the files `conformance/generate.ts`
// wrote, and writes `ios.json` next to them. The only code here that is not the wallet's is plumbing, listed in
// conformance/README.md ("Shims"): the repositories that would fetch over the network serve the generated files.

import BITCore
import BITNetworking
import Factory
import Foundation
import Moya
import XCTest
@testable import BITOca
@testable import BITOpenID

// MARK: - WalletConformanceTests

final class WalletConformanceTests: XCTestCase {

  func testReleasedWalletOnEverySample() async throws {
    let out = try URL(fileURLWithPath: XCTUnwrap(ProcessInfo.processInfo.environment["CONFORMANCE_OUT"], "CONFORMANCE_OUT is not set"))
    let samples = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: out.appendingPathComponent("samples.json"))) as? [[String: Any]])
    XCTAssertFalse(samples.isEmpty)
    for sample in samples {
      let dir = try out.appendingPathComponent(XCTUnwrap(sample["id"] as? String))
      let result = await run(dir)
      try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys])
        .write(to: dir.appendingPathComponent("ios.json"))
    }
  }

  // MARK: Private

  private func run(_ dir: URL) async -> [String: Any] {
    var step = "issuer metadata"
    // Shim: the network. The type metadata and the bundle are served at their URLs, as the issuer would.
    let typeMetadataRepository = OpenIDRepositoryProtocolSpy()
    do {
      let manifest = try object(dir.appendingPathComponent("manifest.json"))
      let configurationId = try XCTUnwrap(manifest["configurationId"] as? String)
      let vctUrl = try XCTUnwrap(manifest["vctUrl"] as? String)
      let vctData = try Data(contentsOf: dir.appendingPathComponent("vct.served.json"))
      let bundleData = try Data(contentsOf: dir.appendingPathComponent("oca-bundle.json"))

      // The credential configuration, decoded as the wallet decodes `credential_configurations_supported` entries.
      // The whole Credential Issuer Metadata is not: the wallet takes it signed (a JWT) from the generic issuer,
      // which adds the fields and the signature itself.
      let issuerMetadata = try object(dir.appendingPathComponent("issuer_metadata.served.json"))
      let configurations = try XCTUnwrap(issuerMetadata["credential_configurations_supported"] as? [String: Any])
      let configurationJson = try XCTUnwrap(configurations[configurationId], "credential configuration \(configurationId) not found")
      let configuration = try JSONDecoder().decode(
        CredentialIssuerMetadata.VcSdJwtCredentialConfigurationSupported.self,
        from: JSONSerialization.data(withJSONObject: configurationJson))

      typeMetadataRepository.fetchTypeMetadataFromClosure = { url in
        guard url.absoluteString == vctUrl else { throw ConformanceError.notServed(url) }
        // As OpenIDRepository.fetchTypeMetadata: NetworkService decodes the body with NetworkContainer's decoder.
        let typeMetadata = try NetworkContainer.shared.decoder().decode(TypeMetadata.self, from: vctData)
        return (object: typeMetadata, response: Moya.Response(statusCode: 200, data: vctData))
      }
      Container.shared.openIDRepository.register { typeMetadataRepository }
      let bundleUrl = manifest["bundleUrl"] as? String
      Container.shared.ocaRepository.register { ServedBundle(url: bundleUrl, data: bundleData) }

      // Type metadata and OCA bundle, each with its #integrity (TypeMetadataService, OCABundleService).
      step = "type metadata and OCA bundle"
      let (_, rawBundle) = try await FetchVcMetadataForVcSdJwtUseCase().execute(metadata: configuration)
      guard let rawBundle else { return rejected(step, "no OCA bundle in the type metadata", typeMetadataRepository) }

      // The bundle: CESR digests, capture bases, overlays (OcaBundler).
      step = "OCA bundle"
      let bundle = try Container.shared.ocaBundler().createOcaBundle(rawBundle)

      step = "displays"
      let displays = Container.shared.captureBaseDisplayGenerator().generate(from: bundle)
      let attributes = OverlayBundleAttributesGenerator().generate(from: bundle)

      // The card display the wallet shows on a phone set to each project language: the root capture base's displays
      // (OcaCredentialGenerator), picked with `findDisplayWithFallback`.
      // Shim: the phone's languages (`Locale.preferredLanguages`) are set to each project language in turn.
      let languages = try XCTUnwrap(manifest["languages"] as? [String])
      let candidates = displays.enumerated()
        .filter { $0.element.captureBaseDigest == bundle.rootCaptureBaseDigest }
        .map { DisplayCandidate(locale: $0.element.language, index: $0.offset) }
      var pickedCaptureBaseDisplay: [String: Any] = [:]
      for language in languages {
        Container.shared.preferredUserLocales.register { [language] }
        pickedCaptureBaseDisplay[language] = orNull(candidates.findDisplayWithFallback()?.index)
      }
      Container.shared.preferredUserLocales.reset()

      return try [
        "accepted": true,
        "fetched": typeMetadataRepository.fetchTypeMetadataFromReceivedInvocations.map(\.absoluteString),
        "captureBaseDisplays": displays.map { self.display($0) },
        "pickedCaptureBaseDisplay": pickedCaptureBaseDisplay,
        "attributes": attributes.map { try self.attribute($0) },
      ]
    } catch {
      return rejected(step, String(describing: error), typeMetadataRepository)
    }
  }

  private func display(_ display: CaptureBaseDisplay) -> [String: Any] {
    [
      "captureBaseDigest": display.captureBaseDigest,
      "language": display.language,
      "theme": orNull(display.theme),
      "logo": orNull(display.logo?.absoluteString),
      "primaryBackgroundColor": orNull(display.primaryBackgroundColor),
      "primaryField": orNull(display.primaryField),
      "secondaryField": orNull(display.secondaryField),
      "metaName": orNull(display.metaName),
      "metaDescription": orNull(display.metaDescription),
    ]
  }

  private func attribute(_ attribute: OverlayBundleAttribute) throws -> [String: Any] {
    try [
      "captureBaseDigest": attribute.captureBaseDigest,
      "name": attribute.name,
      "attributeType": String(describing: attribute.attributeType),
      "characterEncoding": orNull(attribute.characterEncoding.map { String(describing: $0) }),
      "dataSources": attribute.dataSources.mapValues { try JSONSerialization.jsonObject(with: JSONEncoder().encode($0)) },
      "entryMapping": attribute.entryMapping,
      "format": orNull(attribute.format),
      "labels": attribute.labels,
      "order": orNull(attribute.order),
      "isSensitive": attribute.isSensitive,
      "standard": orNull(attribute.standard.map { String(describing: $0) }),
    ]
  }

  private func rejected(_ step: String, _ error: String, _ repository: OpenIDRepositoryProtocolSpy) -> [String: Any] {
    [
      "accepted": false,
      "step": step,
      "error": error,
      "fetched": repository.fetchTypeMetadataFromReceivedInvocations.map(\.absoluteString),
    ]
  }

  private func object(_ url: URL) throws -> [String: Any] {
    try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
  }

  private func orNull(_ value: Any?) -> Any {
    value ?? NSNull()
  }

}

// MARK: - ServedBundle

/// Shim: the network. OCARepository fetches the bundle from its hosting URL; this serves the generated file there.
private struct ServedBundle: OCARepositoryProtocol {
  let url: String?
  let data: Data

  func fetchOCABundle(from url: URL) async throws -> RawOcaBundle {
    guard url.absoluteString == self.url else { throw ConformanceError.notServed(url) }
    return data
  }
}

// MARK: - DisplayCandidate

/// Shim: a capture base display as the `DisplayLocalizable` the screens pick from, with its language as locale.
private struct DisplayCandidate: DisplayLocalizable {
  let locale: UserLocale?
  let index: Int
}

// MARK: - ConformanceError

private enum ConformanceError: Error {
  case notServed(URL)
}
