const { PromisePool } = require('@supercharge/promise-pool')
const { s3 } = require('./aws/s3');
const { notify } = require('./slack');

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
  const removedSlotsCount = diffObject.removedSlots?.length || 0
  
  if (addedSlotsCount === 0 && removedSlotsCount === 0) {
    return console.log('Slots did not change - exit')
  }

  const slackMessage = renderMessage(diffObject, fileName)

  return notify(slackMessage)
}

const renderMessage = (diff, slotName) => {
  return `📡 *${slotName}*\n🆕 slots: ${diff?.addedSlots?.length || 0}\n🔻 ${diff?.removedSlots?.length || 0}`
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
