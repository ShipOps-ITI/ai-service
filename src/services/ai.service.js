const client = require("../config/aiProvider");
const systemPrompt = require("../prompts/systemPrompt");
const { toolDefinitions, executeTool } = require("./shipopsTools.service");

const getModels = () => [
  process.env.AI_MODEL || process.env.AIModel,
  ...(process.env.AI_FALLBACK_MODELS || "").split(","),
].map((model) => model?.trim()).filter(Boolean);
const getAnswer = (response) => response.choices?.[0]?.message;
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const isRateLimitError = (error) => error?.status === 429 || error?.code === 429 || /rate.?limit|429/i.test(error?.message || "");

const requestCompletion = async (models, request) => {
  let lastError;

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await client.chat.completions.create({ ...request, model });
      } catch (error) {
        lastError = error;
        if (!isRateLimitError(error)) throw error;
        if (attempt === 0) await wait(1000);
      }
    }
  }

  const error = new Error("The AI provider is temporarily rate-limited. Please try again shortly.");
  error.status = 503;
  error.cause = lastError;
  throw error;
};

const chat = async (question, accessToken) => {
  const models = getModels();
  if (!models.length) throw new Error("AI_MODEL is not configured.");

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: question },
  ];

  for (let step = 0; step < 3; step += 1) {
    const response = await requestCompletion(models, {
      messages,
      tools: toolDefinitions,
      tool_choice: "auto",
    });

    const assistantMessage = getAnswer(response);
    if (!assistantMessage) break;
    if (assistantMessage.content && !assistantMessage.tool_calls?.length) {
      return assistantMessage.content;
    }
    if (!assistantMessage.tool_calls?.length) break;

    messages.push(assistantMessage);

    for (const toolCall of assistantMessage.tool_calls) {
      const result = await executeTool(
        toolCall.function.name,
        toolCall.function.arguments,
        accessToken,
      );

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }
  }

  console.warn("AI provider returned no final answer after tool processing.");
  return "I could not generate an answer from the configured AI model.";
};

module.exports = { chat };
