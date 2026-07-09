package simjury.app.share

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class JurorCodeTest {

    private val verdicts = listOf("Guilty", "Not Guilty")
    private val leanings = listOf("G", "NG", "U")
    private val tags = listOf("AAA", "ZZZ", "Q2R")

    @Test
    fun roundTrip_allVerdictAndLeaningCombos() {
        verdicts.forEach { verdict ->
            leanings.forEach { leaning ->
                tags.forEach { tag ->
                    val code = JurorCode.encode("C-001", verdict, leaning, tag)
                    val decoded = JurorCode.decode(code)
                    assertNotNull("failed to decode $code", decoded)
                    assertEquals("C001", decoded!!.caseCompact)
                    assertEquals(verdict, decoded.verdict)
                    assertEquals(leaning, decoded.leaning)
                    assertEquals(tag, decoded.tag)
                    assertEquals(code, decoded.normalized)
                }
            }
        }
    }

    @Test
    fun decode_isForgivingAboutCaseAndSpacing() {
        val code = JurorCode.encode("C-000", "Guilty", "U", "MNP")
        val sloppy = code.lowercase().replace("-", " ")
        val decoded = JurorCode.decode("  $sloppy  ")
        assertNotNull(decoded)
        assertEquals(code, decoded!!.normalized)
    }

    @Test
    fun decode_rejectsTamperAndGarbage() {
        val code = JurorCode.encode("C-001", "Not Guilty", "NG", "XYZ")
        val tampered = code.dropLast(1) + if (code.last() == 'A') 'B' else 'A'
        assertNull(JurorCode.decode(tampered))
        assertNull(JurorCode.decode(""))
        assertNull(JurorCode.decode("SJ1-C001"))
        assertNull(JurorCode.decode("hello there general"))
        assertNull(JurorCode.decode(code.replaceFirst("SJ1", "SJ2")))
    }

    @Test
    fun code_doesNotSpellOutTheVerdict() {
        // Verdict + leaning ride in one masked char, so a glance at a chat
        // message cannot anchor a juror who has not voted yet.
        val code = JurorCode.encode("C-001", "Not Guilty", "NG", "ABC")
        assertTrue(code.matches(Regex("SJ1-C001-[A-Z2-9]-[A-Z2-9]{3}-[A-Z2-9]")))
    }

    @Test
    fun newTag_isWellFormedAndUsableInCodes() {
        repeat(50) {
            val tag = JurorCode.newTag()
            val decoded = JurorCode.decode(JurorCode.encode("C-000", "Guilty", "G", tag))
            assertNotNull(decoded)
            assertEquals(tag, decoded!!.tag)
        }
    }
}
