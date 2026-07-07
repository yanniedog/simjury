package simjury.pilot

import kotlin.test.Test
import kotlin.test.assertTrue

class CaseCatalogTest {

    @Test
    fun `lists installed pilot cases`() {
        val cases = CaseCatalog.listInstalled()
        assertTrue("c_000" in cases)
        assertTrue("c_001" in cases)
    }
}
