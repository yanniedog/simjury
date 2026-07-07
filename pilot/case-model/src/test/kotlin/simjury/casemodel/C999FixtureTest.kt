package simjury.casemodel

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class C999FixtureTest {

    @Test
    fun `C-999 fixture JSON loads and passes validator`() {
        val loaded = FixtureCaseLoader.load()
        assertEquals("C-999", loaded.meta.id)
        assertTrue(loaded.meta.synthetic)
        assertEquals(2, loaded.trial.witnesses.size)
        assertEquals(4, loaded.trial.witnesses.sumOf { it.blocks.size })
        assertEquals(2, loaded.trial.exhibits.size)
        assertEquals(2, loaded.sources.sources.size)
    }

    @Test
    fun `C-999 episode item order is complete`() {
        val loaded = FixtureCaseLoader.load()
        val ids = buildSet {
            loaded.trial.witnesses.flatMap { it.blocks }.forEach { add(it.id) }
            loaded.trial.exhibits.forEach { add(it.id) }
            loaded.trial.directions.forEach { add(it.id) }
        }
        loaded.trial.episodes.single().itemOrder.forEach { assertTrue(it in ids, "missing $it") }
    }
}
