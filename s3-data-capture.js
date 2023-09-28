const { PromisePool } = require('@supercharge/promise-pool')
const RenderHtml = require('./render-html')
const Differ = require('./differ')

module.exports.handler = async (event, context) => {
    await PromisePool
        .withConcurrency(1)
        .for(event?.Records || [])
        .process(async (s3Record) => {
            try {
                await Promise.all([
                    RenderHtml.run(s3Record),
                    Differ.run(s3Record)
                ])
            } catch (error) {
                console.log(error)
            }
        })

    return {
        statusCode: 200,
        body: 'File processed successfully',
    };
};