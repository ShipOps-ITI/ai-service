const OpenAI = require("openai");

const client = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
    maxRetries: Math.max(0, Number(process.env.AI_PROVIDER_MAX_RETRIES) || 2),
    timeout: Number(process.env.AI_PROVIDER_TIMEOUT_MS) || 30000,
});

module.exports = client;
