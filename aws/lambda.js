const AWS = require('aws-sdk');

let options = undefined
if (process.env.IS_OFFLINE === 'true') {
    options = {
        region: 'localhost',
        endpoint: 'http://localhost:3002'
    }
}

const lambda = new AWS.Lambda(options)

module.exports = lambda