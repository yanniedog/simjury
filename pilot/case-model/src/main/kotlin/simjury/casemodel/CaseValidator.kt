package simjury.casemodel

object CaseValidator {

    private val idCase = Regex("^C-\\d{3}$")
    private val idEpisode = Regex("^E-\\d{2}$")
    private val idWitness = Regex("^W-\\d{2}$")
    private val idBlock = Regex("^T-W\\d{2}-\\d{3}$")
    private val idExhibit = Regex("^X-\\d{2}$")
    private val idDirection = Regex("^D-\\d{2}$")
    private val allowedFidelity = setOf("verbatim", "summarised")
    private val allowedMediaTypes = setOf("image", "audio")
    private val mediaPathPattern = Regex("^[a-zA-Z0-9][a-zA-Z0-9_./-]*$")
    private val imageExtensions = setOf("png", "jpg", "jpeg", "webp")
    private val audioExtensions = setOf("ogg", "mp3", "wav")

    /** Static F-4 tokens from v3 — must not appear in play-reachable text. */
    private val staticBannedTokens = listOf(
        "beck", "smith", "thomas", "gurrin", "spurrell", "fulton", "avory", "gill",
        "old bailey", "1896", "1877", "1904",
    )

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

        loaded.truthFile.adaptations.forEachIndexed { index, adaptation ->
            if (adaptation.note.isBlank()) {
                errors += "adaptation[$index]: blank note"
            }
        }

        validateClearance(c, errors)
        validateEpisodeCount(c, t.episodes.size, errors)

        val duplicateMetaEpisodes = duplicates(c.episodeIds)
        if (duplicateMetaEpisodes.isNotEmpty()) {
            errors += "duplicate episode IDs in case.json: $duplicateMetaEpisodes"
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
            validateExhibitMedia(x, errors)
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

        validateFloors(loaded, errors)
        scanBannedTokens(loaded, errors)

        if (errors.isNotEmpty()) {
            throw CaseValidationException(errors)
        }
    }

    private fun validateExhibitMedia(exhibit: Exhibit, errors: MutableList<String>) {
        exhibit.renderAsset?.let { path ->
            validateMediaPath(path, "image", "${exhibit.id}.render_asset", errors)
        }
        exhibit.media.forEachIndexed { index, media ->
            val label = "${exhibit.id}.media[$index]"
            if (media.type !in allowedMediaTypes) {
                errors += "$label: unsupported media type ${media.type}"
            }
            validateMediaPath(media.path, media.type, label, errors)
        }
    }

    private fun validateMediaPath(path: String, type: String, label: String, errors: MutableList<String>) {
        if (path.isBlank()) {
            errors += "$label: blank media path"
            return
        }
        if (path.contains("..") || path.startsWith("/")) {
            errors += "$label: media path must be relative without traversal: $path"
            return
        }
        if (!mediaPathPattern.matches(path)) {
            errors += "$label: invalid media path characters: $path"
            return
        }
        val extension = path.substringAfterLast('.', "").lowercase()
        if (extension.isBlank()) {
            errors += "$label: media path must include a file extension: $path"
            return
        }
        when (type) {
            "image" -> if (extension !in imageExtensions) {
                errors += "$label: image must use ${imageExtensions.joinToString("/")}, got .$extension"
            }
            "audio" -> if (extension !in audioExtensions) {
                errors += "$label: audio must use ${audioExtensions.joinToString("/")}, got .$extension"
            }
        }
    }

    private fun validateClearance(c: PilotCase, errors: MutableList<String>) {
        if (c.synthetic) return
        val clearance = c.clearance
        if (clearance == null) {
            errors += "historical case requires clearance object in case.json"
            return
        }
        val booleanFields = listOf(
            "all_participants_deceased" to clearance.allParticipantsDeceased,
            "matter_finally_closed" to clearance.matterFinallyClosed,
            "no_live_review_prospect" to clearance.noLiveReviewProspect,
            "sources_public_domain_or_licensed" to clearance.sourcesPublicDomainOrLicensed,
            "no_sexual_offence_content" to clearance.noSexualOffenceContent,
            "no_child_victim_content" to clearance.noChildVictimContent,
            "no_identification_suppression_orders" to clearance.noIdentificationSuppressionOrders,
        )
        booleanFields.forEach { (name, value) ->
            if (!value) errors += "clearance.$name must be true"
        }
        if (clearance.indigenousSensitivityCheck.isBlank()) {
            errors += "clearance.indigenous_sensitivity_check must be non-empty"
        }
        if (clearance.descendantsRiskNote.isBlank()) {
            errors += "clearance.descendants_risk_note must be non-empty"
        }
        if (clearance.clearedBy.isBlank()) {
            errors += "clearance.cleared_by must be non-empty"
        }
        if (clearance.clearedDate.isBlank()) {
            errors += "clearance.cleared_date must be non-empty"
        }
    }

