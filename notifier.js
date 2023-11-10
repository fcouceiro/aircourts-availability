const { PromisePool } = require('@supercharge/promise-pool')
const { s3, BUCKET_NAME } = require('./aws/s3');
const { notify } = require('./slack');
const { propOr, pluck, path, pipe, map, uniq, flatten, groupBy, prop, indexBy, values } = require('ramda');
const moment = require('moment')

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
  const date = fileName.replace('.json', '')

  const object = await s3.getObject({ Bucket: bucketName, Key: objectKey }).promise()
  const fileContent = object.Body.toString('utf-8');
  const diffObject = JSON.parse(fileContent);

  const addedSlots = propOr([], 'addedSlots')(diffObject)

  if (addedSlots.length === 0) {
    return console.log('Slots did not change - exit')
  }

  const slotsBySubscription = await groupSlotsBySubscription(addedSlots, date)
  const renderedSlots = slotsBySubscription.map((group) => {
    return {
      receiver: group.receiver,
      markdown: renderMessage(group.slots, group.date)
    }
  })
  return dispatchMessages(renderedSlots)
}

const groupSlotsBySubscription = async (slots, date) => {
  const getUniqueClubIds = pipe(map(path(['data', 'court', 'clubId'])), uniq)
  const clubIds = getUniqueClubIds(slots)

  const referencedSubscriptions = await Promise.all(clubIds.map(async (clubId) => {
    const prefixQuery = `subscriptions/by-date-and-club/${date}/${clubId}/`
    const { Contents } = await s3.listObjectsV2({
      Bucket: BUCKET_NAME,
      Prefix: prefixQuery,
      Delimiter: '/'
    }).promise()

    const subscriptionReferences = Contents.filter(ref => ref.Size > 0)

    return subscriptionReferences.map(ref => {
      return {
        clubId,
        subscriptionId: ref.Key.replace(prefixQuery, '')
      }
    })
  }))

  const getUniqueSubscriptionIds = pipe(flatten, pluck('subscriptionId'), uniq)
  const subscriptionIdsToLoad = getUniqueSubscriptionIds(referencedSubscriptions)
  const clubSubscriptionsMap = pipe(flatten, groupBy(prop('clubId')))(referencedSubscriptions)
  const subscriptions = await getSupscriptions(subscriptionIdsToLoad)
  const subscriptionsById = indexBy(prop('id'))(subscriptions)

  slots.forEach(slot => {
    const subscriptionsRefs = clubSubscriptionsMap[slot.data.court.clubId]
    if (!subscriptionsRefs || subscriptionsRefs.length === 0) {
      return {
        ...slot,
        receivers: []
      }
    }

    const subscriptions = subscriptionsRefs.map(ref => subscriptionsById[ref.subscriptionId])
    const datetime = moment(slot.timestamp)

    const filteredSubscriptions = subscriptions.filter(sub => datetime >= sub.window.gteTime && datetime <= sub.window.lteTime)

    filteredSubscriptions.forEach(subscription => {
      if (!('slots' in subscription)) {
        subscription.slots = []
      }
      subscription.slots.push(slot)
    })
  })

  return values(subscriptionsById)
}

const getSupscriptions = async (ids) => {
  const { results } = await PromisePool
    .withConcurrency(4)
    .for(ids)
    .process(async (id) => {
      const key = `subscriptions/by-id/${id}`
      const object = await s3.getObject({ Bucket: BUCKET_NAME, Key: key }).promise()
      const fileContent = object.Body.toString('utf-8');
      const subscription = JSON.parse(fileContent);

      subscription.window.gteTime = moment(`${subscription.date} ${subscription.window.gteTime}`)
      subscription.window.lteTime = moment(`${subscription.date} ${subscription.window.lteTime}`)

      return {
        ...subscription,
        id,
      }
    })

  return results
}

const renderMessage = (slots, date) => {
  const slotsMessage = slots.map(slot => {
    const datetime = moment(slot.timestamp)

    const time = datetime.format('HH:mm')


    const link = `https://www.aircourts.com/index.php/site/view_club/${slot.data.court.clubId}/${date}/${time}`

    return ['🟢', time, slot.data.court.clubName, '-', slot.data.court.name, `<${link}|🔗 Book>`].join(' ')
  })

  return `📡 *${date}*\n🆕 slots: ${slots.length}\n\n${slotsMessage.join('\n\n')}`
}

const dispatchMessages = (messages) => {
  return PromisePool.withConcurrency(2)
    .for(messages)
    .process((message) => {
      // TODO: create dispatcher factory based on receiver type
      return notify(message.markdown, message.receiver.channel)
    })
}

module.exports.handler = async (event, context) => {
  const { results, errors } = await PromisePool
    .withConcurrency(1)
    .for(event?.Records || [])
    .process((s3Record) => run(s3Record))

  console.log('Results:', results)
  console.log('Errors:', errors)
  return {
    statusCode: 200,
    body: 'File processed successfully',
  };
};

const getSubscribedDates = async () => {
  const prefixQuery = `subscriptions/by-date-and-club/`
  const { CommonPrefixes } = await s3.listObjectsV2({
    Bucket: BUCKET_NAME,
    Prefix: prefixQuery,
    Delimiter: '/'
  }).promise()



  const subscriptionReferences = CommonPrefixes.reduce((arr, { Prefix: prefix }) => {
    const results = /subscriptions\/by-date-and-club\/([0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9])\//gm.exec(prefix)
    if (results.length > 1) {
      return [...arr, results[1]]
    }
    console.log('Failed to parse Prefix', prefix)
    return arr
  }, [])

  const today = moment().format('YYYY-MM-DD')
  const dates = uniq(subscriptionReferences)
  return dates.reduce((obj, date) => {
    const momDate = moment(date)
    const isOld = momDate.isBefore(today, 'day')
    
    if (!isOld) {
      obj.validDates.push(date)
    }
    return obj
  }, { oldDates: [], validDates: []})
}

module.exports.getSubscribedDates = getSubscribedDates