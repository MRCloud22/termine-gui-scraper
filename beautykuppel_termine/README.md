# Home Assistant Add-on: Beautykuppel Termine

Dieses Add-on startet die Web-App im Container und speichert Konfiguration und Ergebnisse unter `/data/`.

## Zugriff

- Ingress: Sidebar Panel `Beautykuppel Termine`
- Alternativ (falls Port freigegeben): `http://<homeassistant>:8099/`

## Dateien (im Container)

- `/data/config.json` (GUI-Konfiguration, inkl. Treatment-Regeln)
- `/data/results.json` (Ergebnisse der letzten Abfrage)
- `/data/status.json` (Status, letzte/naechste Ausfuehrung, Fehler)
- `/data/out/` (statische Ausgabe fuer Webspace: `/list`, `/signage2`, JSON/RSS)

## Dateien in /config (Samba)

Im Home Assistant wird ein Ordner angelegt, der per Samba erreichbar ist:
- `/config/beautykuppel_termine/settings.json`
- `/config/beautykuppel_termine/media/`

Wenn `settings.json` dort vorhanden ist, wird sie fuer `/signage2` und `/list` verwendet.
Bilder in `/config/beautykuppel_termine/media/` ueberschreiben die Standardbilder.

## Add-on Optionen

- `refreshMinutes`: Intervall in Minuten (0 deaktiviert Timer, manuell via GUI)
- `overrideConfig`: Wenn `true`, ueberschreiben Add-on Optionen die GUI-Konfiguration
- `useTodayWindow`: Wenn `true`, wird bei jedem Run automatisch der aktuelle Tag `00:00-23:59` genommen
- `startDateTime` / `endDateTime`: Optionaler Zeitraum (`YYYY-MM-DDTHH:MM`), nur genutzt wenn `useTodayWindow=false`
- `staticExportEnabled`: erzeugt `/data/out/` nach jedem Run
- FTP (optional): `ftpEnabled`, `ftpHost`, `ftpPort`, `ftpUser`, `ftpPassword`, `ftpSecure`, `ftpRemotePath`
