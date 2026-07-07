package simjury.app

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val SimJuryInk = Color(0xFF1A1410)
private val SimJuryParchment = Color(0xFFF4E8D4)
private val SimJuryAccent = Color(0xFFB8860B)
private val SimJuryMuted = Color(0xFF6B5B4F)

private val DarkColorScheme = darkColorScheme(
    primary = SimJuryAccent,
    onPrimary = SimJuryInk,
    background = SimJuryInk,
    onBackground = SimJuryParchment,
    surface = Color(0xFF241C16),
    onSurface = SimJuryParchment,
    secondary = SimJuryMuted,
    onSecondary = SimJuryParchment,
)

private val LightColorScheme = lightColorScheme(
    primary = SimJuryAccent,
    onPrimary = SimJuryParchment,
    background = SimJuryParchment,
    onBackground = SimJuryInk,
    surface = Color(0xFFFFF8EE),
    onSurface = SimJuryInk,
    secondary = SimJuryMuted,
    onSecondary = SimJuryParchment,
)

@Composable
fun SimJuryTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme,
        content = content,
    )
}
