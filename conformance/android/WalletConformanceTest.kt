package ch.admin.foitt.wallet.conformance

// Credential Toolkit conformance harness (conformance/android in bryanrmq/credential-toolkit).
// `run.sh` copies this file into the wallet checkout at the pinned tag and runs it as a unit test. It runs the
// wallet's own classes on the files `conformance/generate.ts` wrote, and writes `android.json` next to them.
// The only code here that is not the wallet's is plumbing, listed in conformance/README.md ("Shims"):
// constructing the classes instead of Hilt, reflection for `internal` openid4vc classes, and in-memory
// repositories that serve the generated files instead of the network.

import ch.admin.foitt.openid4vc.di.OpenId4VcModule
import ch.admin.foitt.openid4vc.domain.model.claimsPathPointer.toPointerString
import ch.admin.foitt.openid4vc.domain.model.credentialoffer.metadata.AnyCredentialConfiguration
import ch.admin.foitt.openid4vc.domain.model.vcSdJwt.FetchVcSchemaError
import ch.admin.foitt.openid4vc.domain.model.vcSdJwt.TypeMetadataRepositoryError
import ch.admin.foitt.openid4vc.domain.model.vcSdJwt.VcSchema
import ch.admin.foitt.openid4vc.domain.repository.TypeMetadataRepository
import ch.admin.foitt.openid4vc.domain.usecase.vcSdJwt.FetchTypeMetadata
import ch.admin.foitt.openid4vc.domain.usecase.vcSdJwt.FetchVcSchema
import ch.admin.foitt.sriValidator.domain.SRIValidator
import ch.admin.foitt.sriValidator.domain.implementation.SRIValidatorImpl
import ch.admin.foitt.wallet.platform.database.domain.model.Cluster
import ch.admin.foitt.wallet.platform.imageValidation.domain.usecase.implementation.ValidateImageImpl
import ch.admin.foitt.wallet.platform.oca.domain.model.OcaBundle
import ch.admin.foitt.wallet.platform.oca.domain.model.OcaRepositoryError
import ch.admin.foitt.wallet.platform.oca.domain.repository.OcaRepository
import ch.admin.foitt.wallet.platform.oca.domain.usecase.implementation.FetchDeferredVcMetadataByFormatImpl
import ch.admin.foitt.wallet.platform.oca.domain.usecase.implementation.FetchOcaBundleImpl
import ch.admin.foitt.wallet.platform.oca.domain.usecase.implementation.GenerateOcaClaimDataImpl
import ch.admin.foitt.wallet.platform.oca.domain.usecase.implementation.GenerateOcaClaimDisplaysImpl
import ch.admin.foitt.wallet.platform.oca.domain.usecase.implementation.GenerateOcaCredentialDataImpl
import ch.admin.foitt.wallet.platform.oca.domain.usecase.implementation.GenerateOcaDisplaysImpl
import ch.admin.foitt.wallet.platform.oca.domain.usecase.implementation.GetClaimsPathPointersImpl
import ch.admin.foitt.wallet.platform.oca.domain.usecase.implementation.GetRootCaptureBaseImpl
import ch.admin.foitt.wallet.platform.oca.domain.usecase.implementation.OcaBundlerImpl
import ch.admin.foitt.wallet.platform.oca.domain.usecase.implementation.OcaCaptureBaseValidatorImpl
import ch.admin.foitt.wallet.platform.oca.domain.usecase.implementation.OcaCesrHashValidatorImpl
import ch.admin.foitt.wallet.platform.oca.domain.usecase.implementation.OcaOverlayValidatorImpl
import ch.admin.foitt.wallet.platform.oca.domain.usecase.implementation.ResolveMetaDataIntegrityImpl
import ch.admin.foitt.wallet.platform.oca.domain.usecase.implementation.TransformOcaOverlaysImpl
import ch.admin.foitt.wallet.platform.utils.SafeJson
import ch.admin.foitt.wallet.platform.utils.di.UtilModule
import com.github.michaelbull.result.Ok
import com.github.michaelbull.result.Result
import com.github.michaelbull.result.get
import com.github.michaelbull.result.getError
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.junit.jupiter.api.Test
import java.io.File
import java.net.URL

class WalletConformanceTest {

    private val out = File(System.getenv("CONFORMANCE_OUT") ?: error("CONFORMANCE_OUT is not set"))

    // Shim: the Json Hilt gives the app's SafeJson (UtilModule.provideJsonSerializer).
    private val appSafeJson = SafeJson(UtilModule().provideJsonSerializer())

    // Shim: the openid4vc module's Json (OpenId4VcModule.provideJsonSerializer, internal: called by reflection).
    private val openId4VcJson: Json = OpenId4VcModule::class.java.declaredMethods
        .first { it.name.startsWith("provideJsonSerializer") }
        .also { it.isAccessible = true }
        .invoke(OpenId4VcModule()) as Json

    private val sriValidator: SRIValidator = SRIValidatorImpl()

