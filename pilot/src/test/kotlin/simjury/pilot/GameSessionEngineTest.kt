package simjury.pilot

import simjury.deliberation.DeliberationAction
import simjury.deliberation.DeliberationPhase
import simjury.deliberation.PilotDeliberationEngine
import java.io.ByteArrayInputStream
import java.util.Scanner
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class GameSessionEngineTest {

    private val loaded = CaseLoader().load()

    @Test
    fun `scripted session drives deliberation engine to complete`() {
        val input = scriptedInput(
            "", // summons
            *(loaded.trial.episodes.single().itemOrder.map { "" }.toTypedArray()),
            "G",
            "Receipt matches the witness account.",
            "Pawn timing remains unclear.",
            "y",
            "Guilty",
            "y",
        )
        val lines = mutableListOf<String>()
        val session = GameSession(
            loaded = loaded,
            seed = GameSession.DEFAULT_SEED,
            input = Scanner(ByteArrayInputStream(input.toByteArray())),
            output = lines::add,
        )
        session.run()

        val end = session.currentState()
        assertEquals(DeliberationPhase.COMPLETE, end.phase)
        assertTrue(end.verdictLocked)
        assertTrue(end.revealComplete)
        assertEquals(loaded.trial.episodes.single().itemOrder.size, end.itemsRead.size)
        assertTrue(lines.any { it.contains("REVEAL") })
    }

    @Test
    fun `session event log matches standalone engine reduce`() {
        val episode = loaded.trial.episodes.single()
        val actions = buildList {
            add(DeliberationAction.AcknowledgeSummons)
            episode.itemOrder.forEach { add(DeliberationAction.MarkItemRead(it)) }
            add(DeliberationAction.OpenDiary)
            add(
                DeliberationAction.CommitDiary(
                    "NG",
                    "Identification evidence is weak.",
                    "Pawn ticket bears another name.",
                ),
            )
            add(DeliberationAction.CastVote("Not Guilty"))
            add(DeliberationAction.OpenReveal)
        }
        val expected = PilotDeliberationEngine.reduce(
            PilotDeliberationEngine.initialState(loaded.meta.id, GameSession.DEFAULT_SEED),
            actions,
            GameSession.DEFAULT_SEED,
        )

        val input = scriptedInput(
            "",
            *(episode.itemOrder.map { "" }.toTypedArray()),
            "NG",
            "Identification evidence is weak.",
            "Pawn ticket bears another name.",
            "y",
            "Not Guilty",
            "y",
        )
        val session = GameSession(
            loaded = loaded,
            seed = GameSession.DEFAULT_SEED,
            input = Scanner(ByteArrayInputStream(input.toByteArray())),
            output = {},
        )
        session.run()

        assertEquals(expected.eventLog, session.currentState().eventLog)
    }

    private fun scriptedInput(vararg lines: String): String =
        lines.joinToString("\n") + "\n"
}
