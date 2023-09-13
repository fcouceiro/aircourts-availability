const AWS = require('aws-sdk');

const s3 = new AWS.S3()
const BUCKET_NAME = process.env.BUCKET_NAME || 'aircourts-availability-test-bucket'

module.exports = { s3, BUCKET_NAME }