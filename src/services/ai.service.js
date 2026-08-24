const client = require("../config/aiProvider");
const crypto = require("crypto");
const systemPrompt = require("../prompts/systemPrompt");
const { toolDefinitions, executeTool } = require("./shipopsTools.service");

const toolCache = new Map();
const CACHE_TTL_MS = Math.max(0, Number(process.env.AI_TOOL_CACHE_TTL_MS) || 20000);
const MAX_TOOL_CACHE_ENTRIES = 200;
const MAX_TOKENS = Math.min(800, Math.max(80, Number(process.env.AI_MAX_TOKENS) || 350));
const generalPrompt = `
You are the ShipOps AI Logistics Assistant. Answer general maritime, logistics,
shipping, port, vessel, and technology questions using your general knowledge.

Return only the concise final answer. Never reveal chain-of-thought, hidden
reasoning, rule analysis, or a thinking process. You do not have live internet
search in this request, so never claim that you searched the web. If reliable
details about a named real-world vessel are not available in your knowledge,
say that plainly and suggest using an IMO number or MMSI with a public vessel
registry. Do not claim that a real-world vessel is missing from ShipOps.
`;
const webSearchPrompt = `
You are the ShipOps AI Logistics Assistant. Use the provided live web-search
capability to answer real-world maritime and vessel questions. Prefer vessel
identity data supported by multiple maritime sources. Clearly separate stable
particulars (IMO, MMSI, flag, dimensions, year built and tonnage) from dynamic
AIS data (position, speed, destination and update time). Cite the source pages
with Markdown links and warn when live AIS reports disagree or may be stale.

Return only the concise final answer. Never reveal chain-of-thought, hidden
reasoning, rule analysis, raw tool syntax, or a thinking process. Never claim
that a real-world vessel is missing from ShipOps unless ShipOps tools were
explicitly requested and actually used.
`;

const getModels = () => [
  process.env.AI_MODEL || process.env.AIModel,
  ...(process.env.AI_FALLBACK_MODELS || "").split(","),
].map((model) => model?.trim()).filter(Boolean);
const getWebModels = () => [
  process.env.AI_WEB_MODEL || "google/gemini-2.5-flash-lite",
  ...getModels(),
].map((model) => model?.trim()).filter(Boolean)
  .filter((model, index, all) => all.indexOf(model) === index);
const getAnswer = (response) => response.choices?.[0]?.message;

