package simjury.casemodel

import java.io.InputStream

/**
 * Loads case JSON from test resources only. C-999 must never appear in main assets.
 */
object FixtureCaseLoader {

    fun load(caseId: String = "c_999"): LoadedCase {
        val base = "cases/$caseId/"
        val meta = decode<PilotCase>(base + "case.json")
        val trial = decode<TrialFile>(base + "trial.json")
        val pseudonyms = decode<PseudonymsFile>(base + "pseudonyms.json")
        val sources = decode<SourcesFile>(base + "sources.json")
        val truth = decode<TruthFile>(base + "truth_file.json")
        val loaded = LoadedCase(meta, trial, pseudonyms, sources, truth)
        CaseValidator.validate(loaded)
        return loaded
    }

    private inline fun <reified T> decode(path: String): T {
        val stream = resourceStream(path) ?: error("Missing test resource: $path")
        return stream.use { caseJson.decodeFromString(it.reader().readText()) }
    }

    private fun resourceStream(path: String): InputStream? =
        Thread.currentThread().contextClassLoader?.getResourceAsStream(path)
            ?: FixtureCaseLoader::class.java.classLoader.getResourceAsStream(path)
}
