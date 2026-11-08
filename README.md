# Sani Alarm Planer

Android-App (Kotlin, Jetpack Compose) zur Erstellung des monatlichen Dienstplans
der Sanitaets-AG: 4 Wochen x 5 Wochentage, Teams aus 2-3 Personen plus Springer.

## Funktionen

- Automatische Planerstellung per Backtracking-Algorithmus
- Krankmeldungen pro Person, optional tagesgenau (z.B. Urlaub)
- Feste Vorbelegungen fuer bereits gesetzte Schichten
- Einzelne Regeln in den Einstellungen ein-/ausschaltbar
- Personen-Kartei mit Nachname, Klasse, Geschlecht, Ausbildung, Partnerwunsch,
  Kontaktdaten; Teams werden daraus automatisch abgeleitet
- Ausbildungs-Regel: jedes Team benoetigt mindestens eine ausgebildete Person
- Statistiken mit Zeitraum-Filter, Import vergangener Schichten und
  Belastungsindex (Einsaetze pro Mitgliedsmonat)
- Teilen des Plans als Text oder PDF
- Export/Import der gesamten Daten als .saniteam-Datei

## Regeln des Planers

1. Team-Sperrtage werden eingehalten
2. Maximal eine Schicht pro Woche pro Team oder Springer
3. Kein Wochentag doppelt im Monat pro Team (abschaltbar)
4. Kein Freitag-Montag-Doppeldienst
5. Springer-Praeferenzen werden beruecksichtigt
6. Fairness: 1-2 Einsaetze pro 2-Wochen-Block (abschaltbar)

Laesst sich ein Plan unter allen aktiven Regeln nicht bilden, entspannt der
Algorithmus schrittweise (Fairness, Wochentage, Back-to-Back, Praeferenzen) und
zeigt das als Hinweis an. Sperrtage bleiben immer aktiv.

## Daten und Datenschutz

Alle personenbezogenen Daten (Namen, Klasse, Telefon) liegen in einer
.saniteam-Datei, die in der App erstellt, exportiert und importiert wird.
Diese Datei und der Ordner URSPRUNG/ mit den Original-Daten sind in der
.gitignore ausgeschlossen und gehoeren nicht in ein Repository.

## Build

    ./gradlew assembleDebug

Die APK liegt danach unter app/build/outputs/apk/debug/.

## Tests

    ./gradlew testDebugUnitTest

## Projektstruktur

    app/src/main/java/com/fabian/sanialarmplaner/
        data/       Datenmodelle (.saniteam, AppConfig), Persistenz
        logic/      Planungs-Algorithmus (Regeln, Backtracking)
        ui/         Compose-Oberflaeche (6 Tabs)
        viewmodel/  Zustand und Steuerung
    URSPRUNG/       Original-Daten (lokal, nicht im Repository)
