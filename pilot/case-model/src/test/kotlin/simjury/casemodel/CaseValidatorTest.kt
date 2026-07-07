package simjury.casemodel

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class CaseValidatorTest {

    @Test
    fun `valid minimal fixture passes`() {
        CaseValidator.validate(minimalValidCase())
    }

    @Test
    fun `rejects invalid case id`() {
        val loaded = minimalValidCase().copy(meta = minimalValidCase().meta.copy(id = "bad"))
        val ex = assertFailsWith<CaseValidationException> { CaseValidator.validate(loaded) }
        assertTrue(ex.errors.any { it.contains("case id invalid") })
    }

    @Test
    fun `rejects unknown source on testimony block`() {
        val trial = minimalValidCase().trial
        val badWitness = trial.witnesses[0].copy(
            blocks = trial.witnesses[0].blocks.map { block ->
                block.copy(source = SourceRef("SRC-MISSING", "p.1"))
            },
        )
        val loaded = minimalValidCase().copy(
            trial = trial.copy(witnesses = listOf(badWitness, trial.witnesses[1])),
        )
        val ex = assertFailsWith<CaseValidationException> { CaseValidator.validate(loaded) }
        assertTrue(ex.errors.any { it.contains("unknown source") })
    }

    @Test
    fun `rejects multiple episodes in pilot`() {
        val trial = minimalValidCase().trial
        val loaded = minimalValidCase().copy(
            meta = minimalValidCase().meta.copy(episodeIds = listOf("E-01", "E-02")),
            trial = trial.copy(
                episodes = trial.episodes + Episode(
                    id = "E-02",
                    title = "Extra",
                    introText = "Should fail.",
                    itemOrder = emptyList(),
                ),
            ),
        )
        val ex = assertFailsWith<CaseValidationException> { CaseValidator.validate(loaded) }
        assertTrue(ex.errors.any { it.contains("exactly 1 episode") })
    }

    @Test
    fun `floor requires two witnesses`() {
        val trial = minimalValidCase().trial
        val loaded = minimalValidCase().copy(
            trial = trial.copy(witnesses = trial.witnesses.take(1)),
        )
        val ex = assertFailsWith<CaseValidationException> { CaseValidator.validate(loaded) }
        assertTrue(ex.errors.any { it.contains(">= 2 witnesses") })
    }

    @Test
    fun `rejects duplicate source ids`() {
        val sources = minimalValidCase().sources.copy(
            sources = listOf(
                SourceEntry("SRC-01", "A", "fixture"),
                SourceEntry("SRC-01", "B", "fixture"),
            ),
        )
        val ex = assertFailsWith<CaseValidationException> {
            CaseValidator.validate(minimalValidCase().copy(sources = sources))
        }
        assertTrue(ex.errors.any { it.contains("duplicate source IDs") })
    }

    @Test
    fun `rejects witness without truth reveal`() {
        val truthFile = minimalValidCase().truthFile.copy(
            pseudonymReveal = listOf(
                PseudonymReveal("P-01", "Mr A", "Alice", "fined"),
            ),
        )
        val ex = assertFailsWith<CaseValidationException> {
            CaseValidator.validate(minimalValidCase().copy(truthFile = truthFile))
        }
        assertTrue(ex.errors.any { it.contains("has no truth reveal") })
    }

    @Test
    fun `rejects orphaned items not in itemOrder`() {
        val trial = minimalValidCase().trial
        val episode = trial.episodes[0].copy(
            itemOrder = trial.episodes[0].itemOrder.filter { it != "X-02" },
        )
        val ex = assertFailsWith<CaseValidationException> {
            CaseValidator.validate(minimalValidCase().copy(trial = trial.copy(episodes = listOf(episode))))
        }
        assertTrue(ex.errors.any { it.contains("not in episode itemOrder") })
    }

    @Test
    fun `rejects duplicate block ids across witnesses`() {
        val trial = minimalValidCase().trial
        val w1 = trial.witnesses[0]
        val w2 = trial.witnesses[1].copy(
            blocks = w2BlocksWithId(w1.blocks[0].id),
        )
        val ex = assertFailsWith<CaseValidationException> {
            CaseValidator.validate(minimalValidCase().copy(trial = trial.copy(witnesses = listOf(w1, w2))))
        }
        assertTrue(ex.errors.any { it.contains("duplicate block IDs") || it.contains("duplicate item IDs") })
    }

    private fun w2BlocksWithId(id: String) = listOf(
        testimony(id, "SRC-02"),
        testimony("T-W02-002", "SRC-02"),
    )

    private fun minimalValidCase(): LoadedCase {
        val sources = SourcesFile(
            sources = listOf(
                SourceEntry("SRC-01", "Synthetic ledger A", "pilot fixture"),
                SourceEntry("SRC-02", "Synthetic ledger B", "pilot fixture"),
            ),
        )
        val pseudonyms = PseudonymsFile(
            entries = listOf(
                PseudonymEntry("P-01", "Mr A", "Alice", "shopkeeper"),
                PseudonymEntry("P-02", "Mr B", "Bob", "constable"),
            ),
        )
        val blocks1 = listOf(
            testimony("T-W01-001", "SRC-01"),
            testimony("T-W01-002", "SRC-01"),
        )
        val blocks2 = listOf(
            testimony("T-W02-001", "SRC-02"),
            testimony("T-W02-002", "SRC-02"),
        )
        val trial = TrialFile(
            episodes = listOf(
                Episode(
                    id = "E-01",
                    title = "Day one",
                    introText = "Court opens.",
                    itemOrder = listOf(
                        "T-W01-001", "T-W01-002", "T-W02-001", "T-W02-002",
                        "X-01", "X-02", "D-01",
                    ),
                ),
            ),
            witnesses = listOf(
                Witness("W-01", "P-01", "shopkeeper", "prosecution", blocks1),
                Witness("W-02", "P-02", "constable", "prosecution", blocks2),
            ),
            exhibits = listOf(
                Exhibit("X-01", "Receipt", "document", "text", "crown", "defence", SourceRef("SRC-01", "p.1")),
                Exhibit("X-02", "Ticket", "document", "text", "crown", "defence", SourceRef("SRC-02", "p.2")),
            ),
            directions = listOf(
                Direction("D-01", "Burden", "Beyond reasonable doubt.", SourceRef("SRC-01", "p.3")),
            ),
        )
        val meta = PilotCase(
            id = "C-999",
            titlePlay = "Fixture",
            titleReveal = "Fixture Reveal",
            synthetic = true,
            schemaVersion = "pilot-1",
            charge = Charge("petty larceny", listOf("taking")),
            episodeIds = listOf("E-01"),
        )
        val truth = TruthFile(
            layers = listOf(TruthLayer("Outcome", "Synthetic.")),
            pseudonymReveal = listOf(
                PseudonymReveal("P-01", "Mr A", "Alice", "fined"),
                PseudonymReveal("P-02", "Mr B", "Bob", "commended"),
            ),
        )
        return LoadedCase(meta, trial, pseudonyms, sources, truth)
    }

    private fun testimony(id: String, sourceId: String) = TestimonyBlock(
        id = id,
        mode = "examination",
        fidelity = "summarised",
        text = "Witness speaks.",
        source = SourceRef(sourceId, "p.1"),
    )
}
