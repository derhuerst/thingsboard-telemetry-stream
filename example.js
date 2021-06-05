'use strict'

const {connect, fetchDevices, subscribeToTimeseries} = require('.')

const abortWithError = (err) => {
	console.error(err)
	process.exit(1)
}

;(async () => {
	const connection = await connect({
		host: process.env.THINGSBOARD_HOST || 'thingsboard.cloud',
		token: process.env.THINGSBOARD_TOKEN,
		user: process.env.THINGSBOARD_USER,
		password: process.env.THINGSBOARD_PASSWORD,
	})
	connection.addEventListener('error', abortWithError)

	const devices = await fetchDevices(connection, process.env.THINGSBOARD_DEVICE_GROUP)
	const deviceIds = devices.map(d => d.entityId.id)
	console.log('device IDs', deviceIds)

	const sub = await subscribeToTimeseries(connection, deviceIds)
	let updates = 0
	sub.on('data', (deviceId, data) => {
		console.log(deviceId, data)
		if (++updates >= 10) connection.close()
	})
})()
.catch(abortWithError)
