const moment = require('moment')
const { PromisePool } = require('@supercharge/promise-pool')
const { groupBy, prop, sortBy } = require('ramda')

const airCourtsWrapper = require('./index')
const ddb = require('./aws/ddb')
const { s3, BUCKET_NAME } = require('./aws/s3')

const airCourtsCoimbraClubs = require('./clubs-coimbra.json')
const coimbraClubIds = airCourtsCoimbraClubs.map((club) => club.id)

const sweep = async ({ weekDate, startTime } = {}) => {
    const availabilities = await airCourtsWrapper.getClubsWeekAvailability({
        clubIds: coimbraClubIds,
        weekDate: weekDate,
        startTime: startTime,
        sport: 4 // Padel
    })

    const courtsById = availabilities?.courtsById || []
    const slotsById = availabilities?.slotsById || []
    const slotIds = Object.keys(slotsById)
    const upsertData = slotIds.map(slotId => {
        const slot = slotsById[slotId];
        const court = courtsById[slot.courtId]
        const timestamp = `${slot.date} ${slot.start}`
        const timestampMoment = moment(timestamp)
        return {
            slot_id: slot.id,
            start_date: slot.date,
            timestamp: timestamp,
            ttl: timestampMoment.clone().add(6, 'day').toDate().getTime(),
            data: {
                court: {
                    id: court.id,
                    name: court.name,
                    clubId: court.clubId,
                    clubName: court.clubName
                }
            }
        }
    })

    const sortedUpsertData = sortBy(prop('ttl'))(upsertData)

    //await sendToDDB(upsertData, availabilities)
    await sendToS3(sortedUpsertData, availabilities)
}

const sendToDDB = async (upsertData, availabilities) => {
    return bulkUpsert(upsertData)
}

const bulkUpsert = async (dataToUpsert) => {
    const tableName = 'slots';
    const batchSize = 25; // DynamoDB limit is 25

    // Chunk the data into batches
    const dataBatches = [];
    for (let i = 0; i < dataToUpsert.length; i += batchSize) {
        const batch = dataToUpsert.slice(i, i + batchSize);
        dataBatches.push(batch);
    }

    // Perform batch upserts with concurrency of 1 (serial execution)
    const upsertParams = dataBatches.map(batch => {
        const batchWriteParams = {
            RequestItems: {
                [tableName]: batch.map(item => ({
                    PutRequest: {
                        Item: item,
                    },
                })),
            },
        };

        return batchWriteParams
    });


    return PromisePool
        .withConcurrency(1)
        .for(upsertParams)
        .process(async (batch) => {
            return ddb.batchWrite(batch).promise();
        })
}

const sendToS3 = async (upsertData, availabilities) => {
    const dataByDate = groupBy(prop('start_date'))(upsertData)
    return batchWriteJsonToS3(dataByDate, BUCKET_NAME)
}

const batchWriteJsonToS3 = async (jsonObject, bucketName) => {
    // Iterate through each date key in the JSON object
    const upsertParams = Object.keys(jsonObject).map(date => {
        const jsonContent = jsonObject[date];
        const fileName = `data/${date}.json`;

        // Convert the JSON content to a string
        const jsonString = JSON.stringify(jsonContent);

        // Define the S3 object parameters
        const s3Params = {
            Bucket: bucketName,
            Key: fileName,
            Body: jsonString,
            ContentType: 'application/json',
        };
        return s3Params
    })

    return PromisePool
        .withConcurrency(3)
        .for(upsertParams)
        .process(async (s3Params) => {
            // Upload the JSON content to S3
            await s3.upload(s3Params).promise();
            console.log(`Uploaded ${s3Params.Key} to S3`);
        })

}

module.exports = {
    sweep
}