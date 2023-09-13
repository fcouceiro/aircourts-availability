const { PromisePool } = require('@supercharge/promise-pool')
const ejs = require('ejs')
const moment = require('moment')
const { s3, BUCKET_NAME } = require('./aws/s3');

const getAndParseFile = async (eventRecord) => {
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
  const lastObjectKeyPart = objectKeyParts.length > 0 ? objectKeyParts[objectKeyParts.length - 1] : 'no-name.json'

  // Fetch the content of the file from S3
  const s3Params = {
    Bucket: bucketName,
    Key: objectKey,
  };

  const data = await s3.getObject(s3Params).promise();
  const fileContent = data.Body.toString('utf-8');

  // Parse the JSON content into a JavaScript variable
  const jsonObject = JSON.parse(fileContent);

  return { lastObjectKeyPart, jsonObject }
}

const renderFile = async (slots, date) => {
  const result = await ejs.renderFile(__dirname + '/views/render-day-availability.ejs', {
    moment: moment,
    date: date,
    slots: slots
  })
  return result
}

const writeHtmlFile = async (html, fileName, bucketName) => {
  // Define the S3 object parameters
  const s3Params = {
    Bucket: bucketName,
    Key: fileName,
    Body: html,
    ContentType: 'text/html',
  };

  try {
    // Upload the JSON content to S3
    await s3.upload(s3Params).promise();
    console.log(`Uploaded ${s3Params.Key} to S3`);
  } catch (error) {
    console.error(`Error uploading ${s3Params.Key} to S3: ${error.message}`);
  }
}

module.exports.handler = async (event, context) => {
  await PromisePool
    .withConcurrency(1)
    .for(event?.Records || [])
    .process(async (s3Record) => {
      // Upload the JSON content to S3
      const { lastObjectKeyPart, jsonObject } = await getAndParseFile(s3Record)
      console.log('Parsed JSON:', { lastObjectKeyPart });

      // TODO: render file and put on S3
      const filename = lastObjectKeyPart.replace('.json', '')
      const renderedContent = await renderFile(jsonObject, filename)
      await writeHtmlFile(renderedContent, `html/${filename}.html`, BUCKET_NAME)
    })

  return {
    statusCode: 200,
    body: 'File processed successfully',
  };
};
