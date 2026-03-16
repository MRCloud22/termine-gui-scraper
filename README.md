# Beautykuppel freie Termine (Home Assistant Add-on Repository)

Dieses Git-Repo ist als Home Assistant Add-on Repository gedacht (fuegbar in HA ueber `repository.yaml`) und enthaelt zusaetzlich eine lokale Test-/Dev-Umgebung.

## Home Assistant Installation

1. Home Assistant: `Einstellungen` -> `Add-ons` -> `ADD-ON STORE`.
2. Oben rechts (3 Punkte) -> `Repositories` -> Repo hinzufuegen:
   - `https://github.com/MRCloud22/termine-gui-scraper`
3. Add-on `Beautykuppel Termine` installieren und starten.
4. Die GUI ist dann ueber Ingress in der Sidebar verfuegbar (Panel `Beautykuppel Termine`) oder alternativ ueber Port `8099`.

Hinweis: Die automatische Aktualisierung laeuft serverseitig im Add-on weiter, auch wenn niemand die GUI offen hat.

## Lokal starten

1. `cd beautykuppel_termine`
2. `npm.cmd install`
3. `npm.cmd run start`
4. Browser: `http://localhost:8099`

Die Daten werden unter `./data/` gespeichert:
- `beautykuppel_termine/data/config.json`
- `beautykuppel_termine/data/results.json`
- `beautykuppel_termine/data/status.json`

## Statische Seiten (Webspace)

Beim Start und nach jedem Abruf erzeugt die App eine statische Ausgabe unter `beautykuppel_termine/data/out/` (geeignet fuer FTP Upload).
Wichtig:
- `data/out/list/` entspricht `/list`
- `data/out/signage2/` entspricht `/signage2`
- Root-Dateien: `appointments.json`, `results.json`, `rss.xml`, `settings.json`, `media/`

Lokal sind die Seiten auch erreichbar:
- `http://localhost:8099/list/`
- `http://localhost:8099/signage2/`
- `http://localhost:8099/appointments.json`
- `http://localhost:8099/rss.xml`

## FTP Upload (Delta)

Optional kann die App nach jedem Abruf nur geaenderte Dateien aus `data/out/` per FTP hochladen.
Konfiguration liegt in `data/config.json` im Block `ftp`:
```json
{
  "ftp": {
    "enabled": true,
    "host": "ftp.example.com",
    "port": 21,
    "user": "username",
    "password": "secret",
    "secure": false,
    "remotePath": "/"
  }
}
```
Ein lokales Manifest fuer Delta-Uploads liegt unter `data/ftp-manifest.json`.

## Hinweis

Die Abfrage nutzt die (von der Shop-Seite verwendete) URL:
`/reservations/template/<TEMPLATE_ID>/availability/?day=..&month=..&year=..`

## Home Assistant /config

Das Add-on legt bei laufendem Betrieb einen Ordner an:
- /config/beautykuppel_termine/settings.json
- /config/beautykuppel_termine/media/

Diese Dateien sind per Samba bearbeitbar und werden fuer /signage2 und /list genutzt.

