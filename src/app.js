const express = require("express"); //get express
const cors = require("cors"); // allows another services to communicate with the API
require("dotenv").config(); //Read from .env


// ///////////////////////
const aiRoutes = require("./routes/ai.routes");


const app = express();  //create the app

app.use(cors({
    origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
    methods: ["POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json()); //allow express to understand json 

////////////////////////////////////
app.use("/api/v1/ai", aiRoutes); //The most imp line -> where it calls the endpoint /chat in the router 
module.exports = app;
