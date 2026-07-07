package simjury.app.model

import simjury.casemodel.LoadedCase

data class TrialItem(
    val id: String,
    val kind: String,
    val title: String,
    val body: String,
    val subtitle: String = "",
)

fun LoadedCase.resolveItem(itemId: String): TrialItem? {
    for (witness in trial.witnesses) {
        val block = witness.blocks.find { it.id == itemId } ?: continue
        val name = pseudonyms.entries.find { it.id == witness.pseudonymRef }?.playName ?: witness.pseudonymRef
        return TrialItem(
            id = block.id,
            kind = block.mode,
            title = "$name (${witness.roleLabel})",
            body = block.text,
        )
    }
    val exhibit = trial.exhibits.find { it.id == itemId }
    if (exhibit != null) {
        return TrialItem(
            id = exhibit.id,
            kind = "exhibit",
            title = exhibit.title,
            body = exhibit.text,
            subtitle = "Crown: ${exhibit.prosecutionClaim}\nDefence: ${exhibit.defenceClaim}",
        )
    }
    val direction = trial.directions.find { it.id == itemId }
    if (direction != null) {
        return TrialItem(
            id = direction.id,
            kind = "direction",
            title = direction.title,
            body = direction.text,
        )
    }
    return null
}
