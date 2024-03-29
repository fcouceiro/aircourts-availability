const moment = require('moment')
const { sweep } = require('./sweeper')

module.exports.handler = async (event, context) => {
  const now = moment(event?.date)

  const dateQuery = now.format('YYYY-MM-DD')
  const startTime = event?.startTime || '12:00'

  await sweep({ weekDate: dateQuery, startTime: startTime })
};