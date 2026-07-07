package simjury.casemodel

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

        val duplicateSources = duplicates(loaded.sources.sources.map { it.id })
        if (duplicateSources.isNotEmpty()) errors += "duplicate source IDs: $duplicateSources"
        val sourceIds = loaded.sources.sources.map { it.id }.toSet()

        val duplicatePseudonyms = duplicates(loaded.pseudonyms.entries.map { it.id })
        if (duplicatePseudonyms.isNotEmpty()) errors += "duplicate pseudonym IDs: $duplicatePseudonyms"
        val pseudoIds = loaded.pseudonyms.entries.map { it.id }.toSet()

        fun checkSource(ref: SourceRef, label: String) {
            if (ref.sourceId !in sourceIds) errors += "$label: unknown source ${ref.sourceId}"
            if (ref.locator.isBlank()) errors += "$label: blank locator"
        }

        val revealPseudoIds = loaded.truthFile.pseudonymReveal.map { it.pseudonymRef }.toSet()
        loaded.truthFile.pseudonymReveal.forEach { reveal ->
            if (reveal.pseudonymRef !in pseudoIds) {
                errors += "truth reveal: unknown pseudonym ${reveal.pseudonymRef}"
            }
        }

        if (t.episodes.size != 1) {
            errors += "pilot limitation: case must have exactly 1 episode (found ${t.episodes.size})"
        }

        val duplicateEpisodes = duplicates(t.episodes.map { it.id })
        if (duplicateEpisodes.isNotEmpty()) errors += "duplicate episode IDs: $duplicateEpisodes"

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

        val duplicateWitnesses = duplicates(t.witnesses.map { it.id })
        if (duplicateWitnesses.isNotEmpty()) errors += "duplicate witness IDs: $duplicateWitnesses"

        t.witnesses.forEach { w ->
            if (!idWitness.matches(w.id)) errors += "witness id invalid: ${w.id}"
            if (w.pseudonymRef !in pseudoIds) errors += "witness ${w.id}: bad pseudonym ${w.pseudonymRef}"
            if (w.pseudonymRef !in revealPseudoIds) {
                errors += "witness ${w.id}: pseudonym ${w.pseudonymRef} has no truth reveal"
            }
            w.blocks.forEach { b ->
                if (!idBlock.matches(b.id)) errors += "block id invalid: ${b.id}"
                if (b.fidelity !in allowedFidelity) errors += "block ${b.id}: fidelity ${b.fidelity}"
                checkSource(b.source, b.id)
            }
        }

        val duplicateExhibits = duplicates(t.exhibits.map { it.id })
        if (duplicateExhibits.isNotEmpty()) errors += "duplicate exhibit IDs: $duplicateExhibits"

        t.exhibits.forEach { x ->
            if (!idExhibit.matches(x.id)) errors += "exhibit id invalid: ${x.id}"
            checkSource(x.source, x.id)
        }

        val duplicateDirections = duplicates(t.directions.map { it.id })
        if (duplicateDirections.isNotEmpty()) errors += "duplicate direction IDs: $duplicateDirections"

        t.directions.forEach { d ->
            if (!idDirection.matches(d.id)) errors += "direction id invalid: ${d.id}"
            checkSource(d.source, d.id)
        }

        val blockIds = t.witnesses.flatMap { it.blocks }.map { it.id }
        val duplicateBlocks = duplicates(blockIds)
        if (duplicateBlocks.isNotEmpty()) errors += "duplicate block IDs: $duplicateBlocks"

        val allItemIds = buildSet {
            t.witnesses.flatMap { it.blocks }.forEach { add(it.id) }
            t.exhibits.forEach { add(it.id) }
            t.directions.forEach { add(it.id) }
        }
        if (allItemIds.size != blockIds.size + t.exhibits.size + t.directions.size) {
            val collisions = buildList {
                val seen = mutableSetOf<String>()
                (blockIds + t.exhibits.map { it.id } + t.directions.map { it.id }).forEach { id ->
                    if (!seen.add(id)) add(id)
                }
            }
            if (collisions.isNotEmpty()) errors += "duplicate item IDs across categories: $collisions"
        }

        val orderedItemIds = t.episodes.flatMap { it.itemOrder }.toSet()
        val orphaned = allItemIds - orderedItemIds
        if (orphaned.isNotEmpty()) errors += "items not in episode itemOrder: $orphaned"

        t.episodes.forEach { ep ->
            ep.itemOrder.forEach { id ->
                if (id !in allItemIds) errors += "episode ${ep.id}: unknown item $id"
            }
        }

        if (t.witnesses.size < 2) errors += "floor: need >= 2 witnesses"
        val blocks = t.witnesses.sumOf { it.blocks.size }
        if (blocks < 4) errors += "floor: need >= 4 testimony blocks"
        if (t.exhibits.size < 2) errors += "floor: need >= 2 exhibits"
        if (loaded.sources.sources.size < 2) errors += "floor: need >= 2 sources"

        if (errors.isNotEmpty()) {
            throw CaseValidationException(errors)
        }
    }

    private fun <T> duplicates(items: List<T>): Set<T> =
        items.groupBy { it }.filterValues { it.size > 1 }.keys.toSet()
}

class CaseValidationException(val errors: List<String>) :
    Exception("Case validation failed:\n" + errors.joinToString("\n") { "  - $it" })
