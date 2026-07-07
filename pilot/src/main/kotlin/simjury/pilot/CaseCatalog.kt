package simjury.pilot

object CaseCatalog {

    fun listInstalled(classLoader: ClassLoader? = CaseLoader::class.java.classLoader): List<String> =
        KNOWN_CASE_IDS.filter { id ->
            classLoader?.getResource("cases/$id/case.json") != null
        }

    private val KNOWN_CASE_IDS = listOf("c_000", "c_001")
}
