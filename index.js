const axios = require('axios').default
const dateUtils = require('./date-utils')

async function requestAircourtsClubAvailability({ clubId, date, startTime, sport }) {
    return axios.get(`https://www.aircourts.com/index.php/api/search_with_club/${clubId}`, {
        headers: {
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Accept-Language': 'pt-PT,pt;q=0.9',
            'Host': 'www.aircourts.com',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.3 Safari/605.1.15',
            'Referer': 'https://www.aircourts.com/index.php',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'X-Requested-With': 'XMLHttpRequest',
        },
        params: {
            sport: 4, // Padel
            date: date,
            start_time: startTime
        }
    })
}

function unprojectSearchWithClubResults(courts, config = {
    allowedSports: [4], // Padel is sportId = 4 on AirCourts
    allowedDurations: [90], // 90 minutes
}) {
    const courtsById = {}
    let slotsById = {}

    const refSlotsByDate = {}

    courts.forEach((court) => {
        const isCourtAllowed = court.sports.some((sport) => {
            return config.allowedSports.some((allowedSport) => sport.id == allowedSport)
        })
        if (!isCourtAllowed) {
            return
        }

        courtsById[court.id] = {
            id: court.id,
            name: court.name.trim(),
            clubId: court.club_id,
            clubName: court.club_name.trim(),
            photos: court.photos.map((photo) => photo.path)
        }

        court.slots.forEach((slot) => {
            const isSlotAvailable = (slot.status === 'available'
                && slot.durations.some((duration) => {
                    return config.allowedDurations.some((allowedDuration) => duration == allowedDuration)
                }))
            if (!isSlotAvailable) {
                return
            }

            slotsById[slot.id] = {
                id: slot.id,
                date: slot.date,
                start: slot.start,
                end: slot.end,
                courtId: slot.court_id
            }

            if (!refSlotsByDate[slot.date]) {
                refSlotsByDate[slot.date] = []
            }
            refSlotsByDate[slot.date].push(slot.id)
        })
    })

    slotsById = Object.keys(refSlotsByDate).reduce((finalSlotsById, dateWithSlots) => {
        const slotIds = refSlotsByDate[dateWithSlots]
        const dateSlotsById = slotIds.reduce((dateSlotsById, id) => {
            const slot = slotsById[id]
            dateSlotsById[slot.id] = slot
            return dateSlotsById
        }, {})
        return {
            ...finalSlotsById,
            ...dateSlotsById
        }
    }, {})

    return {
        courtsById,
        slotsById,
        slotsByDate: refSlotsByDate
    }
}

async function getClubAvailability({ clubId, date, startTime, sport }) {
    const { data } = await requestAircourtsClubAvailability({ clubId, date, startTime, sport })
    return unprojectSearchWithClubResults(data.results)
}

async function getClubsWeekAvailability({ clubIds, weekDate, startTime, sport }) {
    const weekDays = dateUtils.weekDays(weekDate)

    // Request club availability for each week day
    const inflightOps = weekDays.reduce((promises, weekDay) => {
        const ops = clubIds.map((id) => this.getClubAvailability({
            clubId: id,
            date: weekDay,
            startTime: startTime || '19:00',
            sport: sport
        }))
        return promises.concat(ops)
    }, [])
    const availabilitiesByClub = await Promise.all(inflightOps)
    const mergedAvailabilities = availabilitiesByClub.reduce((output, clubAvailabilities) => {
        const slotsByDate = { ...output.slotsByDate }
        Object.keys(clubAvailabilities.slotsByDate).forEach((date) => {
            if (date in slotsByDate) {
                slotsByDate[date] = slotsByDate[date].concat(clubAvailabilities.slotsByDate[date])
            } else {
                slotsByDate[date] = clubAvailabilities.slotsByDate[date]
            }
        })
        return {
            courtsById: {
                ...output.courtsById,
                ...clubAvailabilities.courtsById
            },
            slotsById: {
                ...output.slotsById,
                ...clubAvailabilities.slotsById
            },
            slotsByDate: slotsByDate
        }
    }, {
        courtsById: {},
        slotsById: {},
        slotsByDate: {}
    })
    return mergedAvailabilities
}

module.exports = {
    getClubAvailability,
    getClubsWeekAvailability
}