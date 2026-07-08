package simjury.pilot

import java.io.File
import java.net.URLDecoder
import java.util.jar.JarFile

object CaseCatalog {

    private val caseJsonEntry = Regex("^cases/(c_\\d+)/case\\.json$")

    fun listInstalled(classLoader: ClassLoader? = CaseLoader::class.java.classLoader): List<String> =
        discoverCaseIds(classLoader).sorted()

    private fun discoverCaseIds(classLoader: ClassLoader?): Set<String> {
        if (classLoader == null) return emptySet()
        val ids = mutableSetOf<String>()
        val rootUrl = classLoader.getResource("cases/") ?: return idsFromKnownIds(classLoader)
        when (rootUrl.protocol) {
            "file" -> {
                val dir = File(rootUrl.toURI())
                dir.listFiles()?.forEach { child ->
                    if (child.isDirectory && child.name.startsWith("c_") && File(child, "case.json").isFile) {
                        ids.add(child.name)
                    }
                }
            }
            "jar" -> {
                val jarPath = URLDecoder.decode(
                    rootUrl.path.substringAfter("file:").substringBefore("!"),
                    Charsets.UTF_8.name(),
                )
                if (jarPath.isNotEmpty()) {
                    JarFile(jarPath).use { jar ->
                        jar.entries().asSequence().forEach { entry ->
                            val match = caseJsonEntry.matchEntire(entry.name) ?: return@forEach
                            ids.add(match.groupValues[1])
                        }
                    }
                }
            }
        }
        return if (ids.isEmpty()) idsFromKnownIds(classLoader) else ids
    }

    /** Fallback when directory listing is unavailable (e.g. some test class loaders). */
    private fun idsFromKnownIds(classLoader: ClassLoader): Set<String> =
        sequenceOf("c_000", "c_001", "c_002", "c_003", "c_004", "c_005", "c_006", "c_007", "c_008", "c_009")
            .filter { classLoader.getResource("cases/$it/case.json") != null }
            .toSet()
}
