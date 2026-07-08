package simjury.app.data

import android.content.res.AssetManager
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
        assets.list("cases")
            ?.filter { it.startsWith("c_") }
            ?.sorted()
            ?.mapNotNull { id -> readEntry(assets, id) }
            .orEmpty()

    private fun readEntry(assets: AssetManager, id: String): CaseEntry? =
        runCatching {
            assets.open("cases/$id/case.json").bufferedReader().use { reader ->
                val meta = caseJson.decodeFromString<PilotCase>(reader.readText())
                CaseEntry(id = id, titlePlay = meta.titlePlay)
            }
        }.getOrNull()
}
