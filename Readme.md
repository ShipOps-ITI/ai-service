# 🤖 AI Integration Service

AI Microservice for the Smart Logistics System

--------------------------------------

🚀 Features

✔ AI Chat
✔ OpenRouter Integration
✔ Prompt Engineering
✔ REST API
✔ Layered Architecture

--------------------------------------

📂 Project Structure

src/
├── config/
├── controllers/
├── routes/
├── services/
...

--------------------------------------

⚙ Installation

npm install

--------------------------------------

▶ Run

npm start

--------------------------------------

📮 API Endpoint

POST http://localhost:5005/api/v1/ai/chat

Request
{
  "question": "Which shipments are delayed?"
}

Response
{
   ...
}

## Data flow

1. The signed-in website sends the question and its bearer token to `POST /api/v1/ai/chat`.
2. The AI service forwards that token to the shipment and core services and requests only read-only data.
3. Each backend applies its existing role and company authorization before returning records.
4. Only those authorized records are included as context for the model. The model never connects to a database directly.

Configure `SHIPMENT_SERVICE_URL`, `CORE_SERVICE_URL`, and `FRONTEND_ORIGIN` in `.env` when your services are not using the local defaults.
