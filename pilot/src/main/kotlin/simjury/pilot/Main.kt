package simjury.pilot

fun main(args: Array<String>) {
    val caseId = args.firstOrNull { it.startsWith("--case=") }?.removePrefix("--case=") ?: "c_000"
    val loaded = CaseLoader(caseId).load()
    GameSession(loaded).run()
}