    @Test
    fun `run the released wallet on every generated sample`(): Unit = runTest {
        val samples = Json.parseToJsonElement(File(out, "samples.json").readText()).jsonArray
        check(samples.isNotEmpty()) { "No samples in $out" }
        for (sample in samples) {
            val id = sample.jsonObject.getValue("id").jsonPrimitive.content
            val result = runSample(File(out, id))
            File(File(out, id), "android.json").writeText(pretty.encodeToString(JsonObject.serializer(), result))
        }
    }

    private suspend fun runSample(dir: File): JsonObject {
        val manifest = Json.parseToJsonElement(File(dir, "manifest.json").readText()).jsonObject
        fun field(name: String) = manifest.getValue(name).jsonPrimitive.content
        val bundleText = File(dir, "oca-bundle.json").readText()
        val served = mapOf(
            field("vctUrl") to File(dir, "vct.served.json").readText(),
        ) + (manifest["bundleUrl"]?.takeUnless { it is JsonNull }?.let { mapOf(it.jsonPrimitive.content to bundleText) } ?: emptyMap())
        val fetched = mutableListOf<String>()

        // Issuer metadata → type metadata → OCA bundle, each with its #integrity, as for a deferred credential
        // (FetchDeferredVcMetadataByFormatImpl), from the configuration the issuer serves.
        val configuration = parseConfiguration(File(dir, "issuer_metadata.served.json").readText(), field("configurationId"))
            ?: return rejected("issuer metadata", "credential configuration ${field("configurationId")} not found")
        val fetchMetadata = FetchDeferredVcMetadataByFormatImpl(
            resolveMetaDataIntegrity = ResolveMetaDataIntegrityImpl(),
            fetchTypeMetadata = fetchTypeMetadata(ServedTypeMetadata(served, fetched)),
            fetchVcSchema = NoVcSchema,
            fetchOcaBundle = FetchOcaBundleImpl(ocaRepository = ServedOcaBundles(served, fetched), sriValidator = sriValidator),
        )
        val vcMetadata = fetchMetadata(configuration)
        val rawBundle = vcMetadata.get()?.rawOcaBundle?.rawOcaBundle
            ?: return rejected("type metadata and OCA bundle", vcMetadata.getError()?.toString() ?: "no OCA bundle in the type metadata", fetched)

        // The bundle: CESR digests, capture bases, overlays (OcaBundlerImpl and the validators it calls).
        val bundler = OcaBundlerImpl(
            json = appSafeJson,
            ocaCesrHashValidator = OcaCesrHashValidatorImpl(safeJson = appSafeJson),
            ocaCaptureBaseValidator = OcaCaptureBaseValidatorImpl(),
            ocaOverlayValidator = OcaOverlayValidatorImpl(),
            transformOcaOverlays = TransformOcaOverlaysImpl(),
            getRootCaptureBase = GetRootCaptureBaseImpl(),
            generateOcaClaimData = GenerateOcaClaimDataImpl(),
            generateOcaCredentialData = GenerateOcaCredentialDataImpl(),
        )
        val bundle = bundler(rawBundle)
        val ocaBundle = bundle.get() ?: return rejected("OCA bundle", bundle.getError().toString(), fetched)

        // The displays for the credential's claims (GenerateOcaDisplaysImpl).
        val claims = Json.parseToJsonElement(File(dir, "credential.json").readText()).jsonObject
        val generateDisplays = GenerateOcaDisplaysImpl(
            getClaimsPathPointers = GetClaimsPathPointersImpl(),
            getRootCaptureBase = GetRootCaptureBaseImpl(),
            generateOcaClaimDisplays = GenerateOcaClaimDisplaysImpl(validateImage = ValidateImageImpl()),
        )
        val displays = generateDisplays(jsonObject = claims, credentialFormat = configuration.format.format, ocaBundle = ocaBundle)
        val metaDisplays = displays.get() ?: return rejected("displays", displays.getError().toString(), fetched)

        return buildJsonObject {
            put("accepted", true)
            put("fetched", JsonArray(fetched.map(::JsonPrimitive)))
            put("credentialFormat", configuration.format.format)
            put("credentialDisplays", buildJsonArray {
                for (display in metaDisplays.credentialDisplays) {
                    add(buildJsonObject {
                        put("locale", display.locale)
                        put("theme", display.theme)
                        put("name", display.name)
                        put("description", display.description)
                        put("logo", display.logo)
                        put("backgroundColor", display.backgroundColor)
                    })
                }
            })
            put("clusters", JsonArray(metaDisplays.clusters.map(::cluster)))
            put("claimData", claimData(ocaBundle))
        }
    }

