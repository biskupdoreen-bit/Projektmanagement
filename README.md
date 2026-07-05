# Projektmanagement – Multiprojekt-Dashboard

Ein browserbasiertes Steuerungs-Dashboard für das Multiprojektmanagement,
erstellt aus der Vorlage `Monitoring_Dashboard_Template.xlsx`. Keine
Installation, kein Server nötig – einfach `index.html` öffnen.

## Schritt 1: Dashboard öffnen

- **Lokal:** Datei `index.html` per Doppelklick im Browser öffnen (Chrome,
  Edge oder Firefox empfohlen).
- **Im Team / online:** Repo per GitHub Pages veröffentlichen
  (Settings → Pages → Branch auswählen), dann ist das Dashboard über eine
  URL für alle erreichbar.

## Schritt 2: Sich orientieren – drei Reiter

1. **Übersicht** – KPI-Kacheln, Status-Verteilung, Budget-Diagramm je
   Programm und die editierbare Projekttabelle (entspricht dem
   „Dashboard“-Blatt der Excel-Datei).
2. **Zeitplan** – Quartalsübersicht 2023–2026 je Projekt, wie im Blatt
   „Projektliste“ (🟩 durchgeführt/aktiv, 🟨 geplant, 🟦 Daueraufgabe).
3. **Änderungslog** – entspricht dem Blatt „Änderungen“: wer hat was
   wann geändert.

Die Ausgangsdaten (29 Projekte, 5 Programme, echte Zeitpläne und
Verantwortliche) wurden automatisch aus der Excel-Datei übernommen. Budget,
Status-Ampel, Phase, Risiko, BR-Status und Meilensteine sind bewusst leer,
weil sie in der Vorlage noch nicht befüllt waren – die trägt ihr jetzt im
Dashboard ein.

## Schritt 3: Projekte pflegen

- In der Tabelle unter „Übersicht" **direkt in die Zellen klicken**, um
  Status (Ampel), Phase, Budget, Personentage, BR-Pflicht/-Status, Risiko
  oder den nächsten Meilenstein zu ändern. Jede Änderung wird sofort im
  Browser gespeichert (auch nach Neuladen der Seite noch da).
- Mit **„+ Neues Projekt"** legt ihr ein zusätzliches Projekt an (Programm
  auswählen, Name/Bereich/Verantwortliche eintragen).
- Mit dem 🗑-Symbol am Zeilenende löscht ihr ein Projekt.
- Über die Filterleiste (Programm, Bereich, Status, Risiko, Suche) lässt
  sich die Ansicht eingrenzen – KPIs und Diagramme reagieren live mit.

## Schritt 4: Änderungen protokollieren

Im Reiter „Änderungslog" oben das Formular ausfüllen (Von, Datum, Was,
Bemerkung) und auf „Eintragen" klicken. Einträge lassen sich über
„löschen" wieder entfernen.

## Schritt 5: Daten sichern und teilen

Das Dashboard speichert alle Eingaben automatisch im **Browser**
(localStorage) – das gilt nur für diesen einen Browser auf diesem Gerät.
Um den Datenstand zu sichern oder mit anderen zu teilen:

1. **„JSON exportieren"** klicken → lädt eine Datei
   `projekt-dashboard-daten-JJJJ-MM-TT.json` herunter.
2. Diese Datei bei Bedarf ins Repo committen (z. B. als `data-export.json`)
   oder per Mail/Chat teilen.
3. Andere öffnen das Dashboard, klicken auf **„JSON importieren"** und
   wählen die Datei aus – ihr Stand wird dadurch ersetzt.

**„Auf Vorlage zurücksetzen"** verwirft alle Änderungen und stellt den
Ausgangsstand aus der Excel-Datei wieder her (mit Sicherheitsabfrage).

## Technische Hinweise

- Reines HTML/CSS/JavaScript, keine Frameworks, keine Build-Schritte,
  funktioniert offline.
- `data.js` enthält die aus der Excel-Datei extrahierten Ausgangsdaten
  (nur als Erststand – die eigentliche Arbeitskopie liegt danach im
  Browser-Speicher bzw. in der exportierten JSON-Datei).
- Dateien: `index.html` (Struktur), `style.css` (Design, hell/dunkel
  automatisch), `app.js` (Logik), `data.js` (Ausgangsdaten).
