'use strict'

const ReconnectingWebSocket = require('reconnecting-websocket')
const WebSocket = require('isomorphic-ws')

const connectToThingsboardTelemetryAPI = (cfg = {}) => {
	const {
		useHttps,
		host,
		token,
		wsOpts,
	} = {
		useHttps: true,
		host: 'thingsboard.cloud',
		token: process.env.THINGSBOARD_TOKEN,
		wsOpts: {},
		...cfg,
	}
	if ('string' !== typeof host) {
		throw new TypeError('cfg.host must be a string')
	}
	if (token !== undefined && 'string' !== typeof token) {
		throw new TypeError('cfg.token must be a string')
	}

	let wsUrl = new URL(`${useHttps ? 'wss' : 'ws'}://example.org`)
	wsUrl.host = host
	wsUrl.pathname = '/api/ws/plugins/telemetry'
	wsUrl.searchParams.set('token', token)

	const ws = new ReconnectingWebSocket(wsUrl, undefined, {
		WebSocket,
		// tweak for faster reconnects
		minReconnectionDelay: 500 + Math.random() * 1000,
		...wsOpts,
	})

	return ws
}

module.exports = {
	connect: connectToThingsboardTelemetryAPI,
}
