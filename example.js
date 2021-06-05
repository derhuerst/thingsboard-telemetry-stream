'use strict'

const {connect} = require('.')

const abortWithError = (err) => {
	console.error(err)
	process.exit(1)
}

;(async () => {
	const connection = connect({
		host: process.env.THINGSBOARD_HOST || 'thingsboard.cloud',
		token: process.env.THINGSBOARD_TOKEN,
		user: process.env.THINGSBOARD_USER,
		password: process.env.THINGSBOARD_PASSWORD,
	})
	connection.addEventListener('error', abortWithError)

	// todo

	connection.close()
})()
.catch(abortWithError)
