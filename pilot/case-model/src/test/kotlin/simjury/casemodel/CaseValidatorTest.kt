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
    fun `rejects multiple episodes for synthetic case`() {
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
    fun `historical case accepts three to five episodes`() {
        CaseValidator.validate(historicalValidCase(episodeCount = 3))
        CaseValidator.validate(historicalValidCase(episodeCount = 5))
    }

    @Test
    fun `historical case requires clearance`() {
        val loaded = historicalValidCase(episodeCount = 3).copy(
            meta = historicalValidCase(episodeCount = 3).meta.copy(clearance = null),
        )
        val ex = assertFailsWith<CaseValidationException> { CaseValidator.validate(loaded) }
        assertTrue(ex.errors.any { it.contains("requires clearance") })
    }

    @Test
    fun `historical case rejects false clearance boolean`() {
        val clearance = historicalClearance().copy(matterFinallyClosed = false)
        val loaded = historicalValidCase(episodeCount = 3).copy(
            meta = historicalValidCase(episodeCount = 3).meta.copy(clearance = clearance),
        )
        val ex = assertFailsWith<CaseValidationException> { CaseValidator.validate(loaded) }
        assertTrue(ex.errors.any { it.contains("matter_finally_closed") })
    }

    @Test
    fun `rejects banned token in play reachable text`() {
        val trial = historicalValidCase(episodeCount = 3).trial
        val badWitness = trial.witnesses[0].copy(
            blocks = trial.witnesses[0].blocks.mapIndexed { index, block ->
                if (index == 0) block.copy(text = "The witness mentioned Beck in court.") else block
            },
        )
        val loaded = historicalValidCase(episodeCount = 3).copy(
            trial = trial.copy(witnesses = listOf(badWitness) + trial.witnesses.drop(1)),
        )
        val ex = assertFailsWith<CaseValidationException> { CaseValidator.validate(loaded) }
        assertTrue(ex.errors.any { it.contains("F-4 banned token") })
    }

    @Test
    fun `historical floors enforce witness and block counts`() {
        val trial = historicalValidCase(episodeCount = 3).trial
        val loaded = historicalValidCase(episodeCount = 3).copy(
            trial = trial.copy(witnesses = trial.witnesses.take(3)),
        )
        val ex = assertFailsWith<CaseValidationException> { CaseValidator.validate(loaded) }
        assertTrue(ex.errors.any { it.contains("6–9 witnesses") })
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

    private fun historicalClearance() = Clearance(
        allParticipantsDeceased = true,
        matterFinallyClosed = true,
        noLiveReviewProspect = true,
        sourcesPublicDomainOrLicensed = true,
        noSexualOffenceContent = true,
        noChildVictimContent = true,
        noIdentificationSuppressionOrders = true,
        indigenousSensitivityCheck = "n/a — no Indigenous participants",
        descendantsRiskNote = "Historical case; all participants deceased.",
        clearedBy = "PENDING HUMAN SIGN-OFF",
        clearedDate = "2026-01-01",
    )

    private fun historicalValidCase(episodeCount: Int): LoadedCase {
        val witnessCount = 6
        val blocksPerWitness = 10
        val exhibitCount = 8
        val sources = SourcesFile(
            sources = (1..4).map { i ->
                SourceEntry("S-0$i", "Inquiry report vol $i", "public domain")
            },
        )
        val pseudonyms = PseudonymsFile(
            entries = (1..witnessCount).map { i ->
                PseudonymEntry(
                    id = "P-${i.toString().padStart(2, '0')}",
                    playName = "Witness $i",
                    realName = "Historical Person $i",
                    role = "witness",
                )
            },
        )
        val witnesses = (1..witnessCount).map { wi ->
            val wid = wi.toString().padStart(2, '0')
            Witness(
                id = "W-$wid",
                pseudonymRef = "P-$wid",
                roleLabel = "witness",
                calledBy = "prosecution",
                blocks = (1..blocksPerWitness).map { bi ->
                    TestimonyBlock(
                        id = "T-W$wid-${bi.toString().padStart(3, '0')}",
                        mode = "examination",
                        fidelity = "summarised",
                        text = "Witness $wi testimony block $bi.",
                        source = SourceRef("S-01", "p.$bi"),
                    )
                },
            )
        }
        val exhibits = (1..exhibitCount).map { i ->
            val xid = i.toString().padStart(2, '0')
            Exhibit(
                id = "X-$xid",
                title = "Exhibit $i",
                kind = "document",
                text = "Exhibit text $i.",
                prosecutionClaim = "crown",
                defenceClaim = "defence",
                source = SourceRef("S-02", "p.$i"),
            )
        }
        val directions = listOf(
            Direction("D-01", "Burden", "Beyond reasonable doubt.", SourceRef("S-03", "p.1")),
        )
        val allItemIds = buildList {
            witnesses.flatMap { it.blocks }.forEach { add(it.id) }
            exhibits.forEach { add(it.id) }
            directions.forEach { add(it.id) }
        }
        val perEpisode = allItemIds.size / episodeCount
        val episodes = (1..episodeCount).map { ei ->
            val eid = ei.toString().padStart(2, '0')
            val start = (ei - 1) * perEpisode
            val end = if (ei == episodeCount) allItemIds.size else ei * perEpisode
            Episode(
                id = "E-$eid",
                title = "Episode $ei",
                introText = "Court day $ei.",
                itemOrder = allItemIds.subList(start, end),
            )
        }
        val trial = TrialFile(episodes, witnesses, exhibits, directions)
        val meta = PilotCase(
            id = "C-998",
            titlePlay = "The List",
            titleReveal = "Historical Fixture",
            synthetic = false,
            schemaVersion = "pilot-1",
            charge = Charge("fraud", listOf("pretence", "property")),
            episodeIds = episodes.map { it.id },
            clearance = historicalClearance(),
        )
        val truth = TruthFile(
            layers = listOf(TruthLayer("Outcome", "Fixture only.")),
            pseudonymReveal = pseudonyms.entries.map { p ->
                PseudonymReveal(p.id, p.playName, p.realName, "deceased")
            },
            adaptations = listOf(Adaptation("Fixture case for validator tests.")),
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
