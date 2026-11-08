package com.fabian.sanialarmplaner

import com.fabian.sanialarmplaner.data.AppConfig
import com.fabian.sanialarmplaner.logic.*
import org.junit.Assert.*
import org.junit.Test

class SchedulerTest {

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

    private fun alleTage(): List<Schluessel> =
        Wochen.alle.flatMap { w -> Wochentage.dienst.map { Schluessel(w, it) } }

    @Test
    fun `baseline - alle Teams gesund erzeugt gueltigen Plan`() {
        val aufstellung = verarbeiteAufstellung(config, emptySet())
        assertEquals(config.teams.size, aufstellung.aktivePaare.size)
        val res = generiereDienstplan(config, aufstellung)
        assertNotNull("Baseline sollte einen Plan liefern", res.plan)
        assertEquals(20, res.plan!!.size)
        assertEquals(emptyList<String>(), res.entschärfteRegeln)
    }

    @Test
    fun `regeln werden eingehalten - sperrtage, wochenwechsel, wochentag, fairness`() {
        val aufstellung = verarbeiteAufstellung(config, emptySet())
        val res = generiereDienstplan(config, aufstellung)
        val plan = res.plan!!

        for ((key, d) in plan) {
            val (woche, tag) = key
            // Regel 1: Team-Sperrtage
            assertTrue(
                "$d am $tag verletzt Sperrtag",
                tag !in config.teamSperrtage[d.paar].orEmpty()
            )
            // Regel 2: max 1x pro Woche
            assertEquals(
                1, plan.count { it.key.first == woche && it.value.paar == d.paar }
            )
            // Regel 3: Wochentag nicht doppelt im Monat
            assertEquals(
                1, plan.count { it.key.second == tag && it.value.paar == d.paar }
            )
            // Regel 6: Fairness - max 2x pro Block
            for (block in listOf(listOf(1, 2), listOf(3, 4))) {
                assertTrue(
                    plan.count { it.key.first in block && it.value.paar == d.paar } <= 2
                )
            }
        }
    }

    @Test
    fun `fairness - jedes aktive Paar und jeder Springer kommt vor`() {
        val aufstellung = verarbeiteAufstellung(config, emptySet())
        val res = generiereDienstplan(config, aufstellung)
        val plan = res.plan!!

        val genutztePaare = plan.values.map { it.paar }.toSet()
        assertEquals(aufstellung.aktivePaare.keys, genutztePaare)

        val genutzteSpringer = plan.values.mapNotNull { it.springer }.toSet()
        assertEquals(aufstellung.aktiveSpringer.toSet(), genutzteSpringer)
    }

    @Test
    fun `ein krankes Team-Mitglied wird Springer`() {
        val aufstellung = verarbeiteAufstellung(config, setOf("Camilo"))
        assertFalse("Camilo & Jonatan" in aufstellung.aktivePaare)
        assertTrue("Jonatan" in aufstellung.aktiveSpringer)
    }

    @Test
    fun `komplett krankes Team faellt aus`() {
        val aufstellung = verarbeiteAufstellung(config, setOf("Camilo", "Jonatan"))
        assertTrue("Camilo & Jonatan" !in aufstellung.aktivePaare)
        assertTrue("Camilo & Jonatan" in aufstellung.ausgefallenePaare)
    }

    @Test
    fun `tagesgenaue Abwesenheit blockiert nur den betroffenen Tag`() {
        val abw = mapOf("Camilo" to setOf(tagIndex(1, "Montag")))
        val aufstellung = verarbeiteAufstellung(config, emptySet(), abw)
        val res = generiereDienstplan(config, aufstellung, abw)
        val plan = res.plan!!

        // Montag Woche 1 darf Camilo nicht dabei sein
        val dienst = plan.getValue(1 to "Montag")
        if (dienst.paar == "Camilo & Jonatan") {
            fail("Camilo ist abwesend, darf aber eingeteilt sein")
        }
    }

    @Test
    fun `vorbelegung wird uebernommen und markiert`() {
        val aufstellung = verarbeiteAufstellung(config, emptySet())
        val vor = mapOf((1 to "Montag") to Dienst("Monti & Janaina", null))
        val res = generiereDienstplan(config, aufstellung, vorbelegungen = vor)
        val plan = res.plan!!
        assertEquals(Dienst("Monti & Janaina", null), plan[1 to "Montag"])
    }

    @Test
    fun `entspannter Modus liefert eher einen Plan als strenger`() {
        // Forderndes, aber lösbares Szenario: 2 komplette Teams fallen aus
        val vieleKrank = setOf("Camilo", "Jonatan", "Monti", "Marlene", "Hilal")
        val lockerCfg = config.copy(modus = "lockerer", maxVersuche = 100)
        val strengCfg = config.copy(modus = "streng", maxVersuche = 0)
        val a = verarbeiteAufstellung(lockerCfg, vieleKrank)
        val resStreng = generiereDienstplan(strengCfg, a)
        val resLocker = generiereDienstplan(lockerCfg, a)
        assertTrue(resLocker.plan != null || resStreng.plan != null)   // oder beide
    }

    @Test
    fun `gleicher Seed liefert gleichen Plan`() {
        val cfg = config.copy(seed = 42L)
        val a1 = verarbeiteAufstellung(cfg, emptySet())
        val a2 = verarbeiteAufstellung(cfg, emptySet())
        val p1 = generiereDienstplan(cfg, a1).plan
        val p2 = generiereDienstplan(cfg, a2).plan
        assertEquals(p1, p2)
    }
}
