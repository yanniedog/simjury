package simjury.app.share

/**
 * Builds the plain-text "verdict card" a juror can share after the verdict locks.
 *
 * Spoiler-safe by construction: the card is assembled only from play-safe fields
 * (case id, play title, charge, the player's own verdict, item count). Reveal-layer
 * text, restored names, and the historical outcome are not accepted as inputs, so a
 * card can never leak them — it is safe to post publicly (GROWTH.md M-1).
 */
object VerdictCard {

    fun build(
        caseId: String,
        caseTitle: String,
        charge: String,
        vote: String,
        itemsRead: Int,
        installUrl: String,
    ): String = buildString {
        appendLine("⚖️ SimJury — Case $caseId “$caseTitle”")
        appendLine("Charge: $charge")
        appendLine("My verdict: ${vote.uppercase()} 🔒")
        appendLine("Trial items weighed: $itemsRead")
        appendLine("What really happened stays locked until you serve.")
        append("Take your own seat: $installUrl")
    }
}
