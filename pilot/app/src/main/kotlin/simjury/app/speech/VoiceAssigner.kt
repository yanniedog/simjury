package simjury.app.speech

/**
 * Maps logical courtroom roles to distinct TTS voice profiles.
 * Witnesses keyed by pseudonym ref always receive the same profile.
 */
class VoiceAssigner(
  private val witnessRoles: Set<String> = emptySet(),
) {
    private val witnessOrder: List<String> = witnessRoles.sorted()
    private val profiles: Map<String, VoiceProfile> = buildProfiles()

    fun profileFor(roleKey: String): VoiceProfile =
        profiles[roleKey] ?: profiles.getValue(SpeechRole.NARRATOR)

    private fun buildProfiles(): Map<String, VoiceProfile> {
        val result = mutableMapOf<String, VoiceProfile>(
            SpeechRole.NARRATOR to VoiceProfile(pitch = 1.0f, rate = 0.95f, voiceName = VOICE_NARRATOR),
            SpeechRole.JUDGE to VoiceProfile(pitch = 0.82f, rate = 0.88f, voiceName = VOICE_JUDGE),
            SpeechRole.CLERK to VoiceProfile(pitch = 1.05f, rate = 0.92f, voiceName = VOICE_CLERK),
        )
        witnessOrder.forEachIndexed { index, roleKey ->
            val voiceName = WITNESS_VOICES.getOrElse(index) { VOICE_WITNESS_FALLBACK }
            val pitch = 1.0f + (index * 0.04f)
            result[roleKey] = VoiceProfile(pitch = pitch, rate = 0.93f, voiceName = voiceName)
        }
        return result
    }

    companion object {
        // Logical voice slots — resolved to device voices at runtime when available.
        const val VOICE_NARRATOR = "narrator"
        const val VOICE_JUDGE = "judge"
        const val VOICE_CLERK = "clerk"
        const val VOICE_WITNESS_FALLBACK = "witness"
        val WITNESS_VOICES = listOf("witness_a", "witness_b", "witness_c", "witness_d")

        fun witnessRolesFromKeys(keys: Collection<String>): Set<String> =
            keys.filter { SpeechRole.isWitness(it) }.toSet()

        fun fromCaseWitnessRefs(pseudonymRefs: Collection<String>): VoiceAssigner =
            VoiceAssigner(pseudonymRefs.map { SpeechRole.witness(it) }.toSet())
    }
}
