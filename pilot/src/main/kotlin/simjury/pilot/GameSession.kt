package simjury.pilot

import simjury.casemodel.GatedTruth
import simjury.casemodel.LoadedCase
import simjury.deliberation.DeliberationAction
import simjury.deliberation.DeliberationPhase
import simjury.deliberation.DeliberationState
import simjury.deliberation.PilotDeliberationEngine
import java.util.Scanner

class GameSession(
    private val loaded: LoadedCase,
    private val seed: Long = DEFAULT_SEED,
    private val input: Scanner = Scanner(System.`in`),
    private val output: (String) -> Unit = { println(it) },
) {
    private val expectedItemIds: Set<String> =
        loaded.trial.episodes.flatMap { it.itemOrder }.toSet()

    private var state: DeliberationState =
        PilotDeliberationEngine.initialState(loaded.meta.id, seed, expectedItemIds = expectedItemIds)
    private val gate = RevealGate()

    fun run() {
        output("")
        output("=== SimJury Pilot ===")
        output("Case: ${loaded.meta.titlePlay}")
        output("Charge: ${loaded.meta.charge.label}")
        output("")
        output(disclaimerFor(loaded))
        output("")
        loaded.meta.contentNotes.forEach { output("Note: $it") }
        output("")
        waitForEnter("Press Enter to enter the courtroom...")
        dispatch(DeliberationAction.AcknowledgeSummons)

        loaded.trial.episodes.forEach { episode ->
            output("")
            output("--- ${episode.title} ---")
            output(episode.introText)
            output("")

            episode.itemOrder.forEach { itemId ->
                presentItem(itemId)
                waitForEnter("Press Enter to continue...")
                dispatch(DeliberationAction.MarkItemRead(itemId))
            }
        }

        dispatch(DeliberationAction.OpenDiary)
        val diary = collectDiary()
        dispatch(
            DeliberationAction.CommitDiary(
                leaning = diary.leaning,
                topReason = diary.topReason,
                strongestDoubt = diary.strongestDoubt,
            ),
        )
        output("")
        output("Diary committed. You cannot change it.")
        output("  Leaning: ${diary.leaning}")
        output("  Top reason: ${diary.topReason}")
        output("  Strongest doubt: ${diary.strongestDoubt}")

        val vote = collectVote()
        dispatch(DeliberationAction.CastVote(vote.position))
        output("")
        output("Verdict recorded: ${vote.position}")

        dispatch(DeliberationAction.OpenReveal)
        val truth = gate.openTruth(loaded)
        renderReveal(truth)
    }

    fun currentState(): DeliberationState = state

    private fun dispatch(action: DeliberationAction) {
        val wasLocked = state.verdictLocked
        state = PilotDeliberationEngine.step(state, action, seed)
        if (state.verdictLocked && !wasLocked) {
            gate.lockVerdict()
        }
    }

    private fun renderReveal(truth: GatedTruth) {
        output("")
        output("=== REVEAL: ${truth.titleReveal} ===")
        truth.truthFile.layers.forEach { layer ->
            output("")
            output(layer.heading)
            output(layer.body)
        }
        output("")
        output("Names restored:")
        truth.truthFile.pseudonymReveal.forEach { row ->
            output("  ${row.playName} → ${row.realName} (${row.fateNote})")
        }
        output("")
        output("Pilot complete. Thank you for serving.")
    }

    private fun presentItem(itemId: String) {
        loaded.trial.witnesses.forEach { witness ->
            witness.blocks.filter { it.id == itemId }.forEach { block ->
                val name = pseudonymName(witness.pseudonymRef)
                output("")
                output("[${block.mode}] $name (${witness.roleLabel})")
                output(block.text)
                return
            }
        }
        loaded.trial.exhibits.filter { it.id == itemId }.forEach { ex ->
            output("")
            output("[Exhibit] ${ex.title}")
            output(ex.text)
            output("Crown: ${ex.prosecutionClaim}")
            output("Defence: ${ex.defenceClaim}")
            return
        }
        loaded.trial.directions.filter { it.id == itemId }.forEach { dir ->
            output("")
            output("[Direction] ${dir.title}")
            output(dir.text)
        }
    }

    private fun pseudonymName(ref: String): String =
        loaded.pseudonyms.entries.find { it.id == ref }?.playName ?: ref

    private fun collectDiary(): simjury.casemodel.VerdictDiary {
        require(state.phase == DeliberationPhase.DIARY) { "Diary collection requires DIARY phase" }
        while (true) {
            output("")
            output("--- Verdict diary (permanent) ---")
            val leaning = promptChoice("Your leaning", listOf("G", "NG", "U"))
            val reason = promptLine("Top reason (one sentence)", minLen = 10)
            val doubt = promptLine("Strongest doubt (one sentence)", minLen = 10)
            if (confirm("Commit diary? This cannot be edited.")) {
                return simjury.casemodel.VerdictDiary(leaning, reason, doubt)
            }
        }
    }

    private fun collectVote(): simjury.casemodel.Verdict {
        require(state.phase == DeliberationPhase.VOTE) { "Vote collection requires VOTE phase" }
        while (true) {
            output("")
            output("--- Final vote ---")
            val position = promptChoice("Your verdict", listOf("Guilty", "Not Guilty"))
            if (confirm("Lock verdict?")) {
                return simjury.casemodel.Verdict(position)
            }
        }
    }

    private fun promptChoice(label: String, options: List<String>): String {
        while (true) {
            output("$label: ${options.joinToString(" / ")}")
            val line = input.nextLine().trim()
            val match = options.find { it.equals(line, ignoreCase = true) }
            if (match != null) return match
            output("Choose one of: ${options.joinToString()}")
        }
    }

    private fun promptLine(label: String, minLen: Int): String {
        while (true) {
            output(label)
            val line = input.nextLine().trim()
            if (line.length >= minLen) return line
            output("Please enter at least $minLen characters.")
        }
    }

    private fun confirm(message: String): Boolean {
        output("$message (y/n)")
        return input.nextLine().trim().equals("y", ignoreCase = true)
    }

    private fun waitForEnter(message: String) {
        output(message)
        input.nextLine()
    }

    companion object {
        const val DEFAULT_SEED = 1L

        const val DISCLAIMER =
            "SimJury presents a trial adapted for play. Names are changed during play and restored afterwards. " +
                "Nothing in this pilot is legal advice. Synthetic case C-000 — no historical persons."

        const val HISTORICAL_DISCLAIMER =
            "SimJury presents a trial adapted for play. Names are changed during play and restored afterwards. " +
                "Nothing in this pilot is legal advice. Historical case — persons and places are pseudonymised until reveal."

        fun disclaimerFor(loaded: LoadedCase): String =
            if (loaded.meta.synthetic) DISCLAIMER else HISTORICAL_DISCLAIMER
    }
}
