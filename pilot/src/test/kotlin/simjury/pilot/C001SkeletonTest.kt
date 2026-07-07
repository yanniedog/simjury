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
    fun `C-001 skeleton blocks are placeholders`() {
        val first = loaded.trial.witnesses.first().blocks.first().text
        assertTrue(first.contains("AUTHORING PENDING"))
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
}
