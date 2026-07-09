package simjury.pilot

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class C001SkeletonTest {

    private val loaded = CaseLoader(caseId = "c_001").load()

    @Test
    fun `C-001 skeleton loads and validates`() {
        assertEquals("C-001", loaded.meta.id)
        assertFalse(loaded.meta.synthetic)
        assertEquals(4, loaded.trial.episodes.size)
        assertTrue(loaded.trial.witnesses.size in 6..9)
        assertTrue(loaded.trial.witnesses.sumOf { it.blocks.size } >= 60)
        assertTrue(loaded.trial.exhibits.size in 8..12)
        assertTrue(loaded.sources.sources.size >= 4)
        assertTrue(loaded.meta.clearance != null)
    }

    @Test
    fun `C-001 W-01 through W-08 testimony authored`() {
        val witnesses = listOf("W-01", "W-02", "W-03", "W-04", "W-05", "W-06", "W-07", "W-08")
        witnesses.forEach { id ->
            val witness = loaded.trial.witnesses.first { it.id == id }
            witness.blocks.forEach { block ->
                assertFalse(
                    block.text.contains("AUTHORING PENDING"),
                    "${block.id} still pending",
                )
            }
        }
    }

    @Test
    fun `C-001 directions D-01 through D-04 authored`() {
        val directions = listOf("D-01", "D-02", "D-03", "D-04")
        directions.forEach { id ->
            val direction = loaded.trial.directions.first { it.id == id }
            assertFalse(
                direction.text.contains("AUTHORING PENDING"),
                "${direction.id} still pending",
            )
        }
    }

    @Test
    fun `C-001 episode intros authored`() {
        loaded.trial.episodes.forEach { episode ->
            assertFalse(
                episode.introText.contains("AUTHORING PENDING"),
                "${episode.id} intro still pending",
            )
        }
    }

    @Test
    fun `C-001 truth file layers authored`() {
        loaded.truthFile.layers.forEach { layer ->
            assertFalse(
                layer.body.contains("AUTHORING PENDING", ignoreCase = true),
                "${layer.heading} still pending",
            )
        }
        assertTrue(loaded.truthFile.layers.size >= 4)
        loaded.truthFile.pseudonymReveal.forEach { reveal ->
            assertFalse(
                reveal.fateNote.contains("Pending tabulation", ignoreCase = true),
                "${reveal.pseudonymRef} fate still pending",
            )
        }
    }

    @Test
    fun `C-001 exhibits X-01 through X-08 authored with media`() {
        val expectedAssets = mapOf(
            "X-01" to "exhibits/x-01-clothing-list.png",
            "X-02" to "exhibits/x-02-clothing-list.png",
            "X-03" to "exhibits/x-03-handwriting-chart.png",
            "X-04" to "exhibits/x-04-cheque.png",
            "X-05" to "exhibits/x-05-encounter-schedule.png",
            "X-06" to "exhibits/x-06-identification-record.png",
            "X-07" to "exhibits/x-07-chronology.png",
            "X-08" to "exhibits/x-08-supporting-papers.png",
        )
        loaded.trial.exhibits.forEach { exhibit ->
            assertFalse(
                exhibit.text.contains("AUTHORING PENDING"),
                "${exhibit.id} still pending",
            )
            val asset = expectedAssets[exhibit.id]
            if (asset != null) {
                assertEquals(asset, exhibit.renderAsset, "${exhibit.id} render_asset")
            }
        }
    }

    @Test
    fun `C-001 ground truth has at least three anchored contradictions`() {
        val gt = loaded.trial.groundTruth
        assertTrue(gt.size >= 3, "need >= 3 contradictions, found ${gt.size}")

        val blockIds = loaded.trial.witnesses.flatMap { it.blocks }.map { it.id }.toSet()
        val exhibitIds = loaded.trial.exhibits.map { it.id }.toSet()
        val kinds = setOf("real_decisive", "real_immaterial", "illusory")
        gt.forEach { k ->
            assertTrue(k.kind in kinds, "${k.id} bad kind ${k.kind}")
            assertTrue(
                k.blockRefs.isNotEmpty() || k.exhibitRefs.isNotEmpty(),
                "${k.id} has no anchor",
            )
            k.blockRefs.forEach { assertTrue(it in blockIds, "${k.id} unknown block $it") }
            k.exhibitRefs.forEach { assertTrue(it in exhibitIds, "${k.id} unknown exhibit $it") }
        }
        // At least one decisive contradiction — the case must turn on a real tension.
        assertTrue(gt.any { it.kind == "real_decisive" }, "no real_decisive contradiction")
    }

    @Test
    fun `C-001 episode item order resolves`() {
        val ids = buildSet {
            loaded.trial.witnesses.flatMap { it.blocks }.forEach { add(it.id) }
            loaded.trial.exhibits.forEach { add(it.id) }
            loaded.trial.directions.forEach { add(it.id) }
        }
        loaded.trial.episodes.flatMap { it.itemOrder }.forEach { assertTrue(it in ids, "missing $it") }
    }

    @Test
    fun `C-001 episode item orders are disjoint`() {
        val allIds = loaded.trial.episodes.flatMap { it.itemOrder }
        assertEquals(allIds.size, allIds.toSet().size)
        assertTrue(allIds.size >= 60)
    }
}
