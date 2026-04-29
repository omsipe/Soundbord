/**
 * Preload — exponiert eine schmale, getypte API ans Renderer-Window
 * über contextBridge (sicher, mit aktivierter contextIsolation).
 */

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
	startBridge: () => ipcRenderer.invoke('bridge:start'),
	stopBridge: () => ipcRenderer.invoke('bridge:stop'),
	getBridgeStatus: () => ipcRenderer.invoke('bridge:status'),
	openExternal: (url) => ipcRenderer.invoke('bridge:openExternal', url),
	onBridgeStatus: (callback) => {
		const wrapped = (_, status) => callback(status)
		ipcRenderer.on('bridge:status', wrapped)
		return () => ipcRenderer.removeListener('bridge:status', wrapped)
	},
})
