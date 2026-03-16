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

## Add-on Optionen

- `refreshMinutes`: Intervall in Minuten (0 deaktiviert Timer, manuell via GUI)
- `useTodayWindow`: Wenn `true`, wird bei jedem Run automatisch der aktuelle Tag `00:00-23:59` genommen
- `startDateTime` / `endDateTime`: Optionaler Zeitraum (`YYYY-MM-DDTHH:MM`), nur genutzt wenn `useTodayWindow=false`
- `staticExportEnabled`: erzeugt `/data/out/` nach jedem Run
- FTP (optional): `ftpEnabled`, `ftpHost`, `ftpPort`, `ftpUser`, `ftpPassword`, `ftpSecure`, `ftpRemotePath`
