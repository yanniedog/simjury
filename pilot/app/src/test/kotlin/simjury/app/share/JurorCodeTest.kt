package simjury.app.share

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random

class JurorCodeTest {

    @Test
    fun mint_roundTripsThroughParse() {
        val code = JurorCode.mint(
            caseMetaId = "C-001",
            vote = "Not Guilty",
            leaning = "U",
            token = "4XK",
        )
        assertEquals("SJ1-C001-NG-U-4XK-3", code)
        val parsed = JurorCode.parse(code)
        assertNotNull(parsed)
        assertEquals("C-001", parsed!!.caseMetaId)
        assertEquals("Not Guilty", parsed.vote)
        assertEquals("U", parsed.leaning)
        assertEquals("4XK", parsed.token)
    }

    @Test
    fun mint_acceptsGuiltyAndNgLeaning() {
        val code = JurorCode.mint("C-000", "Guilty", "NG", token = "ABC")
        val parsed = JurorCode.parse(code)!!
        assertEquals("C-000", parsed.caseMetaId)
        assertEquals("Guilty", parsed.vote)
        assertEquals("NG", parsed.leaning)
    }

    @Test
    fun parse_rejectsTamperedChecksum() {
        val good = JurorCode.mint("C-001", "Guilty", "G", token = "7HM")
        val bad = good.dropLast(1) + if (good.last() == '0') '1' else '0'
        assertNull(JurorCode.parse(bad))
    }

    @Test
    fun parse_rejectsWrongSchemeOrShape() {
        assertNull(JurorCode.parse("SJ0-C001-NG-U-4XK-Q"))
        assertNull(JurorCode.parse("SJ1-C001-NG-U-4XK"))
        assertNull(JurorCode.parse(""))
        assertNull(JurorCode.parse("not-a-code"))
    }

    @Test
    fun parse_isCaseInsensitiveAndTrims() {
        val code = JurorCode.mint("C-001", "Not Guilty", "G", token = "2NP")
        assertNotNull(JurorCode.parse("  ${code.lowercase()}  "))
    }

    @Test
    fun randomToken_staysInAlphabet() {
        repeat(20) {
            val t = JurorCode.randomToken(Random(it))
            assertEquals(3, t.length)
            assertTrue(t.all { ch -> ch in "0123456789ABCDEFGHJKMNPQRSTVWXYZ" })
        }
    }

    @Test
    fun mintedCode_hasNoF4Tokens() {
        val banned = listOf("beck", "1896", "old bailey", "gurrin", "pardon")
        val code = JurorCode.mint("C-001", "Not Guilty", "NG", token = "4XK").lowercase()
        banned.forEach { token ->
            assertFalse("juror code leaked '$token'", code.contains(token))
        }
    }
}
