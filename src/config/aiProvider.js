const OpenAI = require("openai");

const client = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,


    baseURL: "https://openrouter.ai/api/v1",  // To make the same openAPI lib to send orders to Openrouter instead of openAI

});

module.exports = client;