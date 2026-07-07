package simjury.pilot

fun main() {
    val loaded = CaseLoader().load()
    val gate = RevealGate()
    GameSession(loaded, gate).run()
}
