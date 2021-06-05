'use strict'

const fetch = require('cross-fetch')
const ReconnectingWebSocket = require('reconnecting-websocket')
const WebSocket = require('isomorphic-ws')
const parseJWT = require('jwt-decode')

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

module.exports = {
	connect: connectToThingsboardTelemetryAPI,
}
