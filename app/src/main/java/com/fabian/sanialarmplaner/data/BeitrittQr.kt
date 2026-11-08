package com.fabian.sanialarmplaner.data

import java.nio.charset.StandardCharsets
import java.util.Base64
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

private const val BEITRITT_PREFIX = "sani-alarm-beitritt:"
private val beitrittJson = Json { ignoreUnknownKeys = true }

@Serializable
data class BeitrittQrDaten(
    val typ: String,
    val version: Int = 1,
    val vorname: String = "",
    val nachname: String = "",
    val klasse: String = "",
    val telefon: String = "",
    val email: String = "",
)

fun kodiereBeitritt(daten: BeitrittQrDaten): String {
    val json = beitrittJson.encodeToString(daten)
    val encoded = Base64.getUrlEncoder().withoutPadding()
        .encodeToString(json.toByteArray(StandardCharsets.UTF_8))
    return BEITRITT_PREFIX + encoded
}

fun dekodiereBeitritt(text: String): BeitrittQrDaten? {
    if (!text.startsWith(BEITRITT_PREFIX)) return null
    val encoded = text.removePrefix(BEITRITT_PREFIX)
    val json = String(Base64.getUrlDecoder().decode(encoded), StandardCharsets.UTF_8)
    return beitrittJson.decodeFromString<BeitrittQrDaten>(json)
        .takeIf { it.version == 1 && it.typ in setOf("einladung", "person") }
}
