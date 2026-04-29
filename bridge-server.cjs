/**
 * Soundboard Bridge — als Klasse, damit sie aus Electron heraus
 * programmatisch gestartet und gestoppt werden kann.
 *
 * Behält 1:1 die HTTP-API der alten bridge.js, sodass das bestehende
 * Companion-Modul ohne Änderungen weiter funktioniert.
 */

const http = require('http')
const fs = require('fs')
const path = require('path')

class BridgeServer {
	constructor(opts = {}) {
		this.port = opts.port || 8765
		this.htmlFile = opts.htmlFile || null
		this.onLog = opts.onLog || (() => {})

		this.sseClients = []
		this.lastPads = []
		this.lastState = {}
		this.server = null
		this.running = false
	}

	getStatus() {
		return {
			running: this.running,
			port: this.port,
			soundboardConnected: this.sseClients.length > 0,
			padCount: this.lastPads.length,
		}
	}

	start() {
		return new Promise((resolve, reject) => {
			if (this.running) return resolve(this.getStatus())

			const server = http.createServer((req, res) => this._handleRequest(req, res))

			server.on('error', (err) => {
				if (err.code === 'EADDRINUSE') {
					reject(new Error(`Port ${this.port} ist belegt`))
				} else {
					reject(err)
				}
			})

			server.listen(this.port, () => {
				this.server = server
				this.running = true
				this.onLog(`Bridge läuft auf Port ${this.port}`)
				resolve(this.getStatus())
			})
		})
	}

	stop() {
		return new Promise((resolve) => {
			if (!this.running || !this.server) return resolve(this.getStatus())

			for (const c of this.sseClients) {
				try {
					c.end()
				} catch (_) {}
			}
			this.sseClients = []

			let resolved = false
			const finish = () => {
				if (resolved) return
				resolved = true
				this.running = false
				this.server = null
				this.onLog('Bridge gestoppt')
				resolve(this.getStatus())
			}

			this.server.close(finish)
			// Force-fallback falls close hängt
			setTimeout(finish, 1500)
		})
	}

	// ----- internals -----

	_broadcastSse(event, data) {
		const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
		this.sseClients = this.sseClients.filter((c) => {
			if (c.writableEnded || c.destroyed) return false
			try {
				c.write(payload)
				return true
			} catch (_) {
				return false
			}
		})
	}

	_sendCommand(msg) {
		const before = this.sseClients.length
		this._broadcastSse('command', msg)
		return { ok: before > 0, clients: before }
	}

	_sendJson(res, obj, status = 200) {
		res.writeHead(status, {
			'Content-Type': 'application/json; charset=utf-8',
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
		})
		res.end(JSON.stringify(obj, null, 2))
	}

	_readBody(req) {
		return new Promise((resolve, reject) => {
			let body = ''
			req.on('data', (chunk) => {
				body += chunk
			})
			req.on('end', () => resolve(body))
			req.on('error', reject)
		})
	}

