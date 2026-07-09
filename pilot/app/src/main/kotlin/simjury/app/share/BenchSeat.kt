package simjury.app.share

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * One seat on the local jury bench (GROWTH.md M-2). Seat 1 is always the player;
 * seats 2–12 are filled by redeeming friends' juror codes after the player's own
 * verdict is locked.
 */
@Serializable
data class BenchSeat(
    val seat: Int,
    @SerialName("case_id") val caseMetaId: String,
    val vote: String,
    val leaning: String,
    /** Full juror code that filled this seat (player's own mint, or a redeemed code). */
    val code: String,
    /** True for the local player (seat 1). */
    val self: Boolean = false,
)
