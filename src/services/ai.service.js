const client = require("../config/aiProvider");
const systemPrompt = require("../prompts/systemPrompt");
const { toolDefinitions, executeTool } = require("./shipopsTools.service");

const getModel = () => process.env.AI_MODEL || process.env.AIModel;
const getAnswer = (response) => response.choices?.[0]?.message;

const chat = async (question, accessToken) => {
  const model = getModel();
  if (!model) throw new Error("AI_MODEL is not configured.");

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: question },
  ];

  for (let step = 0; step < 3; step += 1) {
    const response = await client.chat.completions.create({
      model,
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
