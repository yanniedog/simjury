package simjury.app.speech

import kotlinx.coroutines.flow.StateFlow

interface TrialSpeechController {
    val isSpeaking: StateFlow<Boolean>
    val isReady: StateFlow<Boolean>

    fun configureWitnessRoles(pseudonymRefs: Collection<String>)
    fun speak(segments: List<SpeechSegment>)
    fun speakSingle(text: String, roleKey: String = SpeechRole.NARRATOR)
    fun stop()
    fun shutdown()
}
