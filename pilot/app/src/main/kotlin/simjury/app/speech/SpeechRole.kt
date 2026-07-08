package simjury.app.speech

object SpeechRole {
    const val NARRATOR = "narrator"
    const val JUDGE = "judge"
    const val CLERK = "clerk"

    fun witness(pseudonymRef: String): String = "witness:$pseudonymRef"

    fun isWitness(roleKey: String): Boolean = roleKey.startsWith("witness:")
}

data class SpeechSegment(
    val text: String,
    val roleKey: String,
)

data class VoiceProfile(
    val pitch: Float,
    val rate: Float,
    val voiceName: String? = null,
)
