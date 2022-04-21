const airCourtsWrapper = require('./index')
const moment = require('moment')
const express = require('express')
const app = express()

const airCourtsCoimbraClubs = require('./clubs-coimbra.json')
const coimbraClubIds = airCourtsCoimbraClubs.map((club) => club.id)

app.set('view engine', 'ejs')
app.use(express.json())

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
    res.render('week-availability', { weekDate: moment(weekDate).format('DD/MM/yyyy'), availabilities: mergedAvailabilities })
})

app.get('/', (req, res) => res.render('index'))

module.exports = {
    app
}