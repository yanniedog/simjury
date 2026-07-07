package simjury.app

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import simjury.app.data.AssetCaseLoader
import simjury.app.data.RevealGate
import simjury.app.model.TrialItem
import simjury.app.model.resolveItem
import simjury.casemodel.LoadedCase
import simjury.casemodel.PseudonymReveal
import simjury.casemodel.TruthLayer
import simjury.deliberation.DeliberationAction
import simjury.deliberation.DeliberationPhase
import simjury.deliberation.DeliberationState
import simjury.deliberation.DiarySnapshot
import simjury.deliberation.PilotDeliberationEngine

data class PilotUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val caseTitle: String = "",
    val charge: String = "",
    val contentNotes: List<String> = emptyList(),
    val phase: DeliberationPhase = DeliberationPhase.SUMMONS,
    val episodeTitle: String = "",
    val episodeIntro: String = "",
    val itemOrder: List<String> = emptyList(),
    val itemsRead: Set<String> = emptySet(),
    val selectedItem: TrialItem? = null,
    val diary: DiarySnapshot? = null,
    val vote: String? = null,
    val revealTitle: String? = null,
    val revealLayers: List<TruthLayer> = emptyList(),
    val revealNames: List<PseudonymReveal> = emptyList(),
)

class PilotViewModel(application: Application) : AndroidViewModel(application) {

    private val seed = 1L
    private lateinit var loaded: LoadedCase
    private var engineState: DeliberationState = DeliberationState(caseId = "C-000", seed = seed)
    private val gate = RevealGate()

    var uiState: PilotUiState = PilotUiState()
        private set

    private var onStateChanged: (() -> Unit)? = null

    fun setOnStateChanged(listener: () -> Unit) {
        onStateChanged = listener
    }

    init {
        try {
            loaded = AssetCaseLoader(application.assets).load()
            engineState = PilotDeliberationEngine.initialState(loaded.meta.id, seed)
            publish()
        } catch (e: Exception) {
            uiState = PilotUiState(loading = false, error = e.message ?: "Failed to load case")
            onStateChanged?.invoke()
        }
    }

    fun acknowledgeSummons() = dispatch(DeliberationAction.AcknowledgeSummons)

    fun openItem(itemId: String) {
        val item = loaded.resolveItem(itemId) ?: return
        uiState = uiState.copy(selectedItem = item)
        onStateChanged?.invoke()
    }

    fun closeItem() {
        uiState = uiState.copy(selectedItem = null)
        onStateChanged?.invoke()
    }

    fun markItemRead(itemId: String) {
        dispatch(DeliberationAction.MarkItemRead(itemId))
        uiState = uiState.copy(selectedItem = null)
        onStateChanged?.invoke()
    }

    fun openDiary() = dispatch(DeliberationAction.OpenDiary)

    fun commitDiary(leaning: String, topReason: String, strongestDoubt: String) {
        dispatch(
            DeliberationAction.CommitDiary(
                leaning = leaning,
                topReason = topReason,
                strongestDoubt = strongestDoubt,
            ),
        )
    }

    fun castVote(position: String) {
        dispatch(DeliberationAction.CastVote(position))
        openReveal()
    }

    fun openReveal() {
        dispatch(DeliberationAction.OpenReveal)
        val truth = gate.openTruth(loaded)
        uiState = uiState.copy(
            revealTitle = truth.titleReveal,
            revealLayers = truth.truthFile.layers,
            revealNames = truth.truthFile.pseudonymReveal,
        )
        onStateChanged?.invoke()
    }

    val allItemsRead: Boolean
        get() = uiState.itemOrder.isNotEmpty() && uiState.itemOrder.all { it in uiState.itemsRead }

    private fun dispatch(action: DeliberationAction) {
        val wasLocked = engineState.verdictLocked
        engineState = PilotDeliberationEngine.step(engineState, action, seed)
        if (engineState.verdictLocked && !wasLocked) {
            gate.lockVerdict()
        }
        publish()
    }

    private fun publish() {
        val episode = loaded.trial.episodes.single()
        uiState = PilotUiState(
            loading = false,
            caseTitle = loaded.meta.titlePlay,
            charge = loaded.meta.charge.label,
            contentNotes = loaded.meta.contentNotes,
            phase = engineState.phase,
            episodeTitle = episode.title,
            episodeIntro = episode.introText,
            itemOrder = episode.itemOrder,
            itemsRead = engineState.itemsRead,
            selectedItem = uiState.selectedItem,
            diary = engineState.diary,
            vote = engineState.vote,
            revealTitle = uiState.revealTitle,
            revealLayers = uiState.revealLayers,
            revealNames = uiState.revealNames,
        )
        onStateChanged?.invoke()
    }
}
