const Slack = require('@slack/web-api')

const TOKEN_BOT = process.env.SLACK_TOKEN
const CHANNEL = process.env.SLACK_CHANNEL

const slack = new Slack.WebClient(TOKEN_BOT)

const notify = (message) => {
    return slack.chat.postMessage({
        channel: CHANNEL,
        text: message,
        unfurl_links: false,
        unfurl_media: false
    })
}

module.exports = {
    notify
}