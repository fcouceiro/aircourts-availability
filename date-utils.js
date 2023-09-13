const moment = require("moment")


module.exports = {
    /**
     * Generates all week days formatted as yyyy-MM-DD incuding dayInWeek.
     * If dayInWeek is not provided,  "now()" is used.
     */
    weekDays: (dayInWeek = new Date()) => {
        const output = []
        const requestedWeekDay = moment(dayInWeek)
        for (let weekDayIndex = requestedWeekDay.weekday(); weekDayIndex < 7; weekDayIndex++) {
            const weekDay = requestedWeekDay.clone().weekday(weekDayIndex)
            output.push(weekDay.format('yyyy-MM-DD'))
        }
        return output
    },

    next: (n, dayInWeek = new Date()) => {
        const output = []
        const requestedWeekDay = moment(dayInWeek)
        for (let index = 0; index < n; index++) {
            const weekDay = requestedWeekDay.clone().add(index, 'days');
            output.push(weekDay.format('yyyy-MM-DD'))
        }
        return output
    }
}