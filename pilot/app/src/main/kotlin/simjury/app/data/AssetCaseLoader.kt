package simjury.app.data

import android.content.res.AssetManager
import simjury.app.BuildConfig
import simjury.casemodel.CaseValidator
import simjury.casemodel.LoadedCase
import simjury.casemodel.PilotCase
import simjury.casemodel.PseudonymsFile
import simjury.casemodel.SourcesFile
import simjury.casemodel.TruthFile
import simjury.casemodel.TrialFile
import simjury.casemodel.caseJson

class AssetCaseLoader(
    private val assets: AssetManager,
    private val caseId: String = BuildConfig.PILOT_CASE_ID,
) {
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
        val text = assets.open(path).bufferedReader().use { it.readText() }
        return caseJson.decodeFromString(text)
    }
}
