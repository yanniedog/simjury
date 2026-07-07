package simjury.pilot

import simjury.deliberation.DeliberationAction
import simjury.deliberation.DeliberationPhase
import simjury.deliberation.PilotDeliberationEngine
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class MultiEpisodeEngineTest {

    @Test
    fun `C-001 all episode items advance engine to diary`() {
        val loaded = CaseLoader(caseId = "c_001").load()
        val allItemIds = loaded.trial.episodes.flatMap { it.itemOrder }
        assertTrue(allItemIds.size >= 60)

        val actions = buildList {
            add(DeliberationAction.AcknowledgeSummons)
            allItemIds.forEach { add(DeliberationAction.MarkItemRead(it)) }
            add(DeliberationAction.OpenDiary)
        }
        val end = PilotDeliberationEngine.reduce(
            PilotDeliberationEngine.initialState(loaded.meta.id, GameSession.DEFAULT_SEED),
            actions,
            GameSession.DEFAULT_SEED,
        )

        assertEquals(DeliberationPhase.DIARY, end.phase)
        assertEquals(allItemIds.size, end.itemsRead.size)
    }
}
