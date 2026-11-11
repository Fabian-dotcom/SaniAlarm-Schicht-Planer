package com.fabian.sanialarmplaner.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.Color
import com.fabian.sanialarmplaner.ui.V2
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp

private val LightColorScheme = lightColorScheme(
    primary = V2.Blau,
    onPrimary = Color.White,
    background = V2.Hintergrund,        // warmes Creme aus index-v2
    onBackground = V2.Ink,
    surface = V2.Surface,
    onSurface = V2.Ink,
    error = V2.Rot,
    onError = Color.White,
    outline = V2.Linie,
    secondary = V2.Lila,
    onSecondary = Color.White,
    secondaryContainer = V2.KarteDunkel,
    onSecondaryContainer = Color.White,
)

private val DarkColorScheme = darkColorScheme(
    primary = V2.Blau,
    onPrimary = Color.White,
    background = Color(0xFF121212),
    onBackground = Color(0xFFE9ECEF),
    surface = V2.KarteDunkel,
    onSurface = Color(0xFFE9ECEF),
    error = V2.Rot,
    onError = Color.White,
    outline = Color(0xFF495057),
    secondary = V2.Lila,
    onSecondary = Color.White,
    secondaryContainer = V2.KarteDunkel,
    onSecondaryContainer = Color.White,
)

/** Shapes nach docs/UI_DESIGN_SYSTEM.md Abschnitt 4 */
val SaniShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(24.dp),
    extraLarge = RoundedCornerShape(32.dp),
)

@Composable
fun SaniAlarmPlanerTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    // Design-System definiert eigene Farben - dynamisches Android-Farbschema aus
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme
    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        shapes = SaniShapes,
        content = content
    )
}
