package simjury.casemodel

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

val caseJson = Json {
    ignoreUnknownKeys = false
    isLenient = false
    explicitNulls = false
}

@Serializable
data class PilotCase(
    val id: String,
    @SerialName("title_play") val titlePlay: String,
    @SerialName("title_reveal") val titleReveal: String,
    val synthetic: Boolean = false,
    @SerialName("schema_version") val schemaVersion: String,
    val charge: Charge,
    @SerialName("episode_ids") val episodeIds: List<String>,
    @SerialName("content_notes") val contentNotes: List<String> = emptyList(),
    @SerialName("estimated_minutes") val estimatedMinutes: Int = 5,
)

@Serializable
data class Charge(
    val label: String,
    val elements: List<String>,
)

@Serializable
data class SourceRef(
    @SerialName("source_id") val sourceId: String,
    val locator: String,
)

@Serializable
data class SourceEntry(
    val id: String,
    val citation: String,
    @SerialName("public_domain_basis") val publicDomainBasis: String,
    @SerialName("url_if_any") val urlIfAny: String? = null,
)

@Serializable
data class SourcesFile(val sources: List<SourceEntry>)

@Serializable
data class PseudonymEntry(
    val id: String,
    @SerialName("play_name") val playName: String,
    @SerialName("real_name") val realName: String,
    val role: String,
)

@Serializable
data class PseudonymsFile(val entries: List<PseudonymEntry>)

@Serializable
data class TestimonyBlock(
    val id: String,
    val mode: String,
    val fidelity: String,
    val text: String,
    val source: SourceRef,
)

@Serializable
data class Witness(
    val id: String,
    @SerialName("pseudonym_ref") val pseudonymRef: String,
    @SerialName("role_label") val roleLabel: String,
    @SerialName("called_by") val calledBy: String,
    val blocks: List<TestimonyBlock>,
)

@Serializable
data class Exhibit(
    val id: String,
    val title: String,
    val kind: String,
    val text: String,
    @SerialName("prosecution_claim") val prosecutionClaim: String,
    @SerialName("defence_claim") val defenceClaim: String,
    val source: SourceRef,
)

@Serializable
data class Direction(
    val id: String,
    val title: String,
    val text: String,
    val source: SourceRef,
    val citable: Boolean = true,
)

@Serializable
data class Episode(
    val id: String,
    val title: String,
    @SerialName("intro_text") val introText: String,
    @SerialName("item_order") val itemOrder: List<String>,
)

@Serializable
data class TrialFile(
    val episodes: List<Episode>,
    val witnesses: List<Witness>,
    val exhibits: List<Exhibit>,
    val directions: List<Direction>,
)

@Serializable
data class TruthLayer(val heading: String, val body: String)

@Serializable
data class PseudonymReveal(
    @SerialName("pseudonym_ref") val pseudonymRef: String,
    @SerialName("play_name") val playName: String,
    @SerialName("real_name") val realName: String,
    @SerialName("fate_note") val fateNote: String,
)

@Serializable
data class TruthFile(
    val layers: List<TruthLayer>,
    @SerialName("pseudonym_reveal") val pseudonymReveal: List<PseudonymReveal>,
)

@Serializable
data class VerdictDiary(
    val leaning: String,
    val topReason: String,
    val strongestDoubt: String,
)

@Serializable
data class Verdict(val position: String)

data class LoadedCase(
    val meta: PilotCase,
    val trial: TrialFile,
    val pseudonyms: PseudonymsFile,
    val sources: SourcesFile,
    val truthFile: TruthFile,
)

data class GatedTruth(
    val titleReveal: String,
    val truthFile: TruthFile,
    val pseudonymRealNames: Map<String, String>,
)