const containsReasoningLeak = (content) => typeof content === "string" && (
  /(?:^|\n)\s*(?:here(?:'s| is) (?:a |the )?thinking process|thinking process:|analysis:|analyze user input:|check rules:|step-by-step reasoning:)/i.test(content)
  || /(?:^|\n)\s*\d+\.\s*(?:analyze user input|check rules|determine intent|construct response)/i.test(content)
  || /<\|(?:tool_call_start|tool_call_end|assistant|analysis)\|>/i.test(content)
);

const hasUsableAnswer = (response) => {
  const message = getAnswer(response);
  return Boolean(
    message?.tool_calls?.length
    || (typeof message?.content === "string"
      && message.content.trim()
      && !containsReasoningLeak(message.content)),
  );
};

const isRateLimitError = (error) => error?.status === 429 || error?.code === 429 || /rate.?limit|429/i.test(error?.message || "");

const needsShipOpsData = (question) => {
  const normalized = question.toLowerCase();
  const mentionsPrivateScope = /\b(my|mine|our|shipops|dashboard|account|company|system)\b/.test(normalized);
  const mentionsShipOpsEntity = /\b(ship|ships|vessel|vessels|fleet|fleets|shipment|shipments|port|ports|document|documents|user|users|team)\b/.test(normalized);

  return (mentionsPrivateScope && mentionsShipOpsEntity)
    || /\b(in|on)\s+(my\s+)?(shipops|account|company|fleet)\b/.test(normalized)
    || /\b(tracking summary|ais update|my account|users in (the )?system|team members)\b/.test(normalized);
};

const needsWebSearch = (question) => {
  const normalized = question.toLowerCase();
  const requestsFreshLookup = /\b(search|look up|lookup|find online|latest|current|live|today|right now|where is)\b/.test(normalized);
  const mentionsMaritimeEntity = /\b(ship|vessel|container ship|tanker|imo|mmsi|port|carrier)\b/.test(normalized);
  return requestsFreshLookup && mentionsMaritimeEntity;
};

const webSearchTool = {
  type: "openrouter:web_search",
  parameters: {
    engine: "exa",
    mode: "fast",
    max_results: 3,
    max_total_results: 3,
    max_uses: 1,
    max_characters: 3500,
    allowed_domains: [
      "vesselfinder.com",
      "myshiptracking.com",
      "maritimeoptima.com",
      "magicport.ai",
      "econdb.com",
      "atlas.flexport.com",
      "equasis.org",
    ],
  },
};

const formatAnswer = (message) => {
  const content = message.content.trim();
  const citations = (message.annotations || [])
    .map((annotation) => annotation?.url_citation)
    .filter((citation) => citation?.url && !content.includes(citation.url))
    .filter((citation, index, all) => {
      const hostname = new URL(citation.url).hostname.replace(/^www\./, "");
      return all.findIndex((item) => new URL(item.url).hostname.replace(/^www\./, "") === hostname) === index;
    })
    .slice(0, 3);

  if (!citations.length) return content;

  const sources = citations
    .map((citation) => {
      const hostname = new URL(citation.url).hostname.replace(/^www\./, "");
      const label = hostname.split(".")[0];
      const sourceName = label.charAt(0).toUpperCase() + label.slice(1);
      return `- [${sourceName}](${citation.url})`;
    })
    .join("\n");
  return `${content}\n\n### Sources\n${sources}`;
};

const cacheKey = (name, argumentsJson, accessToken) => crypto
  .createHash("sha256")
  .update(`${name}:${argumentsJson || ""}:${accessToken || ""}`)
  .digest("hex");

const executeCachedTool = async (name, argumentsJson, accessToken) => {
  if (!CACHE_TTL_MS) return executeTool(name, argumentsJson, accessToken);

  const key = cacheKey(name, argumentsJson, accessToken);
  const cached = toolCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const value = await executeTool(name, argumentsJson, accessToken);
  if (toolCache.size >= MAX_TOOL_CACHE_ENTRIES) toolCache.delete(toolCache.keys().next().value);
  toolCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
};

const requestCompletion = async (models, request) => {
  let lastError;

  for (const model of models) {
    try {
      const response = await client.chat.completions.create({ ...request, model });
      if (hasUsableAnswer(response)) return response;

      const content = getAnswer(response)?.content;
      lastError = new Error(containsReasoningLeak(content)
        ? `Model ${model} exposed internal reasoning instead of a final answer.`
        : `Model ${model} returned an empty response.`);
      console.warn(lastError.message);
    } catch (error) {
      lastError = error;
      console.warn(`Model ${model} failed: ${error.message}`);
    }
  }

  const rateLimited = isRateLimitError(lastError);
  const error = new Error(rateLimited
    ? "The AI provider is temporarily rate-limited. Please try again shortly."
    : "None of the configured AI models returned a usable answer.");
  error.status = rateLimited ? 503 : 502;
  error.cause = lastError;
  throw error;
};

const chat = async (question, accessToken) => {
  const models = getModels();
  if (!models.length) throw new Error("AI_MODEL is not configured.");

  const useTools = needsShipOpsData(question);
  const useWeb = !useTools && needsWebSearch(question);

  const messages = [
    { role: "system", content: useTools ? systemPrompt : (useWeb ? webSearchPrompt : generalPrompt) },
    {
      role: "user",
      content: useWeb
        ? `${question}\n\nSearch the exact vessel name first. Prioritize results that identify its IMO and MMSI, then use those identifiers to verify matching vessel records.`
        : question,
    },
  ];

  for (let step = 0; step < (useTools ? 2 : 1); step += 1) {
    const request = {
      messages,
      max_tokens: MAX_TOKENS,
      temperature: 0.2,
      reasoning: {
        effort: "none",
        exclude: true,
      },
    };
    // Tools are available only during the data-retrieval step.  Once tool
    // results have been added, the next call must produce the final reply
    // instead of making another tool call and exhausting the two-step flow.
    if (useTools && step === 0) {
      request.tools = toolDefinitions;
      request.tool_choice = "auto";
    } else if (useWeb) {
      request.tools = [webSearchTool];
      request.max_tool_calls = 1;
    }

    const response = await requestCompletion(useWeb ? getWebModels() : models, request);

    const assistantMessage = getAnswer(response);
    if (!assistantMessage) break;
    if (assistantMessage.content && !assistantMessage.tool_calls?.length) {
      return formatAnswer(assistantMessage);
    }
    if (!useTools && assistantMessage.tool_calls?.length) break;
    if (!assistantMessage.tool_calls?.length) break;

    messages.push(assistantMessage);

    const results = await Promise.all(assistantMessage.tool_calls.map((toolCall) => executeCachedTool(
      toolCall.function.name,
      toolCall.function.arguments,
      accessToken,
    )));

    assistantMessage.tool_calls.forEach((toolCall, index) => {
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(results[index]),
      });
    });
  }

  console.warn("AI provider returned no final answer after tool processing.");
  return "I could not generate an answer from the configured AI model.";
};

module.exports = { chat };
