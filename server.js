// Reponsible only for running the server 
const app = require("./src/app");

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`AI Service Running on Port ${PORT}`);
});