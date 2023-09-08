const AWS = require('aws-sdk');

let options = undefined
if (process.env.LOCAL_DDB === 'true') {
    options = {
        region: 'localhost',
        endpoint: 'http://localhost:8000'
    }
}

const ddb = new AWS.DynamoDB.DocumentClient(options)

module.exports = ddb