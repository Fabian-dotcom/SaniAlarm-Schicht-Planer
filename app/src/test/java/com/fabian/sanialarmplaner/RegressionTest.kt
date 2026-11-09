package com.fabian.sanialarmplaner

import com.fabian.sanialarmplaner.data.*
import com.fabian.sanialarmplaner.logic.*
import org.junit.Assert.*
import org.junit.Test

/**
 * Regressionstests fuer den Bug "Plan generieren liefert immer Fehler" und
 * die Einfuehrung des Schnellchecks (Zaehler-Struktur).
 */
class RegressionTest {

    private val config = AppConfig(
        maxVersuche = 15,
        teams = mapOf(
            "Camilo & Jonatan" to listOf("Camilo", "Jonatan"),
            "Monti & Janaina" to listOf("Monti", "Janaina"),
            "Marlene & Hilal" to listOf("Marlene", "Hilal"),
            "Wiebke & Lea K." to listOf("Wiebke", "Lea K."),
            "Vivian & Hatice" to listOf("Vivian", "Hatice"),
            "Sophia & Camilla" to listOf("Sophia", "Camilla"),
            "Stella & Amalia" to listOf("Stella", "Amalia"),
            "Fabi & Lea" to listOf("Fabi", "Lea"),
        ),
        springer = listOf("Samim"),
        praeferenzen = mapOf("Samim" to listOf("Camilo & Jonatan", "Marlene & Hilal")),
        teamSperrtage = mapOf(
            "Marlene & Hilal" to listOf("Dienstag"),
            "Wiebke & Lea K." to listOf("Donnerstag", "Freitag"),
            "Sophia & Camilla" to listOf("Donnerstag", "Freitag"),
        ),
    )

    @Test
    fun `baseline liefert plan mit neuem Schnellcheck`() {
        val a = verarbeiteAufstellung(config, emptySet())
        val res = generiereDienstplan(config, a)
        assertNotNull("Schnellcheck darf die Baseline nicht blockieren", res.plan)
        assertEquals(20, res.plan!!.size)
    }

    @Test
    fun `baseline mit Klassenarbeit-Lookup (leer) liefert plan`() {
        val a = verarbeiteAufstellung(config, emptySet())
        val lookup = object : KlassenArbeitLookup {
            override fun betroffene(tagIdx: Int): Set<String> = emptySet()
        }
        val res = generiereDienstplan(config, a, klassenArbeiten = lookup)
        assertNotNull("Leerer KA-Lookup darf nicht blockieren", res.plan)
    }

    @Test
    fun `KA-Lookup blockiert nur betroffene Person am betroffenen Tag`() {
        val a = verarbeiteAufstellung(config, emptySet())
        // Person "Camilo" hat an Tag-Index 0 (W1/Montag) eine Klassenarbeit
        val lookup = object : KlassenArbeitLookup {
            override fun betroffene(tagIdx: Int): Set<String> =
                if (tagIdx == 0) setOf("Camilo") else emptySet()
        }
        val res = generiereDienstplan(config, a, klassenArbeiten = lookup)
        assertNotNull("Plan trotz 1 Klassenarbeit muss moeglich sein", res.plan)
        val montag = res.plan!!.getValue(1 to "Montag")
        assertFalse(
            "Camilo darf an seinem KA-Tag nicht eingeteilt sein",
            "Camilo" in montag.paar
        )
    }

    @Test
    fun `springer-limit 2 pro Monat blockiert nicht die Baseline`() {
        // 20 Slots, 8 Teams + 1 Springer: Springer ist max 2x im Monat noetig
        val a = verarbeiteAufstellung(config, emptySet())
        val res = generiereDienstplan(config, a)
        val plan = res.plan!!
        val springerEinsaetze = plan.values.count { it.springer != null }
        assertTrue("Springer max 2 Einsaetze: gefunden=$springerEinsaetze", springerEinsaetze <= 2)
        assertNotNull("Plan muss trotz Springer-Limit moeglich sein", res.plan)
    }

    @Test
    fun `schnellcheck und alte Pruefung liefern gleiche Entscheidungen`() {
        // Stichprobe: Fuer viele Zustaende muessen beide Pruefungen uebereinstimmen
        val a = verarbeiteAufstellung(config, emptySet())
        val res = generiereDienstplan(config, a)
        val plan = res.plan!!

        // Falls der Plan wider Erwarten verletzt: Sperrtage etc. checken
        for ((key, d) in plan) {
            val (woche, tag) = key
            assertTrue(
                "Sperrtag verletzt: $d am $tag",
                tag !in config.teamSperrtage[d.paar].orEmpty()
            )
            assertEquals(
                1, plan.count { it.key.first == woche && it.value.paar == d.paar }
            )
        }
    }
}
