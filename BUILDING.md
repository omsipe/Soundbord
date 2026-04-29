# Soundboard zum Verteilen bauen

Hier die Anleitung, wie du aus deinem Code eine `.exe` machst, die du an andere weitergeben kannst — ohne dass die Empfänger Node.js installieren müssen.

## Schnellweg (ein Doppelklick)

`Build.bat` doppelklicken. Erster Build dauert 3–5 Minuten (Electron wird heruntergeladen). Folgebuilds gehen in unter einer Minute.

Nach dem Build findest du im Unterordner `dist\` zwei Dateien:

| Datei | Was es ist |
|---|---|
| `Soundboard-1.0.0-portable.exe` | Single-File, keine Installation. Doppelklick startet die App. ~90 MB |
| `Soundboard-1.0.0-x64-setup.exe` | Klassischer Setup-Wizard mit Verknüpfungen. ~70 MB |

**Welches verteilen?** Für den ungeübten Nutzer ist der Installer freundlicher (Startmenü-Eintrag, Desktop-Verknüpfung, ordentliches Deinstallieren). Für Power-User und Show-Rechner ist die Portable-Variante praktischer (auf USB-Stick, läuft überall).

## Was beim Build passiert

`electron-builder` packt zusammen:

- Electron-Runtime (Chromium + Node.js) — der Großteil der Dateigröße
- Deine Files: `electron-main.cjs`, `preload.cjs`, `bridge-server.cjs`, `index.html`, `soundboard.ico`
- Eine schmale Installer-Hülle (NSIS für Windows)

Die fertige `.exe` ist komplett selbstständig. Empfänger braucht weder Node.js noch sonst irgendwas.

## Auf einem fremden Rechner installieren

**Portable**: `Soundboard-1.0.0-portable.exe` irgendwohin kopieren, doppelklicken. Fertig.

**Installer**: `Soundboard-1.0.0-x64-setup.exe` doppelklicken. Wizard fragt nach Installations-Ort (Standard: `%LOCALAPPDATA%\Programs\Soundboard`), legt Verknüpfungen an. Keine Admin-Rechte nötig — Installation passiert pro Nutzer, nicht systemweit.

Nach Installation: Startmenü → "Soundboard" oder Desktop-Verknüpfung.

## Windows SmartScreen Warnung

⚠️ Das ist der wichtigste Punkt zum Verteilen:

Beim ersten Start auf einem fremden Rechner zeigt Windows wahrscheinlich:

> Der Computer wurde durch Windows geschützt
> Microsoft Defender SmartScreen hat den Start einer unbekannten App verhindert.

Ursache: deine `.exe` ist nicht **code-signiert**. Code-Signing kostet Geld (~80–250 €/Jahr für ein Standard-Zertifikat) und ist administrativ aufwendig — lohnt sich erst bei breiter Verteilung.

**Workaround für Empfänger**: Im SmartScreen-Dialog auf "Weitere Informationen" klicken → "Trotzdem ausführen". Beim ersten Start einmalig, danach merkt sich Windows das.

**Bei Cylance / EDR**: In Firmen-Umgebungen wird die unsignierte `.exe` mit hoher Wahrscheinlichkeit blockiert oder in Quarantäne gesteckt. Workaround:
- Den Hash der `.exe` an die IT-Abteilung schicken zum Whitelisten
- Oder die App auf einem Rechner ohne EDR betreiben

Das ist kein Bug der App, sondern Standardverhalten für jede unsignierte Software.

## Antivirus-False-Positives

Manche AV-Engines flaggen Electron-Apps generisch als verdächtig, weil:
- Sie packen einen kompletten Browser+Node mit ein (groß und intransparent)
- Sie öffnen lokale HTTP-Ports (was die Bridge tut)

Wenn das passiert: Datei zur Whitelist hinzufügen. Bei VirusTotal hochladen, um zu sehen welche Engines anschlagen. Bei sehr breiter Verteilung kann man die Datei bei Microsoft direkt einreichen ("Submit a file for malware analysis").

## Versionsnummer hochziehen

Vor jedem Release in `package.json` die Version hochzählen:

```json
"version": "1.0.1"
```

Die Versionsnummer landet automatisch im Dateinamen der gebauten `.exe`.

## Mac-Version bauen

⚠️ Geht nur **auf einem Mac** zuverlässig — Windows kann zwar theoretisch für Mac bauen, aber die Toolchain ist fummelig.

Auf einem Mac:

```bash
cd soundboard-app
npm install
npm run build:mac
```

Erzeugt `dist/Soundboard-1.0.0-x64.dmg` (Intel) und `Soundboard-1.0.0-arm64.dmg` (Apple Silicon).

Empfänger: `.dmg` doppelklicken, App ins Programme-Verzeichnis ziehen. Genau wie jede andere Mac-App.

Mac hat ebenfalls eine "unbekannter Entwickler"-Warnung (Gatekeeper). Workaround: Rechtsklick auf die App → "Öffnen" → bestätigen.

## Größe der finalen .exe optimieren

Wenn dir die ~90 MB zu groß sind, kannst du im `package.json` unter `build` ergänzen:

```json
"compression": "maximum",
"removePackageScripts": true
```

Spart 5–15 MB, dauert beim Bauen aber 2–3x länger. Lohnt sich nur für Final-Releases.

## Troubleshooting

- **`electron-builder` hängt bei "downloading nsis-resources"** — Netzwerkproxy / Firewall blockt GitHub. `npm config set proxy http://...` setzen oder im freien Netz bauen.
- **Build wirft `EACCES`-Fehler unter Windows** — `node_modules` löschen, `npm install` neu, dann nochmal bauen. Manchmal hängen sich Locks fest.
- **`.exe` startet nicht auf dem Zielrechner** — Windows-Version prüfen (Win 10/11 ist Pflicht), ggf. fehlt Visual C++ Redistributable. Selten nötig, aber wenn doch: in der README zur App auf das VC++-Redist von Microsoft verlinken.
- **Cylance flaggt sogar den Build-Prozess** — `node_modules\electron\dist\electron.exe` und `node_modules\electron-builder\` zur Cylance-Whitelist; oder Build außerhalb der überwachten Maschine.

## Veröffentlichen

Die fertigen `.exe`-Dateien sind ganz normale Files — du kannst sie verteilen wie jede andere Datei:

- **GitHub Releases** — kostenlos, gut für Open-Source und Power-User
- **Direkter Download von einer Webseite** — eigene Domain, schöne Landing Page
- **In Slack/Teams/Discord teilen** — fürs Team
- **WeTransfer/Dropbox** — für einzelne Übergaben

Da keine Auto-Update-Funktion drin ist, müssen Nutzer bei neuen Versionen manuell die neue Datei laden und installieren (NSIS-Installer überschreibt die alte Version sauber).

Falls du irgendwann Auto-Updates willst: `electron-updater` ergänzen, GitHub-Releases als Update-Quelle hinterlegen — ein Tag Arbeit, dann zieht die App sich Updates selbst.
