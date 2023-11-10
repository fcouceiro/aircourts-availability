const moment = require('moment')
const express = require('express')
const { any, isNil, either, isEmpty, flatten } = require('ramda')
const Subscriptions = require('./subscriptions')
const airCourtsCoimbraClubs = require('./clubs-coimbra.json')
const { NUMBER_OF_DAYS_SUBSCRIPTION } = require('./config')

const app = express()

app.set('view engine', 'ejs')
app.use(express.json())
app.use(express.urlencoded({
    extended: true
}))

const redirectHandler = (req, res) => res.redirect('https://aircourts-availability-test-bucket.s3.eu-west-3.amazonaws.com/index.html')
app.get('/', redirectHandler)
app.get('/home', redirectHandler)

app.get('/subscriptions', async (req, res) => {
    const today = moment()
    const min = today.clone()
    const max = today.clone().add(NUMBER_OF_DAYS_SUBSCRIPTION - 1, 'day')
    res.render('subscription', {
        htmlWeekDate: today.format('YYYY-MM-DD'),
        maxDate: max.format('YYYY-MM-DD'),
        minDate: min.format('YYYY-MM-DD'),
        maxDaysCount: NUMBER_OF_DAYS_SUBSCRIPTION,
        clubs: airCourtsCoimbraClubs.map((club) => ({ id: String(club.id), name: String(club.slug) }))
    })
})

app.post('/subscriptions', async (req, res) => {
    const { date, afterTime, beforeTime, clubIds } = req.body
    const missingParams = any(either(isNil, isEmpty))([date, afterTime, beforeTime, clubIds])
    if (missingParams) {
        return res.status(400).send()
    }

    const subscription = await Subscriptions.create(date, afterTime, beforeTime, flatten([clubIds]))
    res.json(subscription)
})

module.exports = {
    app
}