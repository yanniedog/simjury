package simjury.deliberation

/**
 * Pure pilot deliberation stub: (State, Action, Seed) -> State with append-only event log.
 * Deterministic for identical action sequences and seed.
 */
object PilotDeliberationEngine {

    private val allowedLeanings = setOf("G", "NG", "U")

    fun initialState(
        caseId: String,
        seed: Long,
        expectedItemIds: Set<String> = emptySet(),
    ): DeliberationState =
        DeliberationState(caseId = caseId, seed = seed, expectedItemIds = expectedItemIds)

    fun step(state: DeliberationState, action: DeliberationAction, seed: Long): DeliberationState {
        require(state.seed == seed) { "Seed mismatch: state=${state.seed}, arg=$seed" }
        return when (action) {
            is DeliberationAction.AcknowledgeSummons -> onSummons(state, action)
            is DeliberationAction.MarkItemRead -> onMarkItemRead(state, action)
            is DeliberationAction.OpenDiary -> onOpenDiary(state, action)
            is DeliberationAction.CommitDiary -> onCommitDiary(state, action)
            is DeliberationAction.CastVote -> onCastVote(state, action)
            is DeliberationAction.OpenReveal -> onOpenReveal(state, action)
            is DeliberationAction.ResetForReplay -> onReset(state, action)
        }
    }

    fun reduce(state: DeliberationState, actions: List<DeliberationAction>, seed: Long): DeliberationState =
        actions.fold(state) { s, action -> step(s, action, seed) }

    private fun onSummons(
        state: DeliberationState,
        action: DeliberationAction.AcknowledgeSummons,
    ): DeliberationState {
        if (state.phase != DeliberationPhase.SUMMONS) {
            throw IllegalDeliberationTransition("AcknowledgeSummons invalid in ${state.phase}")
        }
        return state
            .withPhase(DeliberationPhase.READING)
            .withEvent("summons_acknowledged")
    }

    private fun onMarkItemRead(
        state: DeliberationState,
        action: DeliberationAction.MarkItemRead,
    ): DeliberationState {
        if (state.phase != DeliberationPhase.READING) {
            throw IllegalDeliberationTransition("MarkItemRead invalid in ${state.phase}")
        }
        if (action.itemId.isBlank()) {
            throw IllegalDeliberationTransition("MarkItemRead requires non-blank itemId")
        }
        if (action.itemId in state.itemsRead) {
            return state.withEvent("item_already_read", action.itemId)
        }
        return state
            .copy(itemsRead = state.itemsRead + action.itemId)
            .withEvent("item_read", action.itemId)
    }

    private fun onOpenDiary(
        state: DeliberationState,
        action: DeliberationAction.OpenDiary,
    ): DeliberationState {
        if (state.phase != DeliberationPhase.READING) {
            throw IllegalDeliberationTransition("OpenDiary invalid in ${state.phase}")
        }
        if (state.expectedItemIds.isNotEmpty()) {
            val unread = state.expectedItemIds - state.itemsRead
            if (unread.isNotEmpty()) {
                throw IllegalDeliberationTransition(
                    "OpenDiary blocked until all items read (${unread.size} unread)",
                )
            }
        }
        return state
            .withPhase(DeliberationPhase.DIARY)
            .withEvent("diary_opened")
    }

    private fun onCommitDiary(
        state: DeliberationState,
        action: DeliberationAction.CommitDiary,
    ): DeliberationState {
        if (state.phase != DeliberationPhase.DIARY) {
            throw IllegalDeliberationTransition("CommitDiary invalid in ${state.phase}")
        }
        if (action.leaning !in allowedLeanings) {
            throw IllegalDeliberationTransition("Leaning must be one of: ${allowedLeanings.joinToString()}")
        }
        if (action.topReason.length < 10 || action.strongestDoubt.length < 10) {
            throw IllegalDeliberationTransition("Diary fields must be at least 10 characters")
        }
        val diary = DiarySnapshot(action.leaning, action.topReason, action.strongestDoubt)
        return state
            .copy(diary = diary, phase = DeliberationPhase.VOTE)
            .withEvent("diary_committed", action.leaning)
    }

    private fun onCastVote(
        state: DeliberationState,
        action: DeliberationAction.CastVote,
    ): DeliberationState {
        if (state.phase != DeliberationPhase.VOTE) {
            throw IllegalDeliberationTransition("CastVote invalid in ${state.phase}")
        }
        if (action.position !in setOf("Guilty", "Not Guilty")) {
            throw IllegalDeliberationTransition("Vote must be Guilty or Not Guilty")
        }
        return state
            .copy(vote = action.position, verdictLocked = true, phase = DeliberationPhase.REVEAL)
            .withEvent("verdict_locked", action.position)
    }

    private fun onOpenReveal(
        state: DeliberationState,
        action: DeliberationAction.OpenReveal,
    ): DeliberationState {
        if (state.phase != DeliberationPhase.REVEAL) {
            throw IllegalDeliberationTransition("OpenReveal invalid in ${state.phase}")
        }
        if (!state.verdictLocked) {
            throw IllegalDeliberationTransition("Reveal blocked until verdict is locked")
        }
        return state
            .copy(revealComplete = true, phase = DeliberationPhase.COMPLETE)
            .withEvent("reveal_opened")
    }

    private fun onReset(
        state: DeliberationState,
        action: DeliberationAction.ResetForReplay,
    ): DeliberationState {
        if (state.phase != DeliberationPhase.COMPLETE) {
            throw IllegalDeliberationTransition("ResetForReplay only valid after COMPLETE")
        }
        return initialState(state.caseId, state.seed)
            .withEvent("replay_reset")
    }

    private fun DeliberationState.withPhase(phase: DeliberationPhase): DeliberationState =
        copy(phase = phase)

    private fun DeliberationState.withEvent(kind: String, detail: String = ""): DeliberationState {
        val event = DeliberationEvent(
            seq = eventLog.size + 1,
            phase = phase,
            kind = kind,
            detail = detail,
        )
        return copy(eventLog = eventLog + event)
    }
}
