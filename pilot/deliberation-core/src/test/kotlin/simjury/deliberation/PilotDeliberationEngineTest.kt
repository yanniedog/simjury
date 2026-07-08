package simjury.deliberation

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class PilotDeliberationEngineTest {

    private val seed = 42L
    private val caseId = "C-000"

  @Test
  fun `happy path reaches complete`() {
    val actions = listOf(
      DeliberationAction.AcknowledgeSummons,
      DeliberationAction.MarkItemRead("T-W01-001"),
      DeliberationAction.OpenDiary,
      DeliberationAction.CommitDiary("G", "Receipt matches witness account.", "Pawn timing unclear."),
      DeliberationAction.CastVote("Guilty"),
      DeliberationAction.OpenReveal,
    )
    val end = PilotDeliberationEngine.reduce(
      PilotDeliberationEngine.initialState(caseId, seed),
      actions,
      seed,
    )
    assertEquals(DeliberationPhase.COMPLETE, end.phase)
    assertTrue(end.verdictLocked)
    assertTrue(end.revealComplete)
    assertEquals(6, end.eventLog.size)
  }

  @Test
  fun `determinism - identical actions yield byte-identical event log`() {
    val actions = listOf(
      DeliberationAction.AcknowledgeSummons,
      DeliberationAction.MarkItemRead("T-W01-001"),
      DeliberationAction.MarkItemRead("X-01"),
      DeliberationAction.OpenDiary,
      DeliberationAction.CommitDiary("NG", "No proof of intent to steal.", "Watch was found elsewhere."),
      DeliberationAction.CastVote("Not Guilty"),
      DeliberationAction.OpenReveal,
    )
    fun runOnce(): String {
      val end = PilotDeliberationEngine.reduce(
        PilotDeliberationEngine.initialState(caseId, seed),
        actions,
        seed,
      )
      return deliberationJson.encodeToString(DeliberationState.serializer(), end)
    }
    assertEquals(runOnce(), runOnce())
  }

  @Test
  fun `reveal blocked before verdict lock`() {
    val reading = PilotDeliberationEngine.step(
      PilotDeliberationEngine.initialState(caseId, seed),
      DeliberationAction.AcknowledgeSummons,
      seed,
    )
    assertFailsWith<IllegalDeliberationTransition> {
      PilotDeliberationEngine.step(reading, DeliberationAction.OpenReveal, seed)
    }
  }

  @Test
  fun `diary phase requires OpenDiary transition`() {
    val reading = PilotDeliberationEngine.reduce(
      PilotDeliberationEngine.initialState(caseId, seed),
      listOf(
        DeliberationAction.AcknowledgeSummons,
        DeliberationAction.MarkItemRead("T-W01-001"),
      ),
      seed,
    )
    assertEquals(DeliberationPhase.READING, reading.phase)
    assertFailsWith<IllegalDeliberationTransition> {
      PilotDeliberationEngine.step(
        reading,
        DeliberationAction.CommitDiary("G", "Valid reason here.", "Valid doubt here."),
        seed,
      )
    }
  }

  @Test
  fun `openDiary blocked until all expected items read`() {
    val expected = setOf("T-W01-001", "X-01")
    val reading = PilotDeliberationEngine.reduce(
      PilotDeliberationEngine.initialState(caseId, seed, expectedItemIds = expected),
      listOf(
        DeliberationAction.AcknowledgeSummons,
        DeliberationAction.MarkItemRead("T-W01-001"),
      ),
      seed,
    )
    assertFailsWith<IllegalDeliberationTransition> {
      PilotDeliberationEngine.step(reading, DeliberationAction.OpenDiary, seed)
    }
    val ready = PilotDeliberationEngine.step(
      reading,
      DeliberationAction.MarkItemRead("X-01"),
      seed,
    )
    val diary = PilotDeliberationEngine.step(ready, DeliberationAction.OpenDiary, seed)
    assertEquals(DeliberationPhase.DIARY, diary.phase)
  }

  @Test
  fun `replay reset returns to summons`() {
    val complete = PilotDeliberationEngine.reduce(
      PilotDeliberationEngine.initialState(caseId, seed),
      listOf(
        DeliberationAction.AcknowledgeSummons,
        DeliberationAction.OpenDiary,
        DeliberationAction.CommitDiary("U", "Need more time to decide.", "Conflicting testimony."),
        DeliberationAction.CastVote("Guilty"),
        DeliberationAction.OpenReveal,
      ),
      seed,
    )
    val reset = PilotDeliberationEngine.step(complete, DeliberationAction.ResetForReplay, seed)
    assertEquals(DeliberationPhase.SUMMONS, reset.phase)
    assertEquals(emptySet<String>(), reset.itemsRead)
    assertEquals(emptySet<String>(), reset.expectedItemIds)
    assertEquals(null, reset.diary)
  }

  @Test
  fun `replay reset preserves expected item ids`() {
    val expected = setOf("T-W01-001", "X-01")
    val complete = PilotDeliberationEngine.reduce(
      PilotDeliberationEngine.initialState(caseId, seed, expectedItemIds = expected),
      listOf(
        DeliberationAction.AcknowledgeSummons,
        DeliberationAction.MarkItemRead("T-W01-001"),
        DeliberationAction.MarkItemRead("X-01"),
        DeliberationAction.OpenDiary,
        DeliberationAction.CommitDiary("G", "Valid reason here.", "Valid doubt here."),
        DeliberationAction.CastVote("Guilty"),
        DeliberationAction.OpenReveal,
      ),
      seed,
    )
    val reset = PilotDeliberationEngine.step(complete, DeliberationAction.ResetForReplay, seed)
    assertEquals(expected, reset.expectedItemIds)
  }
}