    private fun cluster(cluster: Cluster): JsonObject = buildJsonObject {
        put("path", cluster.path)
        put("order", cluster.order)
        put("isSensitive", cluster.isSensitive)
        put("displays", buildJsonArray {
            for (display in cluster.clusterDisplays) add(buildJsonObject { put("locale", display.locale); put("name", display.name) })
        })
        put("claims", buildJsonArray {
            for ((claim, claimDisplays) in cluster.claims) {
                add(buildJsonObject {
                    put("path", claim.path)
                    put("value", claim.value)
                    put("valueType", claim.valueType)
                    put("valueDisplayInfo", claim.valueDisplayInfo)
                    put("order", claim.order)
                    put("isSensitive", claim.isSensitive)
                    put("displays", buildJsonArray {
                        for (display in claimDisplays) {
                            add(buildJsonObject { put("locale", display.locale); put("name", display.name); put("value", display.value) })
                        }
                    })
                })
            }
        })
        put("childClusters", JsonArray(cluster.childClusters.map(::cluster)))
    }

    private fun claimData(ocaBundle: OcaBundle): JsonArray = buildJsonArray {
        for (data in ocaBundle.ocaClaimData) {
            add(buildJsonObject {
                put("captureBaseDigest", data.captureBaseDigest)
                put("name", data.name)
                put("attributeType", data.attributeType.toString())
                put("dataSources", JsonObject(data.dataSources.mapValues { (_, path) -> Json.parseToJsonElement(path.toPointerString()) }))
                put("labels", JsonObject(data.labels.mapValues { (_, label) -> JsonPrimitive(label) }))
                put("entryMappings", JsonObject(data.entryMappings.mapValues { (_, entries) -> JsonObject(entries.mapValues { (_, label) -> JsonPrimitive(label) }) }))
                put("format", data.format)
                put("characterEncoding", data.characterEncoding?.toString())
                put("standard", data.standard?.toString())
                put("order", data.order)
                put("isSensitive", data.isSensitive)
            })
        }
    }

    private fun rejected(step: String, error: String, fetched: List<String> = emptyList()) = buildJsonObject {
        put("accepted", false)
        put("step", step)
        put("error", error)
        put("fetched", JsonArray(fetched.map(::JsonPrimitive)))
    }

    // Shim: `credential_configurations_supported` decoded with openid4vc's own (internal) list serializer, which
    // IssuerCredentialInfo uses. The whole IssuerCredentialInfo is not decoded: the generic issuer adds the
    // encryption fields it requires when it serves the file, and those are not ours.
    @Suppress("UNCHECKED_CAST")
    private fun parseConfiguration(issuerMetadata: String, id: String): AnyCredentialConfiguration? {
        val serializer = Class.forName("ch.admin.foitt.openid4vc.domain.model.AnyCredentialConfigurationListSerializer")
            .getField("INSTANCE").get(null) as KSerializer<List<AnyCredentialConfiguration>>
        val configurations = openId4VcJson.parseToJsonElement(issuerMetadata).jsonObject.getValue("credential_configurations_supported")
        return openId4VcJson.decodeFromJsonElement(serializer, configurations).firstOrNull { it.identifier == id }
    }

    // Shim: FetchTypeMetadataImpl and openid4vc's SafeJson are internal to openid4vc; Hilt builds them the same way.
    private fun fetchTypeMetadata(repository: TypeMetadataRepository): FetchTypeMetadata {
        val safeJson = Class.forName("ch.admin.foitt.openid4vc.utils.SafeJson").getDeclaredConstructor(Json::class.java)
            .also { it.isAccessible = true }
            .newInstance(openId4VcJson)
        return Class.forName("ch.admin.foitt.openid4vc.domain.usecase.vcSdJwt.implementation.FetchTypeMetadataImpl")
            .declaredConstructors.single()
            .also { it.isAccessible = true }
            .newInstance(repository, safeJson, sriValidator) as FetchTypeMetadata
    }

    // Shim: the network. Serves the generated files at their URLs, as the issuer would.
    private class ServedTypeMetadata(private val files: Map<String, String>, private val fetched: MutableList<String>) : TypeMetadataRepository {
        override suspend fun fetchTypeMetadata(url: URL): Result<String, TypeMetadataRepositoryError> {
            fetched += url.toString()
            return Ok(files[url.toString()] ?: error("Nothing is served at $url"))
        }
    }

    private class ServedOcaBundles(private val files: Map<String, String>, private val fetched: MutableList<String>) : OcaRepository {
        override suspend fun fetchOcaBundleByUrl(url: URL): Result<String, OcaRepositoryError> {
            fetched += url.toString()
            return Ok(files[url.toString()] ?: error("Nothing is served at $url"))
        }
    }

    // Shim: the generated Type Metadata has no `schema_uri`, so the wallet never fetches a schema.
    private object NoVcSchema : FetchVcSchema {
        override suspend fun invoke(schemaUrl: URL, schemaUriIntegrity: String?): Result<VcSchema, FetchVcSchemaError> =
            error("The Type Metadata has no schema_uri, so no schema is fetched")
    }

    private companion object {
        val pretty = Json { prettyPrint = true }
    }
}
