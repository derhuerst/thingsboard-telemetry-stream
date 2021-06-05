'use strict'

const fetch = require('cross-fetch')
const ReconnectingWebSocket = require('reconnecting-websocket')
const WebSocket = require('isomorphic-ws')
const parseJWT = require('jwt-decode')
const {EventEmitter} = require('events')

const fetchThingsboardToken = async (useHttps, host, user, password) => {
	let url = new URL(`${useHttps ? 'https' : 'http'}://example.org`)
	url.host = host
	url.pathname = '/api/auth/login'

	const res = await fetch(url.href, {
		method: 'POST',
		mode: 'cors',
		redirect: 'follow',
		headers: {
			'content-type': 'application/json',
			'accept': 'application/json',
		},
		body: JSON.stringify({username: user, password}),
	})
	if (!res.ok) {
		const err = new Error('failed to fetch Thingsboard Telemetry API token: ' + res.statusText)
		err.statusCode = res.status
		err.res = res
		throw err
	}

	const body = await res.json()
	return body.token
}

const connectToThingsboardTelemetryAPI = (cfg = {}) => {
	const {
		useHttps,
		host,
		token,
		user, password,
		wsOpts,
	} = {
		useHttps: true,
		host: 'thingsboard.cloud',
		token: process.env.THINGSBOARD_TOKEN,
		user: process.env.THINGSBOARD_USER,
		password: process.env.THINGSBOARD_PASSWORD,
		wsOpts: {},
		...cfg,
	}
	if ('string' !== typeof host) {
		throw new TypeError('cfg.host must be a string')
	}
	if (token !== undefined && 'string' !== typeof token) {
		throw new TypeError('cfg.token must be a string')
	}
	if (user !== undefined && 'string' !== typeof user) {
		throw new TypeError('cfg.user must be a string')
	}
	if (user && 'string' !== typeof password) {
		throw new TypeError('cfg.password must be a string')
	}
	if (!token && !user) {
		throw new Error('either cfg.token or cfg.user & cfg.password must be provided')
	}

	let wsUrl = new URL(`${useHttps ? 'wss' : 'ws'}://example.org`)
	wsUrl.host = host
	wsUrl.pathname = '/api/ws/plugins/telemetry'
	let curToken = token, curTokenParsed = token && parseJWT(token)
	const getWsUrl = async () => {
		const expired = curTokenParsed ? Math.floor(Date.now() / 1000) > curTokenParsed.exp : true
		if (user && expired) {
			curToken = await fetchThingsboardToken(useHttps, host, user, password)
			curTokenParsed = parseJWT(curToken)
		}
		wsUrl.searchParams.set('token', curToken)
		return wsUrl.href
	}

	const ws = new ReconnectingWebSocket(getWsUrl, undefined, {
		WebSocket,
		// tweak for faster reconnects
		minReconnectionDelay: 500 + Math.random() * 1000,
		...wsOpts,
	})

	return ws
}

const cmdIds = new WeakMap() // connection -> previous cmd ID
const getThingsboardCommandId = (connection) => {
	let id = cmdIds.has(connection) ? cmdIds.get(connection) + 1 : 0
	cmdIds.set(connection, id)
	return id
}

const parsedMsgs = new WeakMap() // message event -> parsed message
const parseThingsboardMessage = (msgEv) => {
	if (parsedMsgs.has(msgEv)) return parsedMsgs.get(msgEv)
	try {
		const msg = JSON.parse(msgEv.data + '')
		if (msg.errorCode !== 0) {
			const err = new Error(msg.errorMsg || 'unknown error')
			err.code = msg.errorCode
			throw err
		}
		parsedMsgs.set(msgEv, msg)
		return msg
	} catch (err) {
		err.messageEvent = msgEv
		throw err
	}
}

