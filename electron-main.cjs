/**
 * Electron-Hauptprozess.
 * Startet ein Fenster mit der Soundboard-UI und stellt die Bridge
 * als IPC-steuerbaren In-Process-Server bereit.
 */

const { app, BrowserWindow, ipcMain, Menu, shell, dialog, session } = require('electron')
const path = require('path')
const fs = require('fs').promises
const os = require('os')
const { BridgeServer } = require('./bridge-server.cjs')

// mDNS — wird lazy geladen, weil Soundboard auch ohne Netz laufen soll falls
// das Modul fehlt
let bonjourInstance = null
let mdnsService = null

function startMdnsAdvertisement(port) {
	if (mdnsService) return
	try {
		const { Bonjour } = require('bonjour-service')
		bonjourInstance = new Bonjour()
		mdnsService = bonjourInstance.publish({
			name: `Soundboard auf ${os.hostname()}`,
			type: 'soundboard-bridge',
			protocol: 'tcp',
			port: port || 8765,
			txt: {
				version: app.getVersion ? app.getVersion() : '1.0.0',
				host: os.hostname(),
			},
		})
		console.log(`[mdns] advertising soundboard-bridge on ${os.hostname()}:${port}`)
	} catch (err) {
		console.warn('[mdns] could not start advertisement:', err.message)
	}
}

function stopMdnsAdvertisement() {
	if (mdnsService) {
		try { mdnsService.stop && mdnsService.stop(() => {}) } catch (_) {}
		mdnsService = null
	}
	if (bonjourInstance) {
		try { bonjourInstance.destroy() } catch (_) {}
		bonjourInstance = null
	}
}

// Chromium-Background-Throttling deaktivieren — sonst wird Audio gedrosselt
// sobald das Fenster minimiert oder verdeckt ist.
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')

// Mikrofon-Permission still im Hintergrund erlauben (nötig damit
// Audio-Ausgabegeräte mit Namen aufgelistet werden können — ein
// Chromium-Datenschutz-Quirk).
app.commandLine.appendSwitch('enable-features', 'WebAssemblyExperimentalJSPI')
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

let mainWindow = null
let bridge = null
let lastBridgeStatus = { running: false, port: 8765 }

function broadcastStatus() {
	if (mainWindow && !mainWindow.isDestroyed()) {
		mainWindow.webContents.send('bridge:status', lastBridgeStatus)
	}
}

function createBridge() {
	bridge = new BridgeServer({
		port: 8765,
		htmlFile: path.join(__dirname, 'index.html'),
		onLog: (msg) => {
			console.log(`[bridge] ${msg}`)
			lastBridgeStatus = bridge.getStatus()
			broadcastStatus()
		},
	})
}

function createWindow() {
	mainWindow = new BrowserWindow({
		width: 1280,
		height: 860,
		minWidth: 700,
		minHeight: 500,
		title: 'Soundboard',
		icon: path.join(__dirname, 'soundboard.ico'),
		backgroundColor: '#141414',
		autoHideMenuBar: true,
		webPreferences: {
			preload: path.join(__dirname, 'preload.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: false,
			backgroundThrottling: false,
		},
	})

	// Externe Links nicht im Electron-Fenster, sondern im Standard-Browser öffnen
	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		shell.openExternal(url)
		return { action: 'deny' }
	})

	mainWindow.loadFile('index.html')

	// Vor dem Schließen: Bridge sauber stoppen
	mainWindow.on('close', async (e) => {
		if (bridge && bridge.getStatus().running) {
			e.preventDefault()
			try {
				await bridge.stop()
			} catch (_) {}
			mainWindow.destroy()
		}
	})

	mainWindow.on('closed', () => {
		mainWindow = null
	})
}

