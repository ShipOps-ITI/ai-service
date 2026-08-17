// services/: المكان الوحيد اللي بيتعامل مع OpenAI.
const client = require("../config/aiProvider"); // gab el client eli 3amlnah gwa el config 

//The main functions
// chat()
// generateReport()
// summarize()

const systemPrompt = require("../prompts/systemPrompt");
const { getDataContext } = require("./dataContext.service");



const chat = async (question, accessToken) => { // The 1st function called chat()
    const dataContext = await getDataContext(accessToken);
    const serializedContext = JSON.stringify(dataContext);

    const response = await client.chat.completions.create({ // the most imp line that will communicate with GPT

        // model: "gpt-4.1-mini",   // The model name - fast and chea
        // model: "google/gemma-4-26b-a4b-it:free",
        model: process.env.AI_MODEL || process.env.AIModel,

        messages: [

            {

                role: "system",

                content: systemPrompt  // Read the system prompt from here in the beggining the answer the user's question

            },
            {
                role: "system",
                content: `Authorized data retrieved from ShipOps services for this request:\n${serializedContext}`,
            },

            {

                role: "user",

                content: question

            }

        ],

    });

    return response.choices[0]?.message?.content || "I could not generate an answer.";

};

module.exports = {
    chat,
};
