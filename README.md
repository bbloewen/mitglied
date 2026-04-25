# mitglieder

Basketball Löwen Erfurt — Mitgliedsverwaltung.

Aktuell enthält dieses Repo nur das **Mitgliedsantrag**-Skript (Frontend + Apps-Script-Backend für die Online-Antragsstellung). Weitere Skripte rund um Mitgliedsverwaltung kommen ggf. hier hinzu.

## Architektur

| Pfad | Zweck |
|---|---|
| `Mitgliedsantrag.gs` | Apps-Script-Backend: doPost-Webhook, validiert Antrag, legt Kontakt + ggf. Debitor + SEPA-Mandat in campai an, archiviert Nachweise in Drive, schickt Bestätigungsmails |
| `appsscript.json` | Webapp-Manifest (`USER_DEPLOYING` + `ANYONE_ANONYMOUS`, damit das öffentliche Antragsformular ohne Google-Login posten kann) |
| `docs/mitgliedsantrag.html` | Antragsformular (GitHub Pages) — postet JSON an die Web-App-URL |
| `docs/index.html` | Einstiegs-Landing für die GitHub Pages |

**Account:** Apps Script läuft unter `rechnung@basketball-loewen.com` (gemeinsame Automation-Identität).

## Mitgliedstypen

- **Fan** (`handleFan`)
- **Spieler** (`handleSpieler`) — mit SEPA-Mandat
- **Schulprogramm** (`handleSchule`)
- **Fördermitglied** (`handleFoerder`)

## Setup

### 1. Apps Script anlegen

Im Browser bei `rechnung@` einloggen, dann:

1. https://script.google.com/ → **Neues Projekt** → Name: `Mitgliedsantrag`
2. Script-ID notieren (URL-Segment nach `/d/`)
3. Lokal `.clasp.json` mit der Script-ID anlegen (analog zu `kontakt`/`rechnung`):
   ```json
   {
     "scriptId": "<SCRIPT_ID>",
     "rootDir": "",
     "scriptExtensions": [".js", ".gs"],
     "htmlExtensions": [".html"],
     "jsonExtensions": [".json"],
     "filePushOrder": [],
     "skipSubdirectories": true
   }
   ```
   `skipSubdirectories: true` ist wichtig — sonst pusht clasp die `docs/`-HTML-Dateien als HtmlService-Templates ins Apps Script.

4. `clasp push` lädt `Mitgliedsantrag.gs` + `appsscript.json` hoch.

### 2. Script Properties setzen

Im Editor: ⚙️ Projekteinstellungen → Skripteigenschaften.

| Key | Wert |
|---|---|
| `CAMPAI_API_KEY` | **neu generieren** in campai |
| `CAMPAI_ORG_ID` | aus campai |
| `CAMPAI_MANDATE_ID_LEV` | aus campai |

### 3. Web-App deployen

Editor → **Bereitstellen → Neue Bereitstellung → Typ: Web-App**.
- Beschreibung: z.B. `Mitgliedsantrag v1`
- Ausführen als: `Mich (rechnung@basketball-loewen.com)`
- Zugriff: `Jeder` (anonym, ohne Google-Login)

Nach „Bereitstellen" wird die **Web-App-URL** angezeigt — die kopieren.

### 4. Frontend mit Web-App-URL füttern

In `docs/mitgliedsantrag.html` Zeile mit `PROXY_URL` suchen:

```js
const PROXY_URL  = '__BACKEND_URL_HIER_EINSETZEN__';
```

Durch die kopierte URL ersetzen, commit + push.

### 5. GitHub Pages aktivieren

Repo-Settings → Pages → Source: `main` / `/docs` → Save.

GitHub vergibt eine URL der Form `https://basketball-loewen-erfurt.github.io/mitglieder/`. Ggf. Custom-Domain einrichten.

### 6. Externe Links nachziehen

Die Pages-URL ist neu — diese Stellen müssen nachgepflegt werden, damit der Antrag erreichbar bleibt:

- [ ] Vereinswebsite (Basketball-Löwen-Homepage)
- [ ] Mail-Templates / Newsletter
- [ ] QR-Code / Flyer (falls gedruckt)

### 7. Verifikation

- `testDoPost` ▶ — End-to-End-Test mit einem Test-Antrag
- `testListMandates` ▶ — campai-Mandatenliste, prüft API-Connection
- Im echten Frontend einen Test-Antrag stellen → Bestätigungsmail prüfen → in campai unter Kontakte/Mandate schauen

## Rate-Limiting

`checkRateLimit()` schreibt pro E-Mail einen Cache-Eintrag mit Zeitstempel:
- Max **3 Anträge** pro E-Mail innerhalb 24h
- Max **50 Anträge** global pro 24h (Bot-Schutz)
- `cleanupRateLimitKeys()` räumt periodisch auf (kein Trigger nötig — passiert lazy bei jedem Post)

## Bot-Schutz

Hidden Token-Feld im Form, validiert per HMAC-Salt. Mindest-Ausfüllzeit (8s), Maximal-Ausfüllzeit (30 min). Siehe `validateBotToken()`.

## Rollback

Code-Snapshot vor Migration: [`basketball-loewen-erfurt/loewen@5d26a88`](https://github.com/basketball-loewen-erfurt/loewen/tree/5d26a88) — `script/mitglieder/Mitgliederverwaltung.gs` + `docs/`.
