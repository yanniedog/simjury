package simjury.app.share

import kotlin.random.Random

/**
 * Offline "juror code" codec (GROWTH.md M-2). A code carries one juror's locked
 * verdict for one case between phones as a short string — no network, no server.
 *
 * Format: `SJ1-<CASE>-<P>-<TAG>-<K>`
 * - `CASE`: case metadata id compacted to alphanumerics ("C-001" → "C001")
 * - `P`: verdict + diary leaning packed into one alphabet char, masked with a
 *   tag-derived offset. Obfuscation, not secrecy: it keeps a glance at a chat
 *   message from anchoring a juror who has not voted yet (P-7 spirit); a
 *   determined reader can decode it, and that is fine.
 * - `TAG`: per-playthrough juror tag, so two friends with identical verdicts
 *   produce distinct codes and a juror cannot seat their own code
 * - `K`: checksum char over CASE + P + TAG, catching retyping mistakes
 */
object JurorCode {

    const val BENCH_SEATS = 12

    // No 0/1/I/L/O — codes get retyped from chat messages.
    private const val ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
    private const val PREFIX = "SJ1"
    private const val TAG_LENGTH = 3
    private val VERDICTS = listOf("Guilty", "Not Guilty")
    private val LEANINGS = listOf("G", "NG", "U")

    data class Decoded(
        val caseCompact: String,
        val verdict: String,
        val leaning: String,
        val tag: String,
        val normalized: String,
    )

    fun compactCaseId(caseId: String): String =
        caseId.filter { it.isLetterOrDigit() }.uppercase()

    fun newTag(random: Random = Random.Default): String =
        buildString { repeat(TAG_LENGTH) { append(ALPHABET[random.nextInt(ALPHABET.length)]) } }

    fun encode(caseId: String, verdict: String, leaning: String, tag: String): String {
        val caseCompact = compactCaseId(caseId)
        val verdictIndex = VERDICTS.indexOf(verdict).coerceAtLeast(0)
        val leaningIndex = LEANINGS.indexOf(leaning).let { if (it >= 0) it else LEANINGS.lastIndex }
        val packed = verdictIndex * LEANINGS.size + leaningIndex
        val payloadChar = ALPHABET[Math.floorMod(packed + mask(tag), ALPHABET.length)]
        return "$PREFIX-$caseCompact-$payloadChar-$tag-${checksum(caseCompact, payloadChar, tag)}"
    }

    /** Returns null for anything that is not a well-formed, checksum-valid code. */
    fun decode(raw: String): Decoded? {
        val segments = raw.trim().uppercase().split(Regex("[\\s-]+")).filter { it.isNotEmpty() }
        if (segments.size != 5 || segments[0] != PREFIX) return null
        val (_, caseCompact, payload, tag, check) = segments
        if (payload.length != 1 || tag.length != TAG_LENGTH || check.length != 1) return null
        if (caseCompact.isEmpty() || caseCompact.any { !it.isLetterOrDigit() }) return null
        if (tag.any { it !in ALPHABET }) return null
        val payloadChar = payload.single()
        if (payloadChar !in ALPHABET) return null
        if (check.single() != checksum(caseCompact, payloadChar, tag)) return null
        val packed = Math.floorMod(ALPHABET.indexOf(payloadChar) - mask(tag), ALPHABET.length)
        if (packed >= VERDICTS.size * LEANINGS.size) return null
        return Decoded(
            caseCompact = caseCompact,
            verdict = VERDICTS[packed / LEANINGS.size],
            leaning = LEANINGS[packed % LEANINGS.size],
            tag = tag,
            normalized = "$PREFIX-$caseCompact-$payload-$tag-$check",
        )
    }

    private fun mask(tag: String): Int = tag.sumOf { it.code } % ALPHABET.length

    private fun checksum(caseCompact: String, payloadChar: Char, tag: String): Char =
        ALPHABET["$caseCompact$payloadChar$tag".sumOf { it.code } % ALPHABET.length]
}
