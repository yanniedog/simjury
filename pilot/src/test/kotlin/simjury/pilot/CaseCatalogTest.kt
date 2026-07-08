package simjury.pilot

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class CaseCatalogTest {

    @Test
    fun `lists installed pilot cases sorted`() {
        val cases = CaseCatalog.listInstalled()
        assertEquals(cases, cases.sorted())
        assertTrue("c_000" in cases)
        assertTrue("c_001" in cases)
    }

    @Test
    fun `discovers case folders from resources`() {
        val cases = CaseCatalog.listInstalled()
        val classLoader = CaseLoader::class.java.classLoader!!
        val sample = classLoader.getResource("cases/c_000/case.json")!!
        val casesDir = File(sample.toURI()).parentFile.parentFile
        val expected = casesDir.listFiles()
            ?.filter { it.isDirectory && it.name.startsWith("c_") && File(it, "case.json").isFile }
            ?.map { it.name }
            ?.sorted()
            .orEmpty()
        assertEquals(expected, cases)
    }
}
