/**
 * Electron-Hauptprozess.
 * Startet ein Fenster mit der Soundboard-UI und stellt die Bridge
 * als IPC-steuerbaren In-Process-Server bereit.
 */

const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron')
const path = require('path')
const { BridgeServer } = require('./bridge-server.cjs')

// Chromium-Background-Throttling deaktivieren — sonst wird Audio gedrosselt
// sobald das Fenster minimiert oder verdeckt ist.
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')

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
