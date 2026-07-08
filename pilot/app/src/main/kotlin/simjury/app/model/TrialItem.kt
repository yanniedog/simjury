package simjury.app.model

import simjury.app.speech.SpeechRole
import simjury.casemodel.LoadedCase

data class ExhibitMediaItem(
    val type: String,
    val assetPath: String,
    val caption: String = "",
    val altText: String = "",
)

data class TrialItem(
    val id: String,
    val kind: String,
    val title: String,
    val body: String,
    val subtitle: String = "",
    val speakerRole: String = SpeechRole.NARRATOR,
    val media: List<ExhibitMediaItem> = emptyList(),
)

fun LoadedCase.resolveItem(caseFolderId: String, itemId: String): TrialItem? {
    for (witness in trial.witnesses) {
        val block = witness.blocks.find { it.id == itemId } ?: continue
        val name = pseudonyms.entries.find { it.id == witness.pseudonymRef }?.playName ?: witness.pseudonymRef
        return TrialItem(
            id = block.id,
            kind = block.mode,
            title = "$name (${witness.roleLabel})",
            body = block.text,
            speakerRole = SpeechRole.witness(witness.pseudonymRef),
        )
    }
    val exhibit = trial.exhibits.find { it.id == itemId }
    if (exhibit != null) {
        val media = exhibit.resolvedMedia().map { entry ->
            ExhibitMediaItem(
                type = entry.type,
                assetPath = "cases/$caseFolderId/${entry.path}",
                caption = entry.caption.orEmpty(),
                altText = entry.altText.orEmpty(),
            )
        }
        return TrialItem(
            id = exhibit.id,
            kind = "exhibit",
            title = exhibit.title,
            body = exhibit.text,
            subtitle = "Crown: ${exhibit.prosecutionClaim}\nDefence: ${exhibit.defenceClaim}",
            speakerRole = SpeechRole.CLERK,
            media = media,
        )
    }
    val direction = trial.directions.find { it.id == itemId }
    if (direction != null) {
        return TrialItem(
            id = direction.id,
            kind = "direction",
            title = direction.title,
            body = direction.text,
            speakerRole = SpeechRole.JUDGE,
        )
    }
    return null
}
