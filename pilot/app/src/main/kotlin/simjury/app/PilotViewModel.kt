package simjury.app

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.withContext
import simjury.app.BuildConfig
import simjury.app.data.AssetCaseLoader
import simjury.app.data.CaseCatalog
import simjury.app.data.PilotSave
import simjury.app.data.PilotSaveRepository
import simjury.app.data.RevealGate
import simjury.app.model.TrialItem
import simjury.app.model.resolveItem
import simjury.app.speech.AndroidTrialSpeechController
import simjury.app.speech.ScreenSpeechBuilder
import simjury.app.speech.TrialSpeechController
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

data class ReadingItemRow(
    val id: String,
    val title: String,
    val kind: String,
    val isRead: Boolean,
)

enum class PilotSection {
    SUMMONS,
    EVIDENCE,
    DIARY,
    VOTE,
    REVEAL,
}

data class PilotNavTarget(
    val section: PilotSection,
    val enabled: Boolean,
    val selected: Boolean,
)

data class PilotUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val caseTitle: String = "",
    val charge: String = "",
    val contentNotes: List<String> = emptyList(),
    val phase: DeliberationPhase = DeliberationPhase.SUMMONS,
    val activeSection: PilotSection = PilotSection.SUMMONS,
    val navTargets: List<PilotNavTarget> = emptyList(),
    val showEpisodeHub: Boolean = false,
    val episodes: List<EpisodeSummary> = emptyList(),
    val allItemsRead: Boolean = false,
    val availableCases: List<String> = emptyList(),
    val activeCaseId: String = "",
    val showCasePicker: Boolean = false,
    val episodeTitle: String = "",
    val episodeIntro: String = "",
    val itemOrder: List<String> = emptyList(),
    val readingItems: List<ReadingItemRow> = emptyList(),
    val itemsRead: Set<String> = emptySet(),
    val selectedItem: TrialItem? = null,
    val previousItemId: String? = null,
    val nextItemId: String? = null,
    val diary: DiarySnapshot? = null,
    val vote: String? = null,
    val revealTitle: String? = null,
    val revealLayers: List<TruthLayer> = emptyList(),
    val revealNames: List<PseudonymReveal> = emptyList(),
    val isSpeaking: Boolean = false,
    val canListenAloud: Boolean = false,
    val canMarkItemsRead: Boolean = false,
)

class PilotViewModel(application: Application) : AndroidViewModel(application) {

    companion object {
        var speechControllerOverride: TrialSpeechController? = null
    }

    private val seed = 1L
    private val saveRepository = PilotSaveRepository(application)
    private val speech: TrialSpeechController =
        speechControllerOverride ?: AndroidTrialSpeechController(application)
    private lateinit var loaded: LoadedCase
    private var engineState: DeliberationState = DeliberationState(caseId = "C-000", seed = seed)
    private val gate = RevealGate()
    private var revealShown = false
    private var selectedEpisodeId: String? = null
    private var activeCaseId: String = BuildConfig.PILOT_CASE_ID
    private var browseSection: PilotSection? = null

    private val _uiState = MutableStateFlow(PilotUiState())
    val uiState: StateFlow<PilotUiState> = _uiState.asStateFlow()
    private var bootstrapJob: Job? = null

    init {
        bootstrapJob = viewModelScope.launch {
            bootstrapCase(activeCaseId)
        }
        viewModelScope.launch {
            speech.isSpeaking.collectLatest { speaking ->
                if (_uiState.value.isSpeaking != speaking) {
                    _uiState.value = _uiState.value.copy(isSpeaking = speaking)
                }
            }
        }
    }

    override fun onCleared() {
        speech.shutdown()
        super.onCleared()
    }

