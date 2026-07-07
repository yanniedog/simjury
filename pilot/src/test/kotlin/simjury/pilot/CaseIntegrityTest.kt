package simjury.pilot

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class CaseIntegrityTest {

  private val loaded = CaseLoader().load()

  @Test
  fun `C-000 loads and validates`() {
    assertEquals("C-000", loaded.meta.id)
    assertTrue(loaded.meta.synthetic)
    assertEquals(2, loaded.trial.witnesses.size)
    assertTrue(loaded.trial.witnesses.sumOf { it.blocks.size } >= 4)
    assertTrue(loaded.trial.exhibits.size >= 2)
  }

  @Test
  fun `every testimony block has source`() {
    loaded.trial.witnesses.flatMap { it.blocks }.forEach { block ->
      assertTrue(block.source.sourceId.isNotBlank())
      assertTrue(loaded.sources.sources.any { it.id == block.source.sourceId })
    }
  }

  @Test
  fun `episode item order resolves`() {
    val ids = buildSet {
      loaded.trial.witnesses.flatMap { it.blocks }.forEach { add(it.id) }
      loaded.trial.exhibits.forEach { add(it.id) }
      loaded.trial.directions.forEach { add(it.id) }
    }
    loaded.trial.episodes.flatMap { it.itemOrder }.forEach { assertTrue(it in ids, "missing $it") }
  }

  @Test
  fun `exactly one episode required for pilot`() {
    assertEquals(1, loaded.trial.episodes.size)
  }

  @Test
  fun `truth reveal pseudonyms resolve`() {
    val pseudoIds = loaded.pseudonyms.entries.map { it.id }.toSet()
    loaded.truthFile.pseudonymReveal.forEach { reveal ->
      assertTrue(reveal.pseudonymRef in pseudoIds, "unknown ${reveal.pseudonymRef}")
    }
  }
}

class RevealGateTest {

  private val loaded = CaseLoader().load()

  @Test
  fun `truth blocked before verdict lock`() {
    val gate = RevealGate()
    assertFailsWith<RevealBlockedException> { gate.openTruth(loaded) }
  }

  @Test
  fun `truth available after verdict lock`() {
    val gate = RevealGate()
    gate.lockVerdict()
    val truth = gate.openTruth(loaded)
    assertTrue(truth.titleReveal.contains("Pocket Watch"))
    assertTrue(truth.pseudonymRealNames.isNotEmpty())
  }
}
