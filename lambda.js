const serverless = require('serverless-http')
const { app } = require('./express')

module.exports.handler = serverless(app)