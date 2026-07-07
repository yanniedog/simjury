package simjury.app.data

import simjury.casemodel.GatedTruth
import simjury.casemodel.LoadedCase

class RevealGate(private var verdictLocked: Boolean = false) {

    fun lockVerdict() {
        verdictLocked = true
    }

    fun openTruth(loaded: LoadedCase): GatedTruth {
        if (!verdictLocked) {
            throw IllegalStateException("Truth reveal is blocked until verdict is committed.")
        }
        return GatedTruth(
            titleReveal = loaded.meta.titleReveal,
            truthFile = loaded.truthFile,
            pseudonymRealNames = loaded.pseudonyms.entries.associate { it.id to it.realName },
        )
    }
}
