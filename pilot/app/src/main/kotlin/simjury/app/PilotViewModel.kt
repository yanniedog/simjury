package simjury.app

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import simjury.app.data.AssetCaseLoader
import simjury.app.data.PilotSave
import simjury.app.data.PilotSaveRepository
import simjury.app.data.RevealGate
import simjury.app.model.TrialItem
import simjury.app.model.resolveItem
import simjury.casemodel.Episode
import simjury.casemodel.GatedTruth
import simjury.casemodel.LoadedCase
import simjury.casemodel.PseudonymReveal
import simjury.casemodel.TruthLayer
import simjury.deliberation.DeliberationAction
import simjury.deliberation.DeliberationPhase
import simjury.deliberation.DeliberationState
import simjury.deliberation.DiarySnapshot
import simjury.deliberation.PilotDeliberationEngine

data class EpisodeSummary(
    val id: String,
    val title: String,
    val itemsTotal: Int,
    val itemsRead: Int,
)

data class PilotUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val caseTitle: String = "",
    val charge: String = "",
    val contentNotes: List<String> = emptyList(),
    val phase: DeliberationPhase = DeliberationPhase.SUMMONS,
    val showEpisodeHub: Boolean = false,
    val episodes: List<EpisodeSummary> = emptyList(),
    val allItemsRead: Boolean = false,
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
    private val saveRepository = PilotSaveRepository(application)
    private lateinit var loaded: LoadedCase
    private var engineState: DeliberationState = DeliberationState(caseId = "C-000", seed = seed)
    private val gate = RevealGate()
    private var revealShown = false
    private var selectedEpisodeId: String? = null

    private val _uiState = MutableStateFlow(PilotUiState())
    val uiState: StateFlow<PilotUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            try {
                val restored = withContext(Dispatchers.IO) {
                    val case = AssetCaseLoader(application.assets).load()
                    val save = saveRepository.load()
                    SessionBootstrap(case, save)
                }
                loaded = restored.case
                if (restored.save != null && restored.save.caseId == loaded.meta.id && restored.save.seed == seed) {
                    engineState = restored.save.engineState
                    revealShown = restored.save.revealShown
                    if (restored.save.verdictLocked) {
                        gate.lockVerdict()
                    }
                } else {
                    engineState = PilotDeliberationEngine.initialState(loaded.meta.id, seed)
                }
                publish(selectedItem = null)
            } catch (e: Exception) {
                _uiState.value = PilotUiState(loading = false, error = e.message ?: "Failed to load case")
            }
        }
    }

    fun acknowledgeSummons() = dispatch(DeliberationAction.AcknowledgeSummons)

    fun selectEpisode(episodeId: String) {
        selectedEpisodeId = episodeId
        publish(selectedItem = null)
    }

    fun backToEpisodeHub() {
        selectedEpisodeId = null
        publish(selectedItem = null)
    }

    fun openItem(itemId: String) {
        val item = loaded.resolveItem(itemId) ?: return
        _uiState.value = _uiState.value.copy(selectedItem = item)
    }

    fun closeItem() {
        _uiState.value = _uiState.value.copy(selectedItem = null)
    }

    fun markItemRead(itemId: String) {
        dispatch(DeliberationAction.MarkItemRead(itemId))
        _uiState.value = _uiState.value.copy(selectedItem = null)
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
        revealShown = true
        persist()
        applyReveal(truth)
    }

    val allItemsRead: Boolean
        get() = _uiState.value.allItemsRead

    private fun dispatch(action: DeliberationAction) {
        val wasLocked = engineState.verdictLocked
        engineState = PilotDeliberationEngine.step(engineState, action, seed)
        if (engineState.verdictLocked && !wasLocked) {
            gate.lockVerdict()
        }
        publish(selectedItem = _uiState.value.selectedItem)
        persist()
    }

    private fun persist() {
        if (!::loaded.isInitialized) return
        viewModelScope.launch(Dispatchers.IO) {
            saveRepository.save(
                PilotSave(
                    caseId = loaded.meta.id,
                    seed = seed,
                    engineState = engineState,
                    verdictLocked = gate.isVerdictLocked(),
                    revealShown = revealShown,
                ),
            )
        }
    }

    private fun applyReveal(truth: GatedTruth) {
        _uiState.value = _uiState.value.copy(
            revealTitle = truth.titleReveal,
            revealLayers = truth.truthFile.layers,
            revealNames = truth.truthFile.pseudonymReveal,
        )
    }

    private fun publish(selectedItem: TrialItem?) {
        val episodes = loaded.trial.episodes
        val episodeSummaries = episodes.map { ep -> ep.toSummary(engineState.itemsRead) }
        val multiEpisode = episodes.size > 1
        val showEpisodeHub = multiEpisode && selectedEpisodeId == null
        val activeEpisode: Episode? = when {
            episodes.size == 1 -> episodes.single()
            selectedEpisodeId != null -> episodes.find { it.id == selectedEpisodeId }
            else -> null
        }
        val allIds = episodes.flatMap { it.itemOrder }
        val allItemsRead = allIds.isNotEmpty() && allIds.all { it in engineState.itemsRead }

        var state = PilotUiState(
            loading = false,
            caseTitle = loaded.meta.titlePlay,
            charge = loaded.meta.charge.label,
            contentNotes = loaded.meta.contentNotes,
            phase = engineState.phase,
            showEpisodeHub = showEpisodeHub,
            episodes = episodeSummaries,
            allItemsRead = allItemsRead,
            episodeTitle = activeEpisode?.title.orEmpty(),
            episodeIntro = activeEpisode?.introText.orEmpty(),
            itemOrder = activeEpisode?.itemOrder.orEmpty(),
            itemsRead = engineState.itemsRead,
            selectedItem = selectedItem,
            diary = engineState.diary,
            vote = engineState.vote,
        )
        if (revealShown && gate.isVerdictLocked()) {
            val truth = gate.openTruth(loaded)
            state = state.copy(
                revealTitle = truth.titleReveal,
                revealLayers = truth.truthFile.layers,
                revealNames = truth.truthFile.pseudonymReveal,
            )
        }
        _uiState.value = state
    }

    private fun Episode.toSummary(itemsRead: Set<String>): EpisodeSummary =
        EpisodeSummary(
            id = id,
            title = title,
            itemsTotal = itemOrder.size,
            itemsRead = itemOrder.count { it in itemsRead },
        )

    private data class SessionBootstrap(
        val case: LoadedCase,
        val save: PilotSave?,
    )
}
