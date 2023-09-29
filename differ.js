const Diff = require('diff')
const { s3, BUCKET_NAME } = require('./aws/s3');

const KEEP_VERSIONS = 2

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

  // Get the list of object versions
  const data = await s3.listObjectVersions({
    Bucket: bucketName,
    Prefix: objectKey
  }).promise()

  // Sort versions by date (ascending by LastModified)
  const versions = data.Versions
  const sortedVersions = versions.sort((a, b) => new Date(a.LastModified) - new Date(b.LastModified))

  if (versions <= 2) {
    return console.log("Not enough versions for comparison - exit")
  }

  // Add version number
  for (let i = 0; i < sortedVersions.length; i++) {
    sortedVersions[i].VersionNumber = i + 1
    sortedVersions[i].BucketName = bucketName
  }

  // Get diff of last two versions
  const diffData = await compareS3(sortedVersions[sortedVersions.length - 2], sortedVersions[sortedVersions.length - 1])

  const deleteOldVersions = async () => {
    // Only continue there are more versions that we should keep
    if (data.Versions.length <= KEEP_VERSIONS) {
      return console.log("Not enough versions for deletion - exit")
    }
    await deleteS3(sortedVersions)
  }

  const writeDiffDataToS3 = async () => {
    // Only writing "added slots" for now.
    // Consider moving both added and removed to an SNS topic

    if (diffData.addedSlots.length === 0) {
      return console.log("Added slots count is zero - skipping upload")
    }

    const data = JSON.stringify({ diffedAt: (new Date().toISOString()), addedSlots: diffData.addedSlots })
    return writeDiffFile(data, `diff/${fileName}`, BUCKET_NAME)
  }

  return Promise.all([writeDiffDataToS3(), deleteOldVersions()])
}

const compareS3 = async (oldVersion, newVersion) => {
  // Get original text from objects 
  const [oldObject, newObject] = await Promise.all([
    s3.getObject({ Bucket: oldVersion.BucketName, Key: oldVersion.Key, VersionId: oldVersion.VersionId }).promise(),
    s3.getObject({ Bucket: newVersion.BucketName, Key: newVersion.Key, VersionId: newVersion.VersionId }).promise()
  ])

  // Convert buffers to strings
  const oldFileContent = oldObject.Body.toString('utf-8');
  const newFileContent = newObject.Body.toString('utf-8');

  // Parse the JSON content into a JavaScript variable
  const oldJsonObject = JSON.parse(oldFileContent);
  const newJsonObject = JSON.parse(newFileContent);

  const diffResult = Diff.diffArrays(oldJsonObject, newJsonObject, {
    comparator: (left, right) => {
      return left.slot_id === right.slot_id
    }
  })

  return diffResult.reduce((slots, diff) => {
    if (diff.added === true) {
      return {
        ...slots,
        addedSlots: [
          ...slots.addedSlots,
          ...diff.value
        ]
      }
    }
    if (diff.removed === true) {
      return {
        ...slots,
        removedSlots: [
          ...slots.removedSlots,
          ...diff.value
        ]
      }
    }
    return slots
  }, { addedSlots: [], removedSlots: [] })
}

const deleteS3 = async (versions) => {
  const params = {
    Bucket: versions[0].BucketName,
    Delete: {
      Objects: []
    }
  }

  // Add keys/versions from objects that are KEEP_VERSIONS behind
  versions.map((version) => {
    if ((versions.length - version.VersionNumber) >= KEEP_VERSIONS) {
      params.Delete.Objects.push({
        Key: version.Key,
        VersionId: version.VersionId
      })
    }
  })

  // Delete versions
  await s3.deleteObjects(params).promise()
}

const writeDiffFile = async (data, fileName, bucketName) => {
  // Define the S3 object parameters
  const s3Params = {
    Bucket: bucketName,
    Key: fileName,
    Body: data,
    ContentType: 'application/json',
  };

  try {
    // Upload the JSON content to S3
    await s3.upload(s3Params).promise();
    console.log(`Uploaded ${s3Params.Key} to S3`);
  } catch (error) {
    console.error(`Error uploading ${s3Params.Key} to S3: ${error.message}`);
  }
}

module.exports = {
  run
}
