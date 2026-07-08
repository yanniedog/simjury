package simjury.app

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val SimJuryInk = Color(0xFF1A1410)
private val SimJuryParchment = Color(0xFFF4E8D4)
private val SimJuryAccent = Color(0xFFB8860B)
private val SimJuryAccentSoft = Color(0xFFD4A84B)
private val SimJuryMuted = Color(0xFF6B5B4F)
private val SimJurySurfaceDark = Color(0xFF241C16)
private val SimJurySurfaceLight = Color(0xFFFFF8EE)
private val SimJurySurfaceVariantDark = Color(0xFF2E241C)
private val SimJurySurfaceVariantLight = Color(0xFFEDE0CC)
private val SimJuryError = Color(0xFFC45C4A)

private val DarkColorScheme = darkColorScheme(
    primary = SimJuryAccent,
    onPrimary = SimJuryInk,
    primaryContainer = Color(0xFF3D3018),
    onPrimaryContainer = SimJuryAccentSoft,
    secondary = SimJuryMuted,
    onSecondary = SimJuryParchment,
    secondaryContainer = SimJurySurfaceVariantDark,
    onSecondaryContainer = SimJuryParchment,
    tertiary = Color(0xFF8B7355),
    onTertiary = SimJuryParchment,
    background = SimJuryInk,
    onBackground = SimJuryParchment,
    surface = SimJurySurfaceDark,
    onSurface = SimJuryParchment,
    surfaceVariant = SimJurySurfaceVariantDark,
    onSurfaceVariant = Color(0xFFC9B9A8),
    outline = Color(0xFF5A4A3E),
    outlineVariant = Color(0xFF3D3228),
    error = SimJuryError,
    onError = SimJuryParchment,
)

private val LightColorScheme = lightColorScheme(
    primary = SimJuryAccent,
    onPrimary = SimJuryParchment,
    primaryContainer = Color(0xFFFFF0D0),
    onPrimaryContainer = SimJuryInk,
    secondary = SimJuryMuted,
    onSecondary = SimJuryParchment,
    secondaryContainer = SimJurySurfaceVariantLight,
    onSecondaryContainer = SimJuryInk,
    tertiary = Color(0xFF8B7355),
    onTertiary = SimJuryParchment,
    background = SimJuryParchment,
    onBackground = SimJuryInk,
    surface = SimJurySurfaceLight,
    onSurface = SimJuryInk,
    surfaceVariant = SimJurySurfaceVariantLight,
    onSurfaceVariant = SimJuryMuted,
    outline = Color(0xFFB8A898),
    outlineVariant = Color(0xFFD8C8B8),
    error = SimJuryError,
    onError = SimJuryParchment,
)

private val SimJuryTypography = Typography(
    displaySmall = TextStyle(
        fontFamily = FontFamily.Serif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 36.sp,
        lineHeight = 44.sp,
        letterSpacing = (-0.25).sp,
    ),
    headlineMedium = TextStyle(
        fontFamily = FontFamily.Serif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 28.sp,
        lineHeight = 36.sp,
    ),
    headlineSmall = TextStyle(
        fontFamily = FontFamily.Serif,
        fontWeight = FontWeight.Medium,
        fontSize = 24.sp,
        lineHeight = 32.sp,
    ),
    titleLarge = TextStyle(
        fontFamily = FontFamily.Serif,
        fontWeight = FontWeight.Medium,
        fontSize = 22.sp,
        lineHeight = 28.sp,
    ),
    titleMedium = TextStyle(
        fontFamily = FontFamily.Serif,
        fontWeight = FontWeight.Medium,
        fontSize = 18.sp,
        lineHeight = 24.sp,
    ),
    titleSmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        letterSpacing = 0.1.sp,
    ),
    bodyLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 26.sp,
        letterSpacing = 0.15.sp,
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 22.sp,
        letterSpacing = 0.25.sp,
    ),
    bodySmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 12.sp,
        lineHeight = 18.sp,
        letterSpacing = 0.4.sp,
    ),
    labelLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        letterSpacing = 0.5.sp,
    ),
    labelMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        letterSpacing = 0.5.sp,
    ),
)

private val SimJuryShapes = Shapes(
    extraSmall = RoundedCornerShape(4.dp),
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(12.dp),
    large = RoundedCornerShape(16.dp),
    extraLarge = RoundedCornerShape(24.dp),
)

@Composable
fun SimJuryTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme,
        typography = SimJuryTypography,
        shapes = SimJuryShapes,
        content = content,
    )
}
