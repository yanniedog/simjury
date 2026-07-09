package simjury.app.share

/**
 * Offline juror codes (GROWTH.md M-2).
 *
 * Format: `SJ1-{CASE}-{VOTE}-{LEAN}-{TOKEN}-{CHECK}`
 * Example: `SJ1-C001-NG-U-4XK-Q`
 *
 * Spoiler-safe: encodes only case id, the player's vote, diary leaning, and a
 * short nonce — never reveal text, restored names, or the historical outcome.
 * Codes travel by any messaging app; no network required.
 */
object JurorCode {

    private const val SCHEME = "SJ1"
    /** Crockford Base32 without I, L, O, U — easy to read aloud / type. */
    private const val ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

    data class Payload(
        val caseMetaId: String,
        val vote: String,
        val leaning: String,
        val token: String,
    )

    fun mint(
        caseMetaId: String,
        vote: String,
        leaning: String,
        token: String = randomToken(),
    ): String {
        val casePart = compactCaseId(caseMetaId)
        val votePart = encodeVote(vote)
        val leanPart = encodeLeaning(leaning)
        val tokenPart = token.uppercase().also { require(it.matches(TOKEN_RE)) { "bad token" } }
        val body = listOf(SCHEME, casePart, votePart, leanPart, tokenPart)
        val check = checksumChar(body.joinToString("-"))
        return body.joinToString("-") + "-" + check
    }

    fun parse(raw: String): Payload? {
        val parts = raw.split('-').map { it.trim().uppercase() }.filter { it.isNotEmpty() }
        if (parts.size != 6) return null
        val scheme = parts[0]
        val casePart = parts[1]
        val votePart = parts[2]
        val leanPart = parts[3]
        val tokenPart = parts[4]
        val check = parts[5]
        if (scheme != SCHEME) return null
        if (!casePart.matches(CASE_RE)) return null
        if (votePart !in setOf("G", "NG")) return null
        if (leanPart !in setOf("G", "NG", "U")) return null
        if (!tokenPart.matches(TOKEN_RE)) return null
        if (check.length != 1 || check[0] !in ALPHABET) return null
        val body = listOf(scheme, casePart, votePart, leanPart, tokenPart).joinToString("-")
        if (checksumChar(body) != check[0]) return null
        return Payload(
            caseMetaId = expandCaseId(casePart),
            vote = decodeVote(votePart),
            leaning = decodeLeaning(leanPart),
            token = tokenPart,
        )
    }

    fun randomToken(rng: kotlin.random.Random = kotlin.random.Random.Default): String =
        buildString(3) {
            repeat(3) { append(ALPHABET[rng.nextInt(ALPHABET.length)]) }
        }

    internal fun compactCaseId(caseMetaId: String): String =
        caseMetaId.uppercase().replace("-", "").also {
            require(it.matches(CASE_RE)) { "bad case id: $caseMetaId" }
        }

    internal fun expandCaseId(compact: String): String =
        compact[0] + "-" + compact.substring(1)

    private fun encodeVote(vote: String): String = when (vote.trim().lowercase()) {
        "guilty", "g" -> "G"
        "not guilty", "ng" -> "NG"
        else -> throw IllegalArgumentException("vote must be Guilty or Not Guilty")
    }

    private fun decodeVote(code: String): String = when (code) {
        "G" -> "Guilty"
        "NG" -> "Not Guilty"
        else -> error("unreachable")
    }

    private fun encodeLeaning(leaning: String): String = when (leaning.trim().uppercase()) {
        "G" -> "G"
        "NG" -> "NG"
        "U" -> "U"
        else -> throw IllegalArgumentException("leaning must be G, NG, or U")
    }

    private fun decodeLeaning(code: String): String = code

    private fun checksumChar(body: String): Char {
        var sum = 0
        for (ch in body) {
            if (ch == '-') continue
            sum += ch.code
        }
        return ALPHABET[sum % ALPHABET.length]
    }

    private val CASE_RE = Regex("""^C\d{3}$""")
    private val TOKEN_RE = Regex("""^[$ALPHABET]{3}$""")
}
