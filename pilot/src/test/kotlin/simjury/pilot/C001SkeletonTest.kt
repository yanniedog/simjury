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
    fun `C-001 W-01 through W-05 testimony authored`() {
        val witnesses = listOf("W-01", "W-02", "W-03", "W-04", "W-05")
        witnesses.forEach { id ->
            val witness = loaded.trial.witnesses.first { it.id == id }
            witness.blocks.forEach { block ->
                assertFalse(
                    block.text.contains("AUTHORING PENDING"),
                    "${block.id} still pending",
                )
            }
        }
        val w06 = loaded.trial.witnesses.first { it.id == "W-06" }
        w06.blocks.forEach { block ->
            assertTrue(block.text.contains("AUTHORING PENDING"), "${block.id} should still be pending")
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
