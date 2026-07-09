package simjury.app.share

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class VerdictCardTest {

    private fun c001Card(vote: String = "Not Guilty"): String = VerdictCard.build(
        caseId = "C-001",
        caseTitle = "The List",
        charge = "Obtaining jewellery by false pretences",
        vote = vote,
        itemsRead = 67,
        installUrl = "https://github.com/yanniedog/simjury/releases/latest",
    )

    @Test
    fun card_containsPlaySafeFieldsAndInstallLink() {
        val card = c001Card()
        assertTrue(card.contains("Case C-001"))
        assertTrue(card.contains("The List"))
        assertTrue(card.contains("Obtaining jewellery by false pretences"))
        assertTrue(card.contains("Trial items weighed: 67"))
        assertTrue(card.contains("https://github.com/yanniedog/simjury/releases/latest"))
    }

    @Test
    fun card_shoutsTheVerdict() {
        assertTrue(c001Card(vote = "Not Guilty").contains("My verdict: NOT GUILTY"))
        assertTrue(c001Card(vote = "Guilty").contains("My verdict: GUILTY"))
    }

    @Test
    fun card_hasNoF4TokensOrRevealContent() {
        // Same static F-4 token set the C-001 playthrough tests scan for, plus
        // reveal-only facts the card must never carry (GROWTH.md §8).
        val banned = listOf("beck", "1896", "old bailey", "gurrin", "spurrell", "wyatt", "pardon")
        val card = c001Card().lowercase()
        banned.forEach { token ->
            assertFalse("verdict card leaked '$token'", card.contains(token))
        }
    }

    @Test
    fun card_isShortEnoughToPasteAnywhere() {
        // Keep the card comfortably under SMS/toot-sized limits so it survives
        // any messaging surface without truncation.
        assertTrue(c001Card().length < 400)
    }
}
