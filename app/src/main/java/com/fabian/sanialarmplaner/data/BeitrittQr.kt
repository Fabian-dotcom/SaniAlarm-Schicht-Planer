package com.fabian.sanialarmplaner.data

import java.nio.charset.StandardCharsets
import java.net.URI
import java.util.Base64
import java.security.GeneralSecurityException
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

private const val BEITRITT_PREFIX = "sani-alarm-beitritt:"
private const val VERSCHLUESSELTER_BEITRITT_PREFIX = "sani-alarm-beitritt-v2:"
const val STANDARD_BEITRITT_WEBSITE_URL = "https://sani-alarm-planer.netlify.app/"
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
    if (!text.startsWith(BEITRITT_PREFIX) || text.length > 2048) return null
    val encoded = text.removePrefix(BEITRITT_PREFIX)
    if (!encoded.matches(Regex("[A-Za-z0-9_-]+"))) return null
    val json = String(Base64.getUrlDecoder().decode(encoded), StandardCharsets.UTF_8)
    val daten = beitrittJson.decodeFromString<BeitrittQrDaten>(json)
    if (daten.typ !in setOf("einladung", "person")) return null
    return validiereBeitrittDaten(daten, setOf("einladung", "person"))
}

private fun validiereBeitrittDaten(
    daten: BeitrittQrDaten,
    erlaubteTypen: Set<String> = setOf("person"),
): BeitrittQrDaten? {
    if (daten.version != 1 || daten.typ !in erlaubteTypen ||
        (daten.typ == "person" && daten.vorname.isBlank())
    ) return null
    if (daten.vorname.length > 80 || daten.nachname.length > 100 ||
        daten.klasse.length > 80 || daten.telefon.length > 40 || daten.email.length > 120
    ) {
        return null
    }
    return daten
}

fun generiereBeitrittSchluessel(): String {
    val schluessel = ByteArray(32)
    SecureRandom().nextBytes(schluessel)
    return Base64.getUrlEncoder().withoutPadding().encodeToString(schluessel)
}

@Throws(GeneralSecurityException::class, IllegalArgumentException::class)
fun dekodiereVerschluesseltenBeitritt(text: String, geheimnis: String): BeitrittQrDaten? {
    if (!text.startsWith(VERSCHLUESSELTER_BEITRITT_PREFIX) || text.length > 2048) return null
    val teile = text.removePrefix(VERSCHLUESSELTER_BEITRITT_PREFIX).split(".")
    if (teile.size != 2 || teile.any { !it.matches(Regex("[A-Za-z0-9_-]+")) }) return null
    val schluesselBytes = Base64.getUrlDecoder().decode(geheimnis)
    val nonce = Base64.getUrlDecoder().decode(teile[0])
    val cipherText = Base64.getUrlDecoder().decode(teile[1])
    if (schluesselBytes.size != 32 || nonce.size != 12 || cipherText.size !in 17..1536) return null
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(
        Cipher.DECRYPT_MODE,
        SecretKeySpec(schluesselBytes, "AES"),
        GCMParameterSpec(128, nonce),
    )
    val klartext = cipher.doFinal(cipherText)
    val daten = beitrittJson.decodeFromString<BeitrittQrDaten>(
        String(klartext, StandardCharsets.UTF_8),
    )
    return validiereBeitrittDaten(daten)
}

fun beitrittEinladungsUrl(webseite: String, geheimnis: String): String? {
    if (!geheimnis.matches(Regex("[A-Za-z0-9_-]{43}"))) return null
    return try {
        val uri = URI(webseite.trim())
        if (!uri.scheme.equals("https", ignoreCase = true) ||
            uri.host.isNullOrBlank() ||
            uri.rawUserInfo != null ||
            uri.rawQuery != null ||
            uri.rawFragment != null ||
            uri.port !in -1..65535
        ) {
            return null
        }
        URI(
            "https",
            null,
            uri.host,
            uri.port,
            uri.path.ifBlank { "/" },
            "beitritt=1",
            "key=$geheimnis",
        ).toASCIIString()
    } catch (_: IllegalArgumentException) {
        null
    } catch (_: java.net.URISyntaxException) {
        null
    }
}
