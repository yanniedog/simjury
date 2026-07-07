package simjury.pilot

fun main() {
    val loaded = CaseLoader().load()
    GameSession(loaded).run()
}
