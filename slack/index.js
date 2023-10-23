const Slack = require('@slack/web-api')

const TOKEN_BOT = process.env.SLACK_TOKEN
const CHANNEL = process.env.SLACK_CHANNEL

const slack = new Slack.WebClient(TOKEN_BOT)

const notify = (message, channel = CHANNEL) => {
    return slack.chat.postMessage({
        channel,
        text: message,
        unfurl_links: false,
        unfurl_media: false
    })
}

module.exports = {
    notify,
    CHANNEL
}