
package com.fabian.sanialarmplaner

import com.fabian.sanialarmplaner.data.*
import org.junit.Assert.*
import org.junit.Test

// ==============================================================================
// TESTS FUER DAS .saniteam-DATENMODELL
// ==============================================================================

class SaniteamTest {

    @Test
    fun `teams werden aus partnerwunschen abgeleitet`() {
        val datei = SaniteamDatei(personen = listOf(
            Person(vorname = "Anna", ausbildungAbgeschlossen = true, bevorzugterPartner = "Ben"),
            Person(vorname = "Ben"),
            Person(vorname = "Clara", ausbildungAbgeschlossen = true),
        ))
        val teams = datei.ableiteTeams()
        assertEquals(1, teams.size)
        assertTrue(teams.values.first().containsAll(listOf("Anna", "Ben")))
    }

    @Test
    fun `team ohne ausgebildete person wird nicht gebildet`() {
        val datei = SaniteamDatei(personen = listOf(
            Person(vorname = "Anna"),                       // nicht ausgebildet
            Person(vorname = "Ben", bevorzugterPartner = "Anna"),
        ))
        assertTrue(datei.ableiteTeams().isEmpty())
    }

    @Test
    fun `unausgebildete werden als dritte an 2er-team gehaengt`() {
        val datei = SaniteamDatei(personen = listOf(
            Person(vorname = "Anna", ausbildungAbgeschlossen = true),
            Person(vorname = "Ben", ausbildungAbgeschlossen = true),
            Person(vorname = "Clara"),   // unausgebildet
        ))
        val teams = datei.ableiteTeams()
        assertEquals(1, teams.size)
        assertEquals(3, teams.values.first().size)
    }

    @Test
    fun `ausgebildete ohne team sind springer`() {
        val datei = SaniteamDatei(
            personen = listOf(
                Person(vorname = "Anna", ausbildungAbgeschlossen = true, bevorzugterPartner = "Ben"),
                Person(vorname = "Ben"),
                Person(vorname = "Clara", ausbildungAbgeschlossen = true),
            ),
            einstellung = PlanEinstellung(springerNamen = listOf("Doro")),
        )
        val springer = datei.ableiteSpringer()
        assertTrue("Doro" in springer)
        assertTrue("Clara" in springer)
        assertFalse("Anna" in springer)   // ist im Team
    }

    @Test
    fun `saniteam export und import ist roundtrip`() {
        val speicher = SaniteamSpeicher()
        val datei = SaniteamDatei(
            personen = listOf(Person(vorname = "Anna", nachname = "Müller", klasse = "10b")),
            historie = listOf(HistorischeSchicht("2026-11-05", listOf("Anna Müller"))),
        )
        val text = speicher.serialisieren(datei)
        val geladen = speicher.deserialisieren(text)
        assertEquals(datei, geladen)
    }
}