app.whenReady().then(async () => {
	// Media-Permissions automatisch erlauben (für enumerateDevices mit Labels nötig)
	// Wir setzen beide Handler — Request fragt aktiv, Check liefert bestehende
	// Permissions ohne Nachfrage zurück.
	session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
		if (permission === 'media' || permission === 'mediaKeySystem' || permission === 'audioCapture') {
			return callback(true)
		}
		callback(false)
	})

	session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
		if (permission === 'media' || permission === 'mediaKeySystem' || permission === 'audioCapture') {
			return true
		}
		return false
	})

	// Display-Media-Permissions ebenfalls automatisch akzeptieren
	if (session.defaultSession.setDisplayMediaRequestHandler) {
		session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
			callback({})
		})
	}

	createBridge()
	createWindow()

	// Auto-Start: per Default Bridge sofort hochfahren
	try {
		await bridge.start()
		lastBridgeStatus = bridge.getStatus()
	} catch (err) {
		console.error('Bridge konnte nicht automatisch starten:', err.message)
		lastBridgeStatus = { running: false, port: 8765, error: err.message }
	}
	broadcastStatus()

	// macOS-typisches Verhalten — App offen halten, neues Fenster bei Klick
	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow()
	})

	// Status-Updates auch periodisch (für SSE-Client-Verbindungsstatus etc.)
	setInterval(() => {
		if (!bridge) return
		const s = bridge.getStatus()
		if (s.soundboardConnected !== lastBridgeStatus.soundboardConnected || s.padCount !== lastBridgeStatus.padCount) {
			lastBridgeStatus = s
			broadcastStatus()
		}
	}, 1000)
})

app.on('window-all-closed', async () => {
	stopMdnsAdvertisement()
	if (bridge) {
		try {
			await bridge.stop()
		} catch (_) {}
	}
	if (process.platform !== 'darwin') app.quit()
})

// ----- IPC: Bridge-Steuerung -----

ipcMain.handle('bridge:start', async () => {
	try {
		const status = await bridge.start()
		lastBridgeStatus = status
		startMdnsAdvertisement(status.port || 8765)
		broadcastStatus()
		return { ok: true, ...status }
	} catch (err) {
		return { ok: false, error: err.message }
	}
})

ipcMain.handle('bridge:stop', async () => {
	try {
		const status = await bridge.stop()
		lastBridgeStatus = status
		stopMdnsAdvertisement()
		broadcastStatus()
		return { ok: true, ...status }
	} catch (err) {
		return { ok: false, error: err.message }
	}
})

ipcMain.handle('bridge:status', async () => {
	return bridge ? bridge.getStatus() : { running: false }
})

ipcMain.handle('bridge:openExternal', async (_, url) => {
	shell.openExternal(url)
})

// ----- Session save/load -----

ipcMain.handle('session:save', async (_, data) => {
	try {
		const result = await dialog.showSaveDialog(mainWindow, {
			title: 'Session speichern',
			defaultPath: 'soundboard-session.json',
			filters: [
				{ name: 'Soundboard Session', extensions: ['json'] },
				{ name: 'All Files', extensions: ['*'] },
			],
		})
		if (result.canceled || !result.filePath) return { ok: false, canceled: true }
		await fs.writeFile(result.filePath, JSON.stringify(data, null, 2), 'utf-8')
		return { ok: true, path: result.filePath }
	} catch (err) {
		return { ok: false, error: err.message }
	}
})

ipcMain.handle('session:load', async () => {
	try {
		const result = await dialog.showOpenDialog(mainWindow, {
			title: 'Session laden',
			filters: [
				{ name: 'Soundboard Session', extensions: ['json'] },
				{ name: 'All Files', extensions: ['*'] },
			],
			properties: ['openFile'],
		})
		if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true }
		const filePath = result.filePaths[0]
		const content = await fs.readFile(filePath, 'utf-8')
		const data = JSON.parse(content)
		return { ok: true, path: filePath, data }
	} catch (err) {
		return { ok: false, error: err.message }
	}
})

// ----- Audio-File von Pfad als Data-URL lesen -----

ipcMain.handle('audio:read', async (_, filePath) => {
	try {
		const buffer = await fs.readFile(filePath)
		// MIME-Type aus Endung ableiten
		const ext = path.extname(filePath).toLowerCase()
		const mimes = {
			'.mp3': 'audio/mpeg',
			'.wav': 'audio/wav',
			'.ogg': 'audio/ogg',
			'.m4a': 'audio/mp4',
			'.flac': 'audio/flac',
			'.aac': 'audio/aac',
			'.opus': 'audio/opus',
		}
		const mime = mimes[ext] || 'audio/mpeg'
		const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`
		return { ok: true, dataUrl, fileName: path.basename(filePath) }
	} catch (err) {
		return { ok: false, error: err.message }
	}
})
