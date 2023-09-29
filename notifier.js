const { PromisePool } = require('@supercharge/promise-pool')
const { s3 } = require('./aws/s3');
const { notify } = require('./slack');
const { propOr } = require('ramda');
const moment = require('moment')

const run = async (eventRecord) => {
  // Get the S3 event record from the event payload
  const s3Record = eventRecord?.s3;
  if (!s3Record) {
    console.log('Event record is not from S3')
    return null
  }

  // Extract relevant information from the S3 event record
  const bucketName = s3Record.bucket.name;
  const objectKey = decodeURIComponent(s3Record.object.key);
  const objectKeyParts = objectKey.split('/')
  const fileName = objectKeyParts.length > 0 ? objectKeyParts[objectKeyParts.length - 1] : 'no-name.json'

  const object = await s3.getObject({ Bucket: bucketName, Key: objectKey }).promise()
  const fileContent = object.Body.toString('utf-8');
  const diffObject = JSON.parse(fileContent);

  const addedSlotsCount = diffObject.addedSlots?.length || 0

  if (addedSlotsCount === 0) {
    return console.log('Slots did not change - exit')
  }

  const date = fileName.replace('.json', '')
  const slackMessage = renderMessage(diffObject, date)

  return notify(slackMessage)
}

const renderMessage = (diff, date) => {
  const slots = propOr([], 'addedSlots')(diff)
  const slotsMessage = slots.map(slot => {
    const datetime = moment(slot.timestamp)

    const time = datetime.format('HH:mm')
    
    
    const link = `https://www.aircourts.com/index.php/site/view_club/${slot.data.court.clubId}/${date}/${time}`

    return ['🟢', time, slot.data.court.clubName, '-', slot.data.court.name, `<${link}|🔗 Book>`].join(' ')
  })

  return `📡 *${date}*\n🆕 slots: ${diff?.addedSlots?.length || 0}\n\n${slotsMessage.join('\n\n')}`
}

module.exports.handler = async (event, context) => {
  await PromisePool
    .withConcurrency(1)
    .for(event?.Records || [])
    .process(async (s3Record) => {
      try {
        await run(s3Record)
      } catch (error) {
        console.log(error)
      }
    })

  return {
    statusCode: 200,
    body: 'File processed successfully',
  };
};
