const OpenAI = require("openai");

const client = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
    maxRetries: 0,
    timeout: Number(process.env.AI_PROVIDER_TIMEOUT_MS) || 12000,
});

module.exports = client;