const sendThingsboardCommands = async (connection, allCmds, opt = {}) => {
	const {
		timeout,
		subscribe,
	} = {
		timeout: 5 * 1000, // 5s
		subscribe: false,
		...opt,
	}

	const req = {}
	const res = {}
	const tasks = new Map() // cmd ID -> path in `res`
	for (const [key, cmds] of Object.entries(allCmds)) {
		cmds.forEach((cmd, i) => {
			if ('number' !== typeof cmd.cmdId) {
				throw new TypeError(`allCmds[${key}][${i}].cmdId must be a number`)
			}
			tasks.set(cmd.cmdId, [key, i])
		})
		req[key] = cmds
		res[key] = new Array(cmds.length)
	}
	connection.send(JSON.stringify(req))

	let resolve, reject, timer
	const p = new Promise((res, rej) => {
		resolve = res
		reject = rej
		const timeoutErr = new Error('timeout waiting for command responses')
		timeoutErr.commands = allCmds
		timer = setTimeout(reject, timeout, timeoutErr)
	})

	const onMsg = (msgEv) => {
		try {
			const msg = parseThingsboardMessage(msgEv)
			const id = subscribe ? msg.subscriptionId : msg.cmdId
			if (!tasks.has(id)) return; // skip unrelated response
			const [key, i] = tasks.get(id)
			res[key][i] = msg.data
			tasks.delete(id)

			if (tasks.size === 0) {
				// teardown
				clearTimeout(timer)
				resolve()
			}
		} catch (err) {
			connection.removeEventListener('response', onMsg)
			reject(err)
		}
	}
	connection.addEventListener('message', onMsg)
	await p
	return res
}

const fetchThingsboardDevices = async (connection, deviceGroupId) => {
	if ('string' !== typeof deviceGroupId) {
		throw new TypeError('deviceGroupId must be a string')
	}

	const res = await sendThingsboardCommands(connection, {
		entityDataCmds: [{
			cmdId: getThingsboardCommandId(connection),
			query: {
				entityFilter: {
					type: 'entityGroup',
					groupType: 'DEVICE',
					entityGroup: deviceGroupId,
				},
				pageLink: {pageSize: 100}, // todo: walk pages until end
			},
		}],
	})
	return res.entityDataCmds[0].data
}

// todo: add pull-based API, e.g. async iterator?
const subscribeToThingsboardDevicesTimeseries = async (connection, deviceIds) => {
	const subscriptions = new Map() // subscription ID -> device ID
	const out = new EventEmitter()

	const tsSubCmds = []
	for (const deviceId of deviceIds) {
		const subId = getThingsboardCommandId(connection)
		tsSubCmds.push({
			cmdId: subId,
			entityType: 'DEVICE',
			entityId: deviceId,
			scope: 'LATEST_TELEMETRY',
		})
		subscriptions.set(subId, deviceId)
	}

	const emitData = (deviceId, data) => {
		out.emit(deviceId + ':data', data)
		out.emit('data', deviceId, data)
	}

	let subscribing = true, firstDataEvents = []
	const onMsg = (msgEv) => {
		const res = parseThingsboardMessage(msgEv)
		if (!subscriptions.has(res.subscriptionId)) return; // skip unrelated response
		const deviceId = subscriptions.get(res.subscriptionId)

		if (subscribing) {
			// The message has arrived before the `sendThingsboardCommands`
			// Promise has resolved. We emit the data later to let calling
			// code add event listener(s) first.
			firstDataEvents.push([deviceId, res.data])
		} else emitData(deviceId, res.data)
	}
	connection.addEventListener('message', onMsg)

	await sendThingsboardCommands(connection, {tsSubCmds}, {
		timeout: 15 * 1000, // 15s
		subscribe: true,
	})
	subscribing = false

	setImmediate(() => {
		for (const [deviceId, data] of firstDataEvents) emitData(deviceId, data)
		firstDataEvents = []
	})

	const unsubscribe = async () => {
		const subs = Array.from(subscriptions.entries())
		await sendThingsboardCommands(connection, {
			tsSubCmds: subs.map(([subId, deviceId]) => ({
				// todo: this doesn't seem to work
				cmdId: subId,
				entityType: 'DEVICE',
				entityId: deviceId,
				scope: 'LATEST_TELEMETRY',
				unsubscribe: true,
			})),
		}, {
			timeout: 15 * 1000, // 15s
		})

		subscriptions.clear()
		connection.removeEventListener('message', onMsg)
	}

	out.subscriptions = subscriptions
	out.unsubscribe = unsubscribe
	return out
}

module.exports = {
	connect: connectToThingsboardTelemetryAPI,
	getCommandId: getThingsboardCommandId,
	sendCommands: sendThingsboardCommands,
	fetchDevices: fetchThingsboardDevices,
	subscribeToTimeseries: subscribeToThingsboardDevicesTimeseries,
}
