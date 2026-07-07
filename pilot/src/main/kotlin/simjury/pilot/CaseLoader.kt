package simjury.pilot

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

object CaseValidator {

    private val idCase = Regex("^C-\\d{3}$")
    private val idEpisode = Regex("^E-\\d{2}$")
    private val idWitness = Regex("^W-\\d{2}$")
    private val idBlock = Regex("^T-W\\d{2}-\\d{3}$")
    private val idExhibit = Regex("^X-\\d{2}$")
    private val idDirection = Regex("^D-\\d{2}$")
    private val allowedFidelity = setOf("verbatim", "summarised")

    fun validate(loaded: LoadedCase) {
        val errors = mutableListOf<String>()
        val c = loaded.meta
        val t = loaded.trial

        if (!idCase.matches(c.id)) errors += "case id invalid: ${c.id}"
        if (c.schemaVersion != "pilot-1") errors += "unsupported schema: ${c.schemaVersion}"

        val sourceIds = loaded.sources.sources.map { it.id }.toSet()
        val pseudoIds = loaded.pseudonyms.entries.map { it.id }.toSet()

        fun checkSource(ref: SourceRef, label: String) {
            if (ref.sourceId !in sourceIds) errors += "$label: unknown source ${ref.sourceId}"
            if (ref.locator.isBlank()) errors += "$label: blank locator"
        }

        loaded.truthFile.pseudonymReveal.forEach { reveal ->
            if (reveal.pseudonymRef !in pseudoIds) {
                errors += "truth reveal: unknown pseudonym ${reveal.pseudonymRef}"
            }
        }

        if (t.episodes.size != 1) {
            errors += "pilot limitation: case must have exactly 1 episode (found ${t.episodes.size})"
        }

        val trialEpisodeIds = t.episodes.map { it.id }.toSet()
        c.episodeIds.forEach { epId ->
            if (epId !in trialEpisodeIds) {
                errors += "episode $epId listed in case.json is missing from trial.json"
            }
        }

        t.episodes.forEach { ep ->
            if (!idEpisode.matches(ep.id)) errors += "episode id invalid: ${ep.id}"
            if (ep.id !in c.episodeIds) errors += "episode ${ep.id} not listed in case.json"
        }

        t.witnesses.forEach { w ->
            if (!idWitness.matches(w.id)) errors += "witness id invalid: ${w.id}"
            if (w.pseudonymRef !in pseudoIds) errors += "witness ${w.id}: bad pseudonym ${w.pseudonymRef}"
            w.blocks.forEach { b ->
                if (!idBlock.matches(b.id)) errors += "block id invalid: ${b.id}"
                if (b.fidelity !in allowedFidelity) errors += "block ${b.id}: fidelity ${b.fidelity}"
                checkSource(b.source, b.id)
            }
        }

        t.exhibits.forEach { x ->
            if (!idExhibit.matches(x.id)) errors += "exhibit id invalid: ${x.id}"
            checkSource(x.source, x.id)
        }

        t.directions.forEach { d ->
            if (!idDirection.matches(d.id)) errors += "direction id invalid: ${d.id}"
            checkSource(d.source, d.id)
        }

        val allItemIds = buildSet {
            t.witnesses.flatMap { it.blocks }.forEach { add(it.id) }
            t.exhibits.forEach { add(it.id) }
            t.directions.forEach { add(it.id) }
        }

        t.episodes.forEach { ep ->
            ep.itemOrder.forEach { id ->
                if (id !in allItemIds) errors += "episode ${ep.id}: unknown item $id"
            }
        }

        // Phase floors for C-000
        if (t.witnesses.size < 2) errors += "floor: need >= 2 witnesses"
        val blocks = t.witnesses.sumOf { it.blocks.size }
        if (blocks < 4) errors += "floor: need >= 4 testimony blocks"
        if (t.exhibits.size < 2) errors += "floor: need >= 2 exhibits"
        if (loaded.sources.sources.size < 2) errors += "floor: need >= 2 sources"

        if (errors.isNotEmpty()) {
            throw CaseValidationException(errors)
        }
    }
}

class CaseValidationException(val errors: List<String>) :
    Exception("Case validation failed:\n" + errors.joinToString("\n") { "  - $it" })