	async _handleRequest(req, res) {
		if (req.method === 'OPTIONS') {
			res.writeHead(204, {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type',
			})
			return res.end()
		}

		const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
		const pathname = url.pathname.replace(/\/+$/, '') || '/'
		let m

		// --- SSE Stream ---
		if (pathname === '/sse') {
			res.writeHead(200, {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				'Connection': 'keep-alive',
				'Access-Control-Allow-Origin': '*',
				'X-Accel-Buffering': 'no',
			})
			res.write('retry: 2000\n\n')
			res.write(`event: hello\ndata: {"connected":true,"port":${this.port}}\n\n`)
			this.sseClients.push(res)
			this.onLog(`Soundboard verbunden (gesamt: ${this.sseClients.length})`)

			const ka = setInterval(() => {
				try {
					res.write(': keepalive\n\n')
				} catch (_) {}
			}, 25000)

			req.on('close', () => {
				clearInterval(ka)
				this.sseClients = this.sseClients.filter((c) => c !== res)
				this.onLog(`Soundboard getrennt (gesamt: ${this.sseClients.length})`)
			})
			return
		}

		// --- Pad-Liste push ---
		if (pathname === '/pads' && req.method === 'POST') {
			try {
				const body = await this._readBody(req)
				const data = JSON.parse(body)
				this.lastPads = Array.isArray(data.pads) ? data.pads : []
				return this._sendJson(res, { ok: true, count: this.lastPads.length })
			} catch (err) {
				return this._sendJson(res, { ok: false, error: err.message }, 400)
			}
		}

		// --- State push ---
		if (pathname === '/state' && req.method === 'POST') {
			try {
				const body = await this._readBody(req)
				const data = JSON.parse(body)
				if (data.id !== undefined) {
					this.lastState[data.id] = {
						playing: !!data.playing,
						fading: data.fading || null,
						name: data.name || null,
					}
				}
				return this._sendJson(res, { ok: true })
			} catch (err) {
				return this._sendJson(res, { ok: false, error: err.message }, 400)
			}
		}

		// --- Companion: /trigger/{n} ---
		if ((m = pathname.match(/^\/trigger\/(\d+)$/))) {
			const idx1 = parseInt(m[1], 10)
			const r = this._sendCommand({ type: 'trigger', index: idx1 - 1 })
			return this._sendJson(res, { command: 'trigger', index: idx1, ...r })
		}
		if (pathname === '/trigger' && url.searchParams.has('name')) {
			const name = url.searchParams.get('name')
			const r = this._sendCommand({ type: 'trigger', name })
			return this._sendJson(res, { command: 'trigger', name, ...r })
		}

		// /stop/{n}
		if ((m = pathname.match(/^\/stop\/(\d+)$/))) {
			const idx1 = parseInt(m[1], 10)
			const r = this._sendCommand({ type: 'stop', index: idx1 - 1 })
			return this._sendJson(res, { command: 'stop', index: idx1, ...r })
		}
		if (pathname === '/stop' && url.searchParams.has('name')) {
			const name = url.searchParams.get('name')
			const r = this._sendCommand({ type: 'stop', name })
			return this._sendJson(res, { command: 'stop', name, ...r })
		}

		// /toggle/{n}
		if ((m = pathname.match(/^\/toggle\/(\d+)$/))) {
			const idx1 = parseInt(m[1], 10)
			const r = this._sendCommand({ type: 'toggle', index: idx1 - 1 })
			return this._sendJson(res, { command: 'toggle', index: idx1, ...r })
		}
		if (pathname === '/toggle' && url.searchParams.has('name')) {
			const name = url.searchParams.get('name')
			const r = this._sendCommand({ type: 'toggle', name })
			return this._sendJson(res, { command: 'toggle', name, ...r })
		}

		// /stop-all
		if (pathname === '/stop-all' || pathname === '/panic') {
			const r = this._sendCommand({ type: 'stop-all' })
			return this._sendJson(res, { command: 'stop-all', ...r })
		}

		// /api/pads
		if (pathname === '/api/pads') {
			return this._sendJson(res, {
				connected: this.sseClients.length > 0,
				count: this.lastPads.length,
				pads: this.lastPads,
			})
		}
		if (pathname === '/api/state') {
			return this._sendJson(res, {
				connected: this.sseClients.length > 0,
				state: this.lastState,
			})
		}
		if (pathname === '/api/health' || pathname === '/api') {
			return this._sendJson(res, {
				service: 'Soundboard Bridge',
				port: this.port,
				soundboard_connected: this.sseClients.length > 0,
				pad_count: this.lastPads.length,
				endpoints: {
					trigger: 'GET /trigger/{n}  oder  /trigger?name={name}',
					stop: 'GET /stop/{n}  oder  /stop?name={name}',
					toggle: 'GET /toggle/{n}  oder  /toggle?name={name}',
					stop_all: 'GET /stop-all',
					pads_list: 'GET /api/pads',
					state: 'GET /api/state',
				},
			})
		}

		// HTML servieren (für Remote-Browser)
		if (pathname === '/' || pathname === '/index.html') {
			if (this.htmlFile && fs.existsSync(this.htmlFile)) {
				res.writeHead(200, {
					'Content-Type': 'text/html; charset=utf-8',
					'Cache-Control': 'no-cache',
				})
				return fs.createReadStream(this.htmlFile).pipe(res)
			}
			res.writeHead(404, { 'Content-Type': 'text/plain' })
			return res.end('HTML nicht konfiguriert. Bridge läuft. Status: /api/health')
		}

		this._sendJson(res, { error: 'not found', path: pathname }, 404)
	}
}

module.exports = { BridgeServer }