    private fun validateEpisodeCount(c: PilotCase, episodeCount: Int, errors: MutableList<String>) {
        if (c.synthetic) {
            if (episodeCount != 1) {
                errors += "synthetic pilot case must have exactly 1 episode (found $episodeCount)"
            }
            return
        }
        if (episodeCount !in 3..5) {
            errors += "historical case must have 3–5 episodes (found $episodeCount)"
        }
        if (c.episodeIds.size !in 3..5) {
            errors += "historical case episode_ids must list 3–5 episodes (found ${c.episodeIds.size})"
        }
    }

    private fun validateFloors(loaded: LoadedCase, errors: MutableList<String>) {
        val t = loaded.trial
        val blocks = t.witnesses.sumOf { it.blocks.size }
        if (loaded.meta.synthetic) {
            if (t.witnesses.size < 2) errors += "floor: need >= 2 witnesses"
            if (blocks < 4) errors += "floor: need >= 4 testimony blocks"
            if (t.exhibits.size < 2) errors += "floor: need >= 2 exhibits"
            if (loaded.sources.sources.size < 2) errors += "floor: need >= 2 sources"
        } else {
            if (t.witnesses.size !in 6..9) {
                errors += "floor: historical case needs 6–9 witnesses (found ${t.witnesses.size})"
            }
            if (blocks < 60) errors += "floor: historical case needs >= 60 testimony blocks (found $blocks)"
            if (t.exhibits.size !in 8..12) {
                errors += "floor: historical case needs 8–12 exhibits (found ${t.exhibits.size})"
            }
            if (loaded.sources.sources.size < 4) {
                errors += "floor: historical case needs >= 4 sources (found ${loaded.sources.sources.size})"
            }
        }
    }

    private fun scanBannedTokens(loaded: LoadedCase, errors: MutableList<String>) {
        if (loaded.meta.synthetic) return

        val banned = buildSet {
            addAll(staticBannedTokens)
            loaded.pseudonyms.entries.forEach { entry ->
                add(entry.realName.lowercase())
            }
        }
        val playReachable = collectPlayReachableText(loaded)
        banned.forEach { token ->
            if (token.isBlank()) return@forEach
            val regex = Regex("\\b${Regex.escape(token)}\\b", RegexOption.IGNORE_CASE)
            playReachable.forEach { (label, text) ->
                if (regex.containsMatchIn(text)) {
                    errors += "F-4 banned token '$token' in play-reachable $label"
                }
            }
        }
    }

    private fun collectPlayReachableText(loaded: LoadedCase): List<Pair<String, String>> {
        val c = loaded.meta
        val t = loaded.trial
        val texts = mutableListOf<Pair<String, String>>()
        texts += "case.title_play" to c.titlePlay
        texts += "case.charge.label" to c.charge.label
        c.charge.elements.forEachIndexed { i, el -> texts += "case.charge.elements[$i]" to el }
        c.contentNotes.forEachIndexed { i, note -> texts += "case.content_notes[$i]" to note }
        t.episodes.forEach { ep ->
            texts += "episode.${ep.id}.title" to ep.title
            texts += "episode.${ep.id}.intro_text" to ep.introText
        }
        t.witnesses.forEach { w ->
            w.blocks.forEach { b -> texts += b.id to b.text }
        }
        t.exhibits.forEach { x ->
            texts += x.id to x.title
            texts += "${x.id}.text" to x.text
            texts += "${x.id}.prosecution_claim" to x.prosecutionClaim
            texts += "${x.id}.defence_claim" to x.defenceClaim
        }
        t.directions.forEach { d ->
            texts += d.id to d.title
            texts += "${d.id}.text" to d.text
        }
        loaded.pseudonyms.entries.forEach { p ->
            texts += "pseudonym.${p.id}.play_name" to p.playName
            texts += "pseudonym.${p.id}.role" to p.role
        }
        return texts
    }

    private fun <T> duplicates(items: List<T>): Set<T> =
        items.groupBy { it }.filterValues { it.size > 1 }.keys.toSet()
}

class CaseValidationException(val errors: List<String>) :
    Exception("Case validation failed:\n" + errors.joinToString("\n") { "  - $it" })
