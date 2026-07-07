package simjury.deliberation

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

val deliberationJson = Json {
    ignoreUnknownKeys = false
    isLenient = false
    explicitNulls = false
    encodeDefaults = true
}

@Serializable
enum class DeliberationPhase {
    SUMMONS,
    READING,
    DIARY,
    VOTE,
    REVEAL,
    COMPLETE,
}

@Serializable
data class DeliberationEvent(
    val seq: Int,
    val phase: DeliberationPhase,
    val kind: String,
    val detail: String = "",
)

@Serializable
data class DiarySnapshot(
    val leaning: String,
    val topReason: String,
    val strongestDoubt: String,
)

@Serializable
data class DeliberationState(
    val caseId: String,
    val seed: Long,
    val phase: DeliberationPhase = DeliberationPhase.SUMMONS,
    val itemsRead: Set<String> = emptySet(),
    val diary: DiarySnapshot? = null,
    val vote: String? = null,
    val verdictLocked: Boolean = false,
    val revealComplete: Boolean = false,
    val eventLog: List<DeliberationEvent> = emptyList(),
)

@Serializable
sealed class DeliberationAction {
    @Serializable
    data object AcknowledgeSummons : DeliberationAction()

    @Serializable
    data class MarkItemRead(val itemId: String) : DeliberationAction()

    @Serializable
    data object OpenDiary : DeliberationAction()

    @Serializable
    data class CommitDiary(
        val leaning: String,
        val topReason: String,
        val strongestDoubt: String,
    ) : DeliberationAction()

    @Serializable
    data class CastVote(val position: String) : DeliberationAction()

    @Serializable
    data object OpenReveal : DeliberationAction()

    @Serializable
    data object ResetForReplay : DeliberationAction()
}

class IllegalDeliberationTransition(
    message: String,
) : Exception(message)
