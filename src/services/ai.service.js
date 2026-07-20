// services/: المكان الوحيد اللي بيتعامل مع OpenAI.
const client = require("../config/aiProvider"); // gab el client eli 3amlnah gwa el config 

//The main functions
// chat()
// generateReport()
// summarize()

const systemPrompt = require("../prompts/systemPrompt");
const shipments = require("../data/shipment");

/////-> 
const shipmentContext = JSON.stringify(shipments, null, 2);



const chat = async (question) => { // The 1st function called chat()

    const response = await client.chat.completions.create({ // the most imp line that will communicate with GPT

        // model: "gpt-4.1-mini",   // The model name - fast and chea
        // model: "google/gemma-4-26b-a4b-it:free",
        model: process.env.AIModel,

        messages: [

            {

                role: "system",

                content: systemPrompt  // Read the system prompt from here in the beggining the answer the user's question

            },
            {
                role: "system",
                content: `Current shipment data:\n${shipmentContext}`,
            },

            {

                role: "user",

                content: question

            }

        ],

    });

    return response.choices[0].message.content;

};

module.exports = {
    chat,
};