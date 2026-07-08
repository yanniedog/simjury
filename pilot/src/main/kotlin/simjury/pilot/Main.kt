package simjury.pilot

fun main(args: Array<String>) {
    when {
        args.contains("--help") || args.contains("-h") -> {
            println(
                """
                SimJury pilot CLI

                Usage:
                  ./gradlew run --args="[--case=c_000] [--list-cases]"

                Options:
                  --case=<id>    Case folder id (default: c_000)
                  --list-cases   Print installed case folder ids and exit
                  --help, -h     Show this help
                """.trimIndent(),
            )
        }
        args.contains("--list-cases") -> {
            CaseCatalog.listInstalled().forEach { println(it) }
        }
        else -> {
            val caseId = args.firstOrNull { it.startsWith("--case=") }?.removePrefix("--case=") ?: "c_000"
            val loaded = CaseLoader(caseId).load()
            GameSession(loaded).run()
        }
    }
}
