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
    trial.witnesses.forEach { witness ->
        witness.blocks.filter { it.id == itemId }.forEach { block ->
            val name = pseudonyms.entries.find { it.id == witness.pseudonymRef }?.playName ?: witness.pseudonymRef
            return TrialItem(
                id = block.id,
                kind = block.mode,
                title = "$name (${witness.roleLabel})",
                body = block.text,
            )
        }
    }
    trial.exhibits.filter { it.id == itemId }.forEach { ex ->
        return TrialItem(
            id = ex.id,
            kind = "exhibit",
            title = ex.title,
            body = ex.text,
            subtitle = "Crown: ${ex.prosecutionClaim}\nDefence: ${ex.defenceClaim}",
        )
    }
    trial.directions.filter { it.id == itemId }.forEach { dir ->
        return TrialItem(
            id = dir.id,
            kind = "direction",
            title = dir.title,
            body = dir.text,
        )
    }
    return null
}
