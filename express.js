const airCourtsWrapper = require('./index')
const moment = require('moment')
const express = require('express')
const ddb = require('./aws/ddb')
const { sweep } = require('./sweeper')

const app = express()
const airCourtsCoimbraClubs = require('./clubs-coimbra.json')
const lambda = require('./aws/lambda')
const coimbraClubIds = airCourtsCoimbraClubs.map((club) => club.id)

app.set('view engine', 'ejs')
app.use(express.json())
app.use(express.urlencoded())

app.get('/week-availability/json', async (req, res) => {
    const mergedAvailabilities = await airCourtsWrapper.getClubsWeekAvailability({
        clubIds: coimbraClubIds,
        weekDate: req.query.weekDate,
        startTime: req.query.startTime,
        sport: 4 // Padel
    })
    res.json(mergedAvailabilities)
})

app.get('/week-availability', async (req, res) => {
    const weekDate = req.query.weekDate || new Date()
    const mergedAvailabilities = await airCourtsWrapper.getClubsWeekAvailability({
        clubIds: coimbraClubIds,
        weekDate: weekDate,
        startTime: req.query.startTime,
        sport: 4 // Padel
    })
    const momentWeekDate = moment(weekDate)
    res.render('week-availability', {
        htmlWeekDate: momentWeekDate.format('YYYY-MM-DD'),
        weekDate: momentWeekDate.format('DD/MM/yyyy'),
        availabilities: mergedAvailabilities
    })
})

app.get('/day-availability', async (req, res) => {
    const date = moment(req.query.date || new Date())
    const dateQuery = date.format('YYYY-MM-DD')
    const params = {
        TableName: 'slots',
        IndexName: 'StartDateTimestampGSI', // Specify the GSI name
        KeyConditionExpression: '#start_date = :start_date',
        ExpressionAttributeNames: {
            '#start_date': 'start_date',
        },
        ExpressionAttributeValues: {
            ':start_date': dateQuery, // Replace with your actual start_date
        },
    };

    // Perform the query
    try {
        const data = await ddb.query(params).promise()
        res.render('day-availability', {
            moment: moment,
            date: dateQuery,
            htmlWeekDate: dateQuery,
            slots: data.Items
        })
    } catch (error) {
        console.error('Error querying DynamoDB:', error);
        res.status(500).send('Error')
    }
})

app.post('/sweep', async (req, res) => {
    try {
        await lambda.invoke({
            FunctionName: process.env.CRON_LAMBDA_NAME,
            InvocationType: 'Event',
            Payload: JSON.stringify({ date: req.body.date, startTime: req.body.startTime })
        }).promise()
        res.status(202).send('Enqueued')
    } catch (error) {
        console.error('Error invoking Lambda:', error);
        res.status(500).send('Error')
    }
})

app.get('/', (req, res) => res.render('index'))

app.get('/home', (req, res) => res.redirect('https://aircourts-availability-test-bucket.s3.eu-west-3.amazonaws.com/index.html'))

module.exports = {
    app
}