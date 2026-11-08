# Sani Alarm Planer

Android-App (Kotlin, Jetpack Compose) zur Erstellung des monatlichen Dienstplans
der Sanitaets-AG: 4 Wochen x 5 Wochentage, Teams aus 2-3 Personen plus Springer.

## Funktionen

- Automatische Planerstellung per Backtracking-Algorithmus
- Krankmeldungen pro Person, optional tagesgenau (z.B. Urlaub)
- Vertretungsvorschlaege fuer einzelne Dienste nach Verfuegbarkeit und Belastung
- Schichttausch mit Regelpruefung fuer den resultierenden Gesamtplan
- Feste Vorbelegungen fuer bereits gesetzte Schichten
- Einzelne Regeln in den Einstellungen ein-/ausschaltbar
- Personen-Kartei mit Nachname, Klasse, Geschlecht, Ausbildung, Partnerwunsch,
  Kontaktdaten; Teams werden daraus automatisch abgeleitet
- Offline-Beitritt per QR-Code: Einladung, Formular und bestaetigte Uebernahme
  in die Kartei ohne Server
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

Der Einladungs-QR-Code enthaelt einen zufaelligen, einmaligen Schluessel im
URL-Fragment. Die Beitrittswebsite verschluesselt die Angaben lokal mit
AES-256-GCM; der Antwort-QR enthaelt keine lesbaren Personendaten. Die App muss
bis zum Scannen des Antwortcodes geoeffnet bleiben, da sie den Schluessel nur
fuer diesen Einladungslauf im Arbeitsspeicher haelt. Der Link authentifiziert
keine Person; die Gruppenleitung muss Angaben vor dem Speichern pruefen.

Das Web-Formular fuer neue Mitglieder liegt im Ordner `beitritt-website/` und
ist unter https://sani-alarm-planer.netlify.app/ erreichbar. Diese Adresse ist
in der App voreingestellt und kann bei Bedarf angepasst werden. Das Formular verschluesselt den
Antwort-QR lokal im Browser mit AES-256-GCM; nur die Gruppenleitung scannt und
bestaetigt ihn in der App. Technische Seitenaufrufdaten koennen beim
Hosting-Anbieter anfallen, aber keine Formulardaten werden an diesen uebermittelt.

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
