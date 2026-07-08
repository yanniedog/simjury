package simjury.app.speech

import simjury.app.PilotSection
import simjury.app.PilotUiState
import simjury.app.model.TrialItem
import simjury.casemodel.PseudonymReveal
import simjury.casemodel.TruthLayer
import simjury.deliberation.DiarySnapshot

object ScreenSpeechBuilder {

    fun summons(state: PilotUiState): List<SpeechSegment> = buildList {
        add(SpeechRole.NARRATOR, state.caseTitle)
        add(SpeechRole.NARRATOR, "Charge: ${state.charge}")
        add(SpeechRole.NARRATOR, SUMMONS_BODY)
        state.contentNotes.forEach { add(SpeechRole.NARRATOR, it) }
    }

    fun episodeIntro(intro: String): List<SpeechSegment> =
        listOf(SpeechSegment(intro, SpeechRole.NARRATOR))

    fun trialItem(item: TrialItem): List<SpeechSegment> = buildList {
        add(item.speakerRole, "${item.title}. ${kindSpokenLabel(item.kind)}.")
        add(item.speakerRole, item.body)
        if (item.subtitle.isNotBlank()) {
            add(SpeechRole.CLERK, item.subtitle.replace("\n", ". "))
        }
    }

    fun diaryPrompt(): List<SpeechSegment> =
        listOf(SpeechSegment(DIARY_WARNING, SpeechRole.NARRATOR))

    fun committedDiary(diary: DiarySnapshot): List<SpeechSegment> = buildList {
        add(SpeechRole.NARRATOR, "Your committed verdict diary.")
        add(SpeechRole.NARRATOR, "Leaning: ${leaningLabel(diary.leaning)}")
        add(SpeechRole.NARRATOR, "Top reason: ${diary.topReason}")
        add(SpeechRole.NARRATOR, "Strongest doubt: ${diary.strongestDoubt}")
    }

    fun votePrompt(): List<SpeechSegment> =
        listOf(SpeechSegment(VOTE_INSTRUCTION, SpeechRole.NARRATOR))

    fun reveal(
        title: String?,
        layers: List<TruthLayer>,
        names: List<PseudonymReveal>,
    ): List<SpeechSegment> = buildList {
        add(SpeechRole.NARRATOR, title ?: "Reveal")
        layers.forEach { layer ->
            add(SpeechRole.NARRATOR, layer.heading)
            add(SpeechRole.NARRATOR, layer.body)
        }
        if (names.isNotEmpty()) {
            add(SpeechRole.NARRATOR, "Names restored.")
            names.forEach { row ->
                add(SpeechRole.NARRATOR, "${row.playName} was ${row.realName}. ${row.fateNote}")
            }
        }
    }

    fun forSection(state: PilotUiState): List<SpeechSegment> = when (state.activeSection) {
        PilotSection.SUMMONS -> summons(state)
        PilotSection.EVIDENCE -> {
            if (state.selectedItem != null) {
                trialItem(state.selectedItem)
            } else if (state.episodeIntro.isNotBlank()) {
                episodeIntro(state.episodeIntro)
            } else {
                listOf(SpeechSegment(EVIDENCE_OVERVIEW, SpeechRole.NARRATOR))
            }
        }
        PilotSection.DIARY -> if (state.diary != null) {
            committedDiary(state.diary)
        } else {
            diaryPrompt()
        }
        PilotSection.VOTE -> votePrompt()
        PilotSection.REVEAL -> reveal(state.revealTitle, state.revealLayers, state.revealNames)
    }

    fun canSpeak(state: PilotUiState): Boolean =
        !state.loading && state.error == null && forSection(state).isNotEmpty()

    private fun MutableList<SpeechSegment>.add(roleKey: String, text: String) {
        val trimmed = text.trim()
        if (trimmed.isNotEmpty()) {
            add(SpeechSegment(trimmed, roleKey))
        }
    }

    private fun kindSpokenLabel(kind: String): String = when (kind.lowercase()) {
        "examination" -> "Examination in chief"
        "cross" -> "Cross examination"
        "exhibit" -> "Exhibit"
        "direction" -> "Judge's direction"
        else -> kind
    }

    private fun leaningLabel(code: String): String = when (code) {
        "G" -> "Guilty"
        "NG" -> "Not guilty"
        else -> "Undecided"
    }

    private const val SUMMONS_BODY =
        "You have been called to serve on a jury. Names are changed during play and restored after your verdict is locked."
    private const val DIARY_WARNING = "Your verdict diary is permanent once committed."
    private const val VOTE_INSTRUCTION = "Lock your verdict. You cannot change it."
    private const val EVIDENCE_OVERVIEW = "Review each item of evidence before opening your verdict diary."
}
