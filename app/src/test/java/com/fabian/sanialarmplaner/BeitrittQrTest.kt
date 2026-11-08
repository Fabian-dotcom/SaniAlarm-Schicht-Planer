package com.fabian.sanialarmplaner

import com.fabian.sanialarmplaner.data.BeitrittQrDaten
import com.fabian.sanialarmplaner.data.dekodiereBeitritt
import com.fabian.sanialarmplaner.data.kodiereBeitritt
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class BeitrittQrTest {

    @Test
    fun `personendaten koennen im qr code transportiert werden`() {
        val daten = BeitrittQrDaten(
            typ = "person",
            vorname = "Alex",
            nachname = "Müller",
            klasse = "10b",
            telefon = "+49 123",
            email = "alex@example.org",
        )

        assertEquals(daten, dekodiereBeitritt(kodiereBeitritt(daten)))
    }

    @Test
    fun `unbekannte qr codes und versionen werden abgelehnt`() {
        assertNull(dekodiereBeitritt("https://example.org"))

        val unbekannteVersion = kodiereBeitritt(BeitrittQrDaten(typ = "person", version = 2))
        assertNull(dekodiereBeitritt(unbekannteVersion))
    }
}
