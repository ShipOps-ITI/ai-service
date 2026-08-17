// controllers/: تستقبل السؤال وتقرر تعمل إيه.
// chatbot function 
// exports.chat = async (req, res) => {

//     return res.json({
//         success: true,
//         message: "Controller Working 🚀"
//     });

// };

// chat()

// generateReport()

// summarize()

// translate()
 

// The updated version after including the API key 
const aiService = require("../services/ai.service");

const chat = async (req, res) => {

    try {  // To catch if there any Error will be returned from API key or there is an internet issue

        const question = typeof req.body.question === "string" ? req.body.question.trim() : "";

        if (!question || question.length > 2000) {
            return res.status(400).json({
                success: false,
                message: "Question must be between 1 and 2000 characters.",
            });
        }

        const answer = await aiService.chat(question, req.accessToken);

        res.status(200).json({
            success: true,
            answer,
        });

    } catch (error) {

        console.error(error);

        res.status(error.status || 500).json({

            success: false,

            message: error.message,

        });

    }

};

module.exports = {
    chat,
};
