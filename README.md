# Soundboard Desktop App

Electron-Wrapper um das Soundboard mit eingebetteter Companion-Bridge. Ein Klick zum Starten — kein separates Terminal, kein `node bridge.js` mehr nötig.

## Neu in Version 1.2.0

- **Playlists auf einem Pad** — Mehrere Tracks auf ein Pad legen (mehrere Dateien auf einmal wählen oder zusätzliche Dateien auf ein Pad ziehen). Die Tracks laufen nacheinander.
- **Crossfade zwischen Tracks** — Im Playlist-Modus ersetzt ein Crossfade-Regler das Fade-In/Out; an den Übergängen wird übergeblendet.
- **Gesamtlaufzeit & Countdown** — Der Pad-Button zeigt die Zeit an: im Ruhezustand die Gesamtlänge (bei Playlists inkl. Track-Zahl), beim Abspielen die runterlaufende Restzeit — für Einzel-Tracks wie für Playlists.
- **Track-Verwaltung** — Track-Liste mit Drag-and-Drop-Sortierung und Einzel-Entfernen; max. 6 Tracks sichtbar, der Rest scrollt. In der Performance-Ansicht ausgeblendet.

## Neu in Version 1.1.0

- **Auto-Discovery via mDNS/Bonjour** — Die App announciert sich jetzt im lokalen Netzwerk. Das aktualisierte Companion-Modul findet alle Soundboard-Instanzen automatisch über ein Dropdown — kein manuelles Eintragen von IP-Adressen mehr.
- **Companion-Modul auf 1.1.0** — Download direkt aus der App über den Button im Bridge-Modal. Der Link zeigt jetzt auf die [Releases-Seite des Companion-Repos](https://github.com/omsipe/companion-module-soundboard-bridge/releases/latest), damit er auch bei späteren Versionen ohne App-Update aktuell bleibt.

## Was sich gegenüber der alten Version ändert

| | Vorher | Jetzt |
| --- | --- | --- |
| Bridge starten | `node bridge.js` im Terminal | Auto-Start beim App-Launch (im selben Prozess) |
| Bridge stoppen | `Ctrl+C` im Terminal | "■ Bridge stoppen"-Knopf im Bridge-Modal |
| Soundboard öffnen | Browser → `http://localhost:8765/` | App-Fenster startet von alleine |
| Companion-Verbindung | identisch | identisch — `http://localhost:8765/...` |
| Companion-Modul | unverändert | unverändert |

## Installation

```cmd
cd soundboard-app
npm install
```

Holt Electron (~250 MB einmalig) und Electron-Builder. Keine weiteren Dependencies.

## Starten

```cmd
npm start
```

App öffnet, Bridge läuft, Soundboard ist drin. Fertig.

Wenn der Bridge-Server nicht starten konnte (z. B. Port 8765 belegt), zeigt die UI das im Bridge-Modal mit einer Fehlermeldung.

## Was du im UI hast

**Bridge-Pille oben rechts** klicken → Modal öffnet sich:

- **Server-Status**: Grüner Punkt = Bridge-Server läuft, grauer = gestoppt, roter = Fehler
- **▶ Bridge starten / ■ Bridge stoppen** — direkter Prozess-Control über IPC
- **Status-Info**: zeigt ob das Soundboard verbunden ist, Anzahl Pads, Companion-URL
- **Companion-Beispiele** für deine Stream-Deck-Buttons

Der Soundboard-Browser-Tab verbindet sich automatisch zur eingebetteten Bridge, sobald sie läuft. Beim App-Beenden wird die Bridge sauber heruntergefahren.

## Eigene Verknüpfung anlegen

Damit du nicht jedes Mal `cmd → cd → npm start` machst:

1. Rechtsklick auf den Desktop → Neu → Verknüpfung
2. Pfad: `cmd /c "cd /d C:\pfad\zu\soundboard-app && npm start"`
3. Name: "Soundboard"

Eigenes Icon optional über Verknüpfungs-Eigenschaften → Anderes Symbol.

## Als .exe packagen (optional)

Wenn du dauerhaft eine eigenständige .exe haben willst:

```cmd
npm run build:portable
```

Erzeugt unter `dist\` eine portable .exe, die ohne Node.js-Installation läuft. Etwa 80–100 MB groß. Diese .exe kannst du auf den Show-Rechner kopieren und direkt starten.

## Architektur

```
┌─ Electron-Main-Process ─────────────────────────────────┐
│   • BridgeServer (HTTP/SSE auf :8765)                   │
│   • IPC-Handler (bridge:start/stop/status)              │
│   • Spawnt + verwaltet das BrowserWindow                │
└──────────────────────────┬──────────────────────────────┘
                           │ contextBridge (preload.cjs)
┌──────────────────────────┴──────────────────────────────┐
│   Renderer (index.html)                                 │
│   • Soundboard-UI (wie zuvor)                           │
│   • EventSource→ http://localhost:8765/sse              │
│   • window.electronAPI.startBridge() / stopBridge()     │
└─────────────────────────────────────────────────────────┘
                           ▲
                           │ HTTP GET (Generic HTTP Module)
              ┌────────────┴────────────┐
              │ Bitfocus Companion      │
              │ + Stream Deck           │
              └─────────────────────────┘
```

Bridge und UI laufen im **gleichen Prozess** — kein separates Terminal, kein zweiter Node. Die HTTP-API auf Port 8765 ist genau wie bei der alten `bridge.js`, das Companion-Modul muss nicht angepasst werden.

## Troubleshooting

- **App startet, Bridge zeigt "Port 8765 ist belegt"** — eine alte `node bridge.js`-Instanz läuft noch im Hintergrund. `Task-Manager → Node.js`-Prozess beenden, oder im Modal "Bridge starten" nochmal klicken.
- **App-Fenster bleibt schwarz / weiß** — `npm install` nicht durchgelaufen oder Electron unverträglich mit Cylance. Versuch: `npm install --force`. Cylance evtl. `electron.exe` whitelisten.
- **Soundboard verbindet sich nicht zur Bridge obwohl die läuft** — Bridge-Pille in der UI klicken → Status-Punkt prüfen. Sollte automatisch verbinden, falls nicht: einmal "Stop" + "Start".
- **Companion sieht keine Pads mehr** — Connection-Test in Companion: `http://localhost:8765/api/health` aufrufen. Falls 200 OK aber `soundboard_connected: false`: Soundboard-Fenster der App ist zu oder die Bridge ist gestoppt.

## Headless-Variante

Falls du irgendwann mal nur die Bridge ohne UI brauchst (z. B. auf einem Show-Server, der nur Triggers durchreicht): die alte `bridge.js` aus dem vorherigen Setup läuft weiter und macht denselben Job — einfach an einem anderen Ort starten. Beide können nicht gleichzeitig auf Port 8765 laufen.