    fun selectCase(caseId: String) {
        if (caseId == activeCaseId) return
        bootstrapJob?.cancel()
        bootstrapJob = viewModelScope.launch {
            bootstrapCase(caseId)
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
        speech.stop()
        _uiState.value = _uiState.value.copy(selectedItem = item)
    }

    fun closeItem() {
        speech.stop()
        _uiState.value = _uiState.value.copy(selectedItem = null)
    }

    fun openAdjacentItem(delta: Int) {
        val items = currentItemOrder()
        val currentId = _uiState.value.selectedItem?.id ?: return
        val index = items.indexOf(currentId)
        if (index < 0) return
        val targetId = items.getOrNull(index + delta) ?: return
        openItem(targetId)
    }

    fun navigateTo(section: PilotSection) {
        speech.stop()
        when (section) {
            PilotSection.SUMMONS -> {
                if (engineState.phase == DeliberationPhase.SUMMONS) {
                    browseSection = null
                }
            }
            PilotSection.EVIDENCE -> {
                if (engineState.phase.ordinal >= DeliberationPhase.READING.ordinal) {
                    browseSection = PilotSection.EVIDENCE
                    _uiState.value = _uiState.value.copy(selectedItem = null)
                }
            }
            PilotSection.DIARY -> {
                when (engineState.phase) {
                    DeliberationPhase.READING -> if (_uiState.value.allItemsRead) openDiary()
                    DeliberationPhase.DIARY, DeliberationPhase.VOTE,
                    DeliberationPhase.REVEAL, DeliberationPhase.COMPLETE,
                    -> browseSection = PilotSection.DIARY
                    else -> Unit
                }
            }
            PilotSection.VOTE -> {
                if (engineState.phase.ordinal >= DeliberationPhase.VOTE.ordinal) {
                    browseSection = PilotSection.VOTE
                    _uiState.value = _uiState.value.copy(selectedItem = null)
                }
            }
            PilotSection.REVEAL -> {
                if (engineState.phase.ordinal >= DeliberationPhase.REVEAL.ordinal) {
                    browseSection = PilotSection.REVEAL
                    _uiState.value = _uiState.value.copy(selectedItem = null)
                }
            }
        }
        publish(selectedItem = _uiState.value.selectedItem)
    }

    fun listenAloud() {
        val segments = ScreenSpeechBuilder.forSection(_uiState.value)
        speech.speak(segments)
        _uiState.value = _uiState.value.copy(isSpeaking = true)
    }

    fun stopListening() {
        speech.stop()
        _uiState.value = _uiState.value.copy(isSpeaking = false)
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

    private suspend fun bootstrapCase(caseId: String) {
        try {
            val availableCases = withContext(Dispatchers.IO) {
                CaseCatalog.listFromAssets(getApplication<Application>().assets)
            }
            val restored = withContext(Dispatchers.IO) {
                val case = AssetCaseLoader(getApplication<Application>().assets, caseId).load()
                val save = saveRepository.load()
                SessionBootstrap(case, save)
            }
            activeCaseId = caseId
            selectedEpisodeId = null
            browseSection = null
            gate.reset()
            revealShown = false
            loaded = restored.case
            speech.configureWitnessRoles(loaded.pseudonyms.entries.map { it.id })
            if (restored.save != null && restored.save.caseId == loaded.meta.id && restored.save.seed == seed) {
                engineState = restored.save.engineState
                revealShown = restored.save.revealShown
                if (restored.save.verdictLocked) {
                    gate.lockVerdict()
                }
            } else {
                engineState = PilotDeliberationEngine.initialState(loaded.meta.id, seed)
            }
            publish(
                selectedItem = null,
                availableCases = availableCases,
                showCasePicker = BuildConfig.DEBUG && availableCases.size > 1,
            )
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            _uiState.value = PilotUiState(loading = false, error = e.message ?: "Failed to load case")
        }
    }

    private fun dispatch(action: DeliberationAction) {
        val wasLocked = engineState.verdictLocked
        val previousPhase = engineState.phase
        engineState = PilotDeliberationEngine.step(engineState, action, seed)
        if (engineState.verdictLocked && !wasLocked) {
            gate.lockVerdict()
        }
        if (engineState.phase != previousPhase) {
            browseSection = null
            speech.stop()
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

    private fun publish(
        selectedItem: TrialItem?,
        availableCases: List<String> = _uiState.value.availableCases,
        showCasePicker: Boolean = _uiState.value.showCasePicker,
    ) {
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
        val readingItems = activeEpisode?.itemOrder.orEmpty().mapNotNull { itemId ->
            loaded.resolveItem(itemId)?.let { item ->
                ReadingItemRow(
                    id = item.id,
                    title = item.title,
                    kind = item.kind,
                    isRead = itemId in engineState.itemsRead,
                )
            }
        }
        val defaultSection = defaultSectionForPhase(engineState.phase)
        val activeSection = browseSection?.takeIf { canBrowseTo(it, engineState.phase, allItemsRead) }
            ?: defaultSection
        val navTargets = buildNavTargets(engineState.phase, activeSection, allItemsRead)
        val itemOrder = activeEpisode?.itemOrder.orEmpty()
        val selectedId = selectedItem?.id
        val selectedIndex = if (selectedId != null) itemOrder.indexOf(selectedId) else -1
        val previousItemId = itemOrder.getOrNull(selectedIndex - 1)
        val nextItemId = itemOrder.getOrNull(selectedIndex + 1)

        var state = PilotUiState(
            loading = false,
            caseTitle = loaded.meta.titlePlay,
            charge = loaded.meta.charge.label,
            contentNotes = loaded.meta.contentNotes,
            phase = engineState.phase,
            activeSection = activeSection,
            navTargets = navTargets,
            showEpisodeHub = showEpisodeHub && activeSection == PilotSection.EVIDENCE,
            episodes = episodeSummaries,
            allItemsRead = allItemsRead,
            availableCases = availableCases,
            activeCaseId = activeCaseId,
            showCasePicker = showCasePicker,
            episodeTitle = activeEpisode?.title.orEmpty(),
            episodeIntro = activeEpisode?.introText.orEmpty(),
            itemOrder = activeEpisode?.itemOrder.orEmpty(),
            readingItems = readingItems,
            itemsRead = engineState.itemsRead,
            selectedItem = selectedItem,
            previousItemId = previousItemId,
            nextItemId = nextItemId,
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
        state = state.copy(
            isSpeaking = speech.isSpeaking.value,
            canListenAloud = ScreenSpeechBuilder.canSpeak(state),
            canMarkItemsRead = engineState.phase == DeliberationPhase.READING,
        )
        _uiState.value = state
    }

    private fun currentItemOrder(): List<String> {
        if (!::loaded.isInitialized) return emptyList()
        val episodes = loaded.trial.episodes
        val activeEpisode: Episode? = when {
            episodes.size == 1 -> episodes.single()
            selectedEpisodeId != null -> episodes.find { it.id == selectedEpisodeId }
            else -> null
        }
        return activeEpisode?.itemOrder.orEmpty()
    }

    private fun defaultSectionForPhase(phase: DeliberationPhase): PilotSection = when (phase) {
        DeliberationPhase.SUMMONS -> PilotSection.SUMMONS
        DeliberationPhase.READING -> PilotSection.EVIDENCE
        DeliberationPhase.DIARY -> PilotSection.DIARY
        DeliberationPhase.VOTE -> PilotSection.VOTE
        DeliberationPhase.REVEAL, DeliberationPhase.COMPLETE -> PilotSection.REVEAL
    }

    private fun canBrowseTo(
        section: PilotSection,
        phase: DeliberationPhase,
        allItemsRead: Boolean,
    ): Boolean = when (section) {
        PilotSection.SUMMONS -> phase == DeliberationPhase.SUMMONS
        PilotSection.EVIDENCE -> phase.ordinal >= DeliberationPhase.READING.ordinal
        PilotSection.DIARY -> phase.ordinal >= DeliberationPhase.DIARY.ordinal ||
            (phase == DeliberationPhase.READING && allItemsRead)
        PilotSection.VOTE -> phase.ordinal >= DeliberationPhase.VOTE.ordinal
        PilotSection.REVEAL -> phase.ordinal >= DeliberationPhase.REVEAL.ordinal
    }

    private fun buildNavTargets(
        phase: DeliberationPhase,
        activeSection: PilotSection,
        allItemsRead: Boolean,
    ): List<PilotNavTarget> {
        if (phase == DeliberationPhase.SUMMONS) return emptyList()
        return listOf(
            PilotNavTarget(
                section = PilotSection.EVIDENCE,
                enabled = phase.ordinal >= DeliberationPhase.READING.ordinal,
                selected = activeSection == PilotSection.EVIDENCE,
            ),
            PilotNavTarget(
                section = PilotSection.DIARY,
                enabled = phase.ordinal >= DeliberationPhase.DIARY.ordinal ||
                    (phase == DeliberationPhase.READING && allItemsRead),
                selected = activeSection == PilotSection.DIARY,
            ),
            PilotNavTarget(
                section = PilotSection.VOTE,
                enabled = phase.ordinal >= DeliberationPhase.VOTE.ordinal,
                selected = activeSection == PilotSection.VOTE,
            ),
            PilotNavTarget(
                section = PilotSection.REVEAL,
                enabled = phase.ordinal >= DeliberationPhase.REVEAL.ordinal,
                selected = activeSection == PilotSection.REVEAL,
            ),
        )
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
