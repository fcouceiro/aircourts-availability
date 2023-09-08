const moment = require('moment')

const airCourtsWrapper = require('./index')
const ddb = require('./aws/ddb')

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

    await bulkUpsert(upsertData)
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

    // Perform batch upserts
    const upsertPromises = dataBatches.map(batch => {
        const batchWriteParams = {
            RequestItems: {
                [tableName]: batch.map(item => ({
                    PutRequest: {
                        Item: item,
                    },
                })),
            },
        };

        return ddb.batchWrite(batchWriteParams).promise();
    });

    return Promise.all(upsertPromises)
}

module.exports = {
    sweep
}