package simjury.app.speech

import android.content.Context
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.Locale
import java.util.concurrent.atomic.AtomicInteger

class AndroidTrialSpeechController(
    context: Context,
) : TrialSpeechController, TextToSpeech.OnInitListener {

    private val appContext = context.applicationContext
    private val tts = TextToSpeech(appContext, this)
    private var voiceAssigner = VoiceAssigner()
    private var englishVoices: List<Voice> = emptyList()
    private val voiceSlots: MutableMap<String, Voice?> = mutableMapOf()
    private val utteranceCounter = AtomicInteger(0)
    private var pendingSegments: List<SpeechSegment> = emptyList()
    private var segmentIndex = 0
    private var currentUtteranceId: String? = null

    private val _isSpeaking = MutableStateFlow(false)
    override val isSpeaking: StateFlow<Boolean> = _isSpeaking.asStateFlow()

    private val _isReady = MutableStateFlow(false)
    override val isReady: StateFlow<Boolean> = _isReady.asStateFlow()

    override fun onInit(status: Int) {
        if (status != TextToSpeech.SUCCESS) return
        tts.language = Locale.UK
        englishVoices = tts.voices
            ?.filter { voice ->
                voice.locale?.language?.equals("en", ignoreCase = true) == true &&
                    !voice.isNetworkConnectionRequired
            }
            ?.sortedBy { it.name }
            .orEmpty()
        synchronized(this) {
            bindVoiceSlots()
        }
        tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) = Unit

            override fun onDone(utteranceId: String?) {
                if (utteranceId == null) return
                synchronized(this@AndroidTrialSpeechController) {
                    if (utteranceId != currentUtteranceId) return
                    playNextSegment()
                }
            }

            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String?) {
                onDone(utteranceId)
            }

            override fun onError(utteranceId: String?, errorCode: Int) {
                onDone(utteranceId)
            }
        })
        _isReady.value = true
        synchronized(this) {
            if (pendingSegments.isNotEmpty()) {
                val queued = pendingSegments
                pendingSegments = emptyList()
                speakLocked(queued)
            }
        }
    }

    override fun configureWitnessRoles(pseudonymRefs: Collection<String>) {
        synchronized(this) {
            voiceAssigner = VoiceAssigner.fromCaseWitnessRefs(pseudonymRefs)
            bindVoiceSlots()
        }
    }

    override fun speak(segments: List<SpeechSegment>) {
        val cleaned = segments.mapNotNull { segment ->
            val text = segment.text.trim()
            if (text.isEmpty()) null else segment.copy(text = text)
        }
        synchronized(this) {
            if (!_isReady.value) {
                pendingSegments = cleaned
                return
            }
            speakLocked(cleaned)
        }
    }

    override fun speakSingle(text: String, roleKey: String) {
        speak(listOf(SpeechSegment(text = text, roleKey = roleKey)))
    }

    override fun stop() {
        synchronized(this) {
            if (_isReady.value) {
                tts.stop()
            }
            pendingSegments = emptyList()
            segmentIndex = 0
            currentUtteranceId = null
            _isSpeaking.value = false
        }
    }

    override fun shutdown() {
        stop()
        tts.shutdown()
        _isReady.value = false
    }

    private fun speakLocked(cleaned: List<SpeechSegment>) {
        stop()
        if (cleaned.isEmpty()) return
        pendingSegments = cleaned
        segmentIndex = 0
        _isSpeaking.value = true
        playNextSegment()
    }

    private fun playNextSegment() {
        synchronized(this) {
            if (segmentIndex >= pendingSegments.size) {
                pendingSegments = emptyList()
                segmentIndex = 0
                currentUtteranceId = null
                _isSpeaking.value = false
                return
            }
            val segment = pendingSegments[segmentIndex]
            segmentIndex += 1
            applyProfile(voiceAssigner.profileFor(segment.roleKey))
            val utteranceId = UTTERANCE_PREFIX + utteranceCounter.incrementAndGet()
            currentUtteranceId = utteranceId
            val params = Bundle()
            tts.speak(segment.text, TextToSpeech.QUEUE_FLUSH, params, utteranceId)
        }
    }

    private fun applyProfile(profile: VoiceProfile) {
        tts.setPitch(profile.pitch)
        tts.setSpeechRate(profile.rate)
        val voice = profile.voiceName?.let { voiceSlots[it] }
        if (voice != null) {
            tts.voice = voice
        }
    }

    private fun bindVoiceSlots() {
        if (englishVoices.isEmpty()) return
        val slots = listOf(
            VoiceAssigner.VOICE_NARRATOR,
            VoiceAssigner.VOICE_JUDGE,
            VoiceAssigner.VOICE_CLERK,
        ) + VoiceAssigner.WITNESS_VOICES + listOf(VoiceAssigner.VOICE_WITNESS_FALLBACK)
        slots.forEachIndexed { index, slot ->
            voiceSlots[slot] = englishVoices.getOrElse(index % englishVoices.size) { englishVoices.first() }
        }
    }

    companion object {
        private const val UTTERANCE_PREFIX = "simjury-utt-"
    }
}
