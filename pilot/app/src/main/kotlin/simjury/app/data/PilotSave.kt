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
    /** Player's minted juror code (GROWTH.md M-2); null until verdict locks. */
    @SerialName("player_juror_code") val playerJurorCode: String? = null,
    /** Local jury bench seats filled by self + redeemed codes. */
    @SerialName("bench_seats") val benchSeats: List<simjury.app.share.BenchSeat> = emptyList(),
)
