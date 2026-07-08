package simjury.app.speech

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class NoOpTrialSpeechController : TrialSpeechController {
    private val _isSpeaking = MutableStateFlow(false)
    override val isSpeaking: StateFlow<Boolean> = _isSpeaking.asStateFlow()

    private val _isReady = MutableStateFlow(true)
    override val isReady: StateFlow<Boolean> = _isReady.asStateFlow()

    override fun configureWitnessRoles(pseudonymRefs: Collection<String>) = Unit

    override fun speak(segments: List<SpeechSegment>) {
        _isSpeaking.value = segments.isNotEmpty()
        if (segments.isEmpty()) return
        _isSpeaking.value = false
    }

    override fun speakSingle(text: String, roleKey: String) {
        speak(listOf(SpeechSegment(text, roleKey)))
    }

    override fun stop() {
        _isSpeaking.value = false
    }

    override fun shutdown() {
        stop()
    }
}
