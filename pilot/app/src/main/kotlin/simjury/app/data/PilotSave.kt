package simjury.app.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import simjury.deliberation.DeliberationState

@Serializable
data class PilotSave(
    @SerialName("schema_version") val schemaVersion: Int = 1,
    @SerialName("case_id") val caseId: String,
    val seed: Long,
    @SerialName("engine_state") val engineState: DeliberationState,
    @SerialName("verdict_locked") val verdictLocked: Boolean = false,
    @SerialName("reveal_shown") val revealShown: Boolean = false,
    /** Per-playthrough tag baked into this juror's shareable code (GROWTH.md M-2). */
    @SerialName("juror_tag") val jurorTag: String = "",
    /** Normalized juror codes seated on the bench, in seating order. */
    @SerialName("bench_codes") val benchCodes: List<String> = emptyList(),
)
