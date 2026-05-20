/**
 * Preload — exponiert eine schmale, getypte API ans Renderer-Window
 * über contextBridge (sicher, mit aktivierter contextIsolation).
 */

const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
	// Bridge control
	startBridge: () => ipcRenderer.invoke('bridge:start'),
	stopBridge: () => ipcRenderer.invoke('bridge:stop'),
	getBridgeStatus: () => ipcRenderer.invoke('bridge:status'),
	openExternal: (url) => ipcRenderer.invoke('bridge:openExternal', url),
	onBridgeStatus: (callback) => {
		const wrapped = (_, status) => callback(status)
		ipcRenderer.on('bridge:status', wrapped)
		return () => ipcRenderer.removeListener('bridge:status', wrapped)
	},
	// Session save/load
	saveSession: (data) => ipcRenderer.invoke('session:save', data),
	loadSession: () => ipcRenderer.invoke('session:load'),
	// Audio file reading
	readAudioFile: (filePath) => ipcRenderer.invoke('audio:read', filePath),
	// File-Pfad eines DOM File-Objekts ermitteln (Electron 32+ Workaround,
	// weil file.path nicht mehr direkt verfügbar ist)
	getFilePath: (file) => {
		try {
			if (file && webUtils && typeof webUtils.getPathForFile === 'function') {
				return webUtils.getPathForFile(file) || null
			}
		} catch (_) { /* fall through */ }
		return null
	},
})
