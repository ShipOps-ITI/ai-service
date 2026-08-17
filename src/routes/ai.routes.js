// routes/: تستقبل الطلبات من الفرونت.
const express = require("express");

const router = express.Router();

////// updated 
const aiController = require("../controllers/ai.controller");
const requireAccessToken = require("../requireAccessToken");
// router.post("/chat", (req, res) => {
//     res.json({
//         success: true,
//         message: "AI Chat Endpoint Working 🚀"
//     });
// });

//This line instead of all the prev part
router.post("/chat", requireAccessToken, aiController.chat);

module.exports = router;
