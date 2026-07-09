package simjury.pilot

import simjury.deliberation.DeliberationPhase
import java.io.ByteArrayInputStream
import java.util.Scanner
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * R4 CLI evidence: full C-001 loop (summons → episodes → diary → vote → reveal)
 * with F-4 banned tokens absent from pre-reveal output.
 */
class C001PlaythroughTest {

    private val loaded = CaseLoader(caseId = "c_001").load()

    private val bannedPreReveal = simjury.casemodel.CaseValidator.f4StaticBannedTokens

    @Test
    fun `C-001 scripted CLI playthrough reaches reveal without pre-reveal leaks`() {
        val itemEnters = loaded.trial.episodes.flatMap { it.itemOrder }.map { "" }.toTypedArray()
        val input = scriptedInput(
            "", // summons
            *itemEnters,
            "NG",
            "Identification parade conditions undermine certainty.",
            "Handwriting certainty may be overstated on the record.",
            "y",
            "Not Guilty",
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
        assertEquals(loaded.trial.episodes.flatMap { it.itemOrder }.size, end.itemsRead.size)

        val joined = lines.joinToString("\n")
        assertTrue(joined.contains("The List"), "play title should appear")
        assertTrue(joined.contains("REVEAL"), "reveal section required")
        assertTrue(
            joined.contains(GameSession.HISTORICAL_DISCLAIMER),
            "historical disclaimer required for C-001",
        )
        assertFalse(
            joined.contains("Synthetic case"),
            "synthetic disclaimer must not appear for historical cases",
        )

        val revealIndex = lines.indexOfFirst { it.contains("REVEAL") }
        assertTrue(revealIndex > 0, "reveal marker must appear after trial reading")
        val preReveal = lines.take(revealIndex).joinToString("\n").lowercase()
        bannedPreReveal.forEach { token ->
            assertFalse(
                preReveal.contains(token),
                "F-4 banned token '$token' leaked in pre-reveal CLI output",
            )
        }
        // Real names restored only after reveal
        val postReveal = lines.drop(revealIndex).joinToString("\n")
        assertTrue(postReveal.contains("Names restored") || postReveal.contains("→"))
    }

    @Test
    fun `operator clearance gate still blocked for C-001 pending sign-off`() {
        val ex = kotlin.test.assertFailsWith<simjury.casemodel.CaseValidationException> {
            simjury.casemodel.CaseValidator.validateOperatorClearanceComplete(loaded)
        }
        assertTrue(ex.errors.any { it.contains("PENDING") || it.contains("cleared_by") })
    }

    private fun scriptedInput(vararg lines: String): String =
        lines.joinToString("\n") + "\n"
}
