# SaniAlarm-Beitrittsformular

Statische, serverlose Webseite fuer den QR-Beitritt unter
https://sani-alarm-planer.netlify.app/. Es werden keine Formulardaten an einen
Server, eine API oder einen Analysedienst gesendet.

## Ablauf

1. Die Gruppenleitung zeigt in der Android-App unter „Beitritt per QR-Code“
   einen Einladungs-QR-Code an. Die Adresse https://sani-alarm-planer.netlify.app/
   ist voreingestellt und kann dort bei Bedarf geaendert werden.
2. Die App zeigt einen QR-Code mit der Website-Adresse und dem Parameter
   `beitritt=1`. Neue Mitglieder koennen ihn mit der normalen Kamera-App scannen.
3. Das Formular erstellt den Antwort-QR-Code ausschliesslich lokal im Browser.
4. Die Gruppenleitung scannt den Antwortcode mit derselben, geoeffneten
   SaniAlarm-App und bestaetigt die Uebernahme in die lokale Kartei.

Der Antwortcode verschluesselt die Formulardaten mit AES-256-GCM. Der zufaellige
Schluessel steckt im Fragment (`#key=...`) des Einladungslinks; Browser und
Server uebertragen Fragmente nicht in HTTP-Anfragen. Die App behaelt den
Schluessel fuer diesen Einladungslauf im Arbeitsspeicher und entschluesselt den
Antwortcode beim Scannen. Die App muss bis dahin geoeffnet bleiben; nach einem
Neustart muss eine neue Einladung erzeugt werden. Der Code sollte trotzdem nur
direkt der Gruppenleitung gezeigt werden.

Der Einladungslink ist ein gemeinsamer Schluessel, keine persoenliche Anmeldung:
Jede Person, die ihn besitzt, kann Formulardaten erzeugen. AES-GCM schuetzt die
Vertraulichkeit des Antwortcodes und erkennt Aenderungen durch Personen ohne
Einladungsschluessel, beweist aber nicht die Identitaet der sendenden Person.
Die Gruppenleitung muss die Angaben daher vor der Uebernahme pruefen.

Der Hosting-Anbieter kann beim normalen Seitenaufruf technische Zugriffsdaten
wie IP-Adresse und Browser-Metadaten verarbeiten. Formulardaten werden nicht uebermittelt. Der Einladungsschluessel steht nur im
URL-Fragment, das der Browser nicht an den Host sendet; das Formular ersetzt
das Fragment nach dem Laden aus der Adresszeile.

## Lokal testen

```sh
npm ci
npm test
npm run dev
```

## Netlify

Das Repository verbinden und als Base directory `beitritt-website` setzen. Die
Netlify-Site muss dabei dem Namen `sani-alarm-planer` zugeordnet sein, damit die
konfigurierte Adresse erreichbar bleibt.
Build command: `npm run build`; Publish directory: `dist`.
Die Datei `public/_headers` setzt eine restriktive Content-Security-Policy und
weitere Sicherheitsheader. Nach dem Deploy den Einladungs-QR-Code mit einem
Telefon ohne SaniAlarm-App testen.
