const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');

const app = express();

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const openaiApiKey = process.env.OPENAI_API_KEY;

const client = new line.Client(config);

app.post('/webhook', line.middleware(config), async (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then(result => res.json(result))
    .catch(err => {
      console.error(err);
      res.status(500).end();
    });
});

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const userMessage = event.message.text;
  const replyToken = event.replyToken;

  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'あなたは宅建士試験の学習アシスタントです。受験者の質問には正確でわかりやすい日本語で答えてください。「問題を出して」と言われた場合は、宅建試験の一問一答問題を1問出題し、答えと簡単な解説も加えてください。'
        },
        {
          role: 'user',
          content: userMessage
        }
      ],
      temperature: 0.7
    },
    {
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      }
    }
  );

  const gptReply = response.data.choices[0].message.content;

  return client.replyMessage(replyToken, {
    type: 'text',
    text: gptReply
  });
}

app.get('/', (req, res) => res.send('宅建Bot is running!'));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running at http://localhost:${port}`));