package simjury.app.update

/** Semver + build_number comparison (AR-local parity). */
object VersionCompare {

    fun remoteIsNewer(
        installedVersion: String,
        installedBuild: Int,
        remoteVersion: String,
        remoteBuild: Int,
    ): Boolean {
        val versionCmp = compareSemver(installedVersion, remoteVersion)
        if (versionCmp < 0) return true
        if (versionCmp > 0) return false
        return remoteBuild > installedBuild
    }

    private fun compareSemver(a: String, b: String): Int {
        val aParts = a.split('.').map { it.toIntOrNull() ?: 0 }
        val bParts = b.split('.').map { it.toIntOrNull() ?: 0 }
        val len = maxOf(aParts.size, bParts.size)
        for (i in 0 until len) {
            val av = aParts.getOrElse(i) { 0 }
            val bv = bParts.getOrElse(i) { 0 }
            if (av != bv) return av.compareTo(bv)
        }
        return 0
    }
}
