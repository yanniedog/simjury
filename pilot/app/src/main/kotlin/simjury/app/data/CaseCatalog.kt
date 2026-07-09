package simjury.app.data

import android.content.res.AssetManager
import kotlinx.coroutines.CancellationException
import simjury.casemodel.PilotCase
import simjury.casemodel.caseJson

data class CaseEntry(
    val id: String,
    val titlePlay: String,
)

object CaseCatalog {

    fun listFromAssets(assets: AssetManager): List<String> =
        listEntriesFromAssets(assets).map { it.id }

    fun listEntriesFromAssets(assets: AssetManager): List<CaseEntry> =
        discoverCaseIds(assets)
            .sorted()
            .mapNotNull { id -> readEntry(assets, id) }

    /**
     * Device AssetManager returns immediate child directory names (`c_000`).
     * Robolectric's asset overlay often returns flattened relative paths
     * (`c_000/case.json`). Accept both so the debug case picker works in tests.
     */
    internal fun discoverCaseIds(assets: AssetManager): Set<String> =
        assets.list("cases")
            .orEmpty()
            .mapNotNull { entry ->
                val first = entry.substringBefore('/')
                first.takeIf { it.matches(CASE_ID) }
            }
            .toSet()

    private fun readEntry(assets: AssetManager, id: String): CaseEntry? =
        try {
            assets.open("cases/$id/case.json").bufferedReader().use { reader ->
                val meta = caseJson.decodeFromString<PilotCase>(reader.readText())
                CaseEntry(id = id, titlePlay = meta.titlePlay)
            }
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            null
        }

    private val CASE_ID = Regex("""^c_\d{3}$""")
}
