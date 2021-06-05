# thingsboard-telemetry-stream

**Fetch data from the [Thingsboard](https://thingsboard.io/) [telemetry WebSocket API](https://thingsboard.io/docs/user-guide/telemetry/#websocket-api).**

[![npm version](https://img.shields.io/npm/v/thingsboard-telemetry-stream.svg)](https://www.npmjs.com/package/thingsboard-telemetry-stream)
![ISC-licensed](https://img.shields.io/github/license/derhuerst/thingsboard-telemetry-stream.svg)
![minimum Node.js version](https://img.shields.io/node/v/thingsboard-telemetry-stream.svg)
[![support me via GitHub Sponsors](https://img.shields.io/badge/support%20me-donate-fa7664.svg)](https://github.com/sponsors/derhuerst)
[![chat with me on Twitter](https://img.shields.io/badge/chat%20with%20me-on%20Twitter-1da1f2.svg)](https://twitter.com/derhuerst)


## Installation

```shell
npm install thingsboard-telemetry-stream
```


## Usage

```js
const {connect} = require('thingsboard-telemetry-stream')

const connection = connect({
	token: '<API token here>',
})
connection.addEventListener('error', abortWithError)
```

If you pass in `token` or set the `THINGSBOARD_TOKEN` environment variable, only this token will be used. To let it periodically generate new token instead, pass in `user` & `password` or set the `THINGSBOARD_USER` & `THINGSBOARD_PASSWORD` environment variables.

### subscribing to devices' telemetry data

```js
const {fetchDevices, subscribeToTimeseries} = require('.')

const deviceGroupId = '780c1435-cac2-4be7-8d85-0961239e02e4'

const devices = await fetchDevices(connection, deviceGroupId)
const deviceIds = devices.map(d => d.entityId.id)
const sub = await subscribeToTimeseries(connection, deviceIds)

// all devices's telemetry
sub.on('data', (deviceId, data) => console.log(deviceId, data))
// a single device's telemetry
sub.on('338e9c33-988f-4314-9e46-cb8c94236942:data', (data) => console.log(data))
```

### sending commands manually

```js
const {sendCommands, getCommandId} = require('.')

const res = await sendCommands(connection, {
	entityDataCmds: [{
		cmdId: getCommandId(connection),
		query: {
			entityFilter: {
				type: 'entityGroup',
				groupType: 'DEVICE',
				entityGroup: '780c1435-cac2-4be7-8d85-0961239e02e4',
			},
			pageLink: {pageSize: 10},
		},
	}],
})
console.log(res.entityDataCmds[0])
```

```js
{
	data: [
		{
			entityId: {
				entityType: 'DEVICE',
				id: '338e9c33-988f-4314-9e46-cb8c94236942'
			},
			readAttrs: true, readTs: true,
			latest: {}, timeseries: {},
		},
		{
			entityId: {
				entityType: 'DEVICE',
				id: 'cf59aeaa-7a09-457a-bd04-4f3a2596b960'
			},
			readAttrs: true, readTs: true,
			latest: {}, timeseries: {},
		},
	],
	totalPages: 1,
	totalElements: 2,
	hasNext: false,
}
```


## Contributing

If you have a question or need support using `thingsboard-telemetry-stream`, please double-check your code and setup first. If you think you have found a bug or want to propose a feature, use [the issues page](https://github.com/derhuerst/thingsboard-telemetry-stream/issues).
