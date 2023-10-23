const { PromisePool } = require('@supercharge/promise-pool')
const { s3, BUCKET_NAME } = require('./aws/s3');
const { CHANNEL } = require('./slack');
const { nanoid } = require('nanoid')

const DEFAULT_SLACK_RECEIVER = {
  type: "slack",
  "channel": CHANNEL
}

const create = async (date, afterTime, beforeTime, clubIds) => {
  const id = nanoid()
  const subscription = {
    id,
    date,
    window: {
      gteTime: afterTime,
      lteTime: beforeTime
    },
    clubIds,
    receiver: DEFAULT_SLACK_RECEIVER
  }

  const keyById = `subscriptions/by-id/${id}.json`
  await s3.putObject({
    Bucket: BUCKET_NAME,
    Key: keyById,
    ContentType: 'application/json',
    Body: JSON.stringify(subscription)
  }).promise()

  const { errors } = await PromisePool
    .withConcurrency(4)
    .for(clubIds)
    .process((clubId) => {
      const keyByDateAndClubId = `subscriptions/by-date-and-club/${date}/${clubId}/${id}.json`
      return s3.putObject({
        Bucket: BUCKET_NAME,
        Key: keyByDateAndClubId,
        ContentType: 'application/json',
        Body: JSON.stringify({})
      }).promise()
    })
  console.log('Errors: ', errors)

  return subscription
}

module.exports = {
  create
}