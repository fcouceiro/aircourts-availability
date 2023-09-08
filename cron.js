const moment = require('moment')
const axios = require('axios').default
const API_URL = process.env.API_URL || 'http://localhost:3000/dev'
const url = API_URL + 'sweep'

module.exports.handler = async (event, context) => {
  const now = moment()
  const nowQuery = now.format('YYYY-MM-DD')
  
  const result = await axios.get(url, {
    params: {
      date: nowQuery,
    }
  })

  console.log('Sweep status:', result?.status)
};