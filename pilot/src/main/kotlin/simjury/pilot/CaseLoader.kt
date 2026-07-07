package simjury.pilot

import simjury.casemodel.CaseValidator
import simjury.casemodel.LoadedCase
import simjury.casemodel.PilotCase
import simjury.casemodel.PseudonymsFile
import simjury.casemodel.SourcesFile
import simjury.casemodel.TruthFile
import simjury.casemodel.TrialFile
import simjury.casemodel.caseJson
import java.io.InputStream

class CaseLoader(private val caseId: String = "c_000") {

    fun load(): LoadedCase {
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
        val stream = resourceStream(path)
            ?: error("Missing resource: $path")
        return stream.use { caseJson.decodeFromString(it.reader().readText()) }
    }

    private fun resourceStream(path: String): InputStream? =
        Thread.currentThread().contextClassLoader?.getResourceAsStream(path)
            ?: CaseLoader::class.java.classLoader.getResourceAsStream(path)
}
