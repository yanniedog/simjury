package simjury.pilot

class RevealGate(private var verdictLocked: Boolean = false) {

    fun lockVerdict() {
        verdictLocked = true
    }

    fun isVerdictLocked(): Boolean = verdictLocked

    fun openTruth(loaded: LoadedCase): GatedTruth {
        if (!verdictLocked) {
            throw RevealBlockedException("Truth reveal is blocked until verdict is committed.")
        }
        return GatedTruth(
            titleReveal = loaded.meta.titleReveal,
            truthFile = loaded.truthFile,
            pseudonymRealNames = loaded.pseudonyms.entries.associate { it.id to it.realName },
        )
    }
}

class RevealBlockedException(message: String) : Exception(message)
