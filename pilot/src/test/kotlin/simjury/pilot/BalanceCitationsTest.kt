package simjury.pilot

import kotlin.test.Test
import kotlin.test.assertTrue

/**
 * P4-10 lightweight check: every trial-item ID cited in `BALANCE.md` must exist in `trial.json`,
 * and each argument must cite at least five distinct items (PHASE4-PLAN §7). The citation regex
 * also matches ground-truth (`K-*`) and other `T`/`X`/`D`/`K` prefixes so invalid or non-trial
 * citations are extracted and rejected by the existence check (they are not in `trial.json`).
 */
class BalanceCitationsTest {

    private val loaded = CaseLoader(caseId = "c_001").load()
    private val balanceText = readResource("cases/c_001/BALANCE.md")
    private val itemIdRegex = Regex("\\b[TXDK]-[A-Z0-9-]+(?:-[A-Z0-9-]+)*\\b")

    private val allItemIds: Set<String> = buildSet {
        loaded.trial.witnesses.flatMap { it.blocks }.forEach { add(it.id) }
        loaded.trial.exhibits.forEach { add(it.id) }
        loaded.trial.directions.forEach { add(it.id) }
    }

    @Test
    fun `balance file has both arguments and attestation`() {
        assertTrue(balanceText.contains("## Argument for guilt"))
        assertTrue(balanceText.contains("## Argument for acquittal"))
        assertTrue(balanceText.contains("## Balance attestation"))
    }

    @Test
    fun `every cited item id exists in trial`() {
        val cited = itemIdRegex.findAll(balanceText).map { it.value }.toSet()
        assertTrue(cited.isNotEmpty(), "BALANCE.md cites no trial items")
        val missing = cited - allItemIds
        assertTrue(missing.isEmpty(), "BALANCE.md cites unknown items: $missing")
    }

    @Test
    fun `each argument cites at least five distinct items`() {
        val guilt = section("## Argument for guilt", "## Argument for acquittal")
        val acquittal = section("## Argument for acquittal", "## Balance attestation")
        val guiltIds = itemIdRegex.findAll(guilt).map { it.value }.toSet()
        val acquittalIds = itemIdRegex.findAll(acquittal).map { it.value }.toSet()
        assertTrue(guiltIds.size >= 5, "guilt argument cites only ${guiltIds.size} distinct items")
        assertTrue(acquittalIds.size >= 5, "acquittal argument cites only ${acquittalIds.size} distinct items")
    }

    private fun section(start: String, end: String): String {
        val s = balanceText.indexOf(start)
        val e = balanceText.indexOf(end)
        require(s >= 0 && e > s) { "BALANCE.md missing section $start..$end" }
        return balanceText.substring(s, e)
    }

    private fun readResource(path: String): String {
        val stream = Thread.currentThread().contextClassLoader?.getResourceAsStream(path)
            ?: BalanceCitationsTest::class.java.classLoader.getResourceAsStream(path)
            ?: error("missing resource $path")
        return stream.use { it.reader().readText() }
    }
}
