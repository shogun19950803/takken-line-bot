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

const userStates = {};

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

  const userId = event.source.userId;
  const userMessage = event.message.text.trim();
  const replyToken = event.replyToken;

  if (userStates[userId] && userStates[userId].awaitingAnswer) {
    const correctAnswer = userStates[userId].answer;
    const explanation = userStates[userId].explanation;

    const userAnswer = userMessage.toUpperCase();
    const result = (userAnswer === correctAnswer.toUpperCase()) ? "⭕ 正解！" : "❌ 不正解…";
    const replyText = `${result}
正解：${correctAnswer}
解説：${explanation}`;
    delete userStates[userId];

    return client.replyMessage(replyToken, {
      type: 'text',
      text: replyText
    });
  }

  if (userMessage.includes("問題")) {
    const prompt = `
あなたは宅建士試験の出題Botです。
以下の条件に沿って、本試験形式に近い問題を1問だけ作成してください。

【条件】
・四肢択一形式（A〜E）の選択肢を5つ含めること
・問題文と選択肢を明確に分けること
・正解と解説は出力には含めるが、最初の返答には出さないで内部に保持すること

【出力形式】
---
問題：以下の記述のうち、正しいものはどれか。
A. ○○○
B. ○○○
C. ○○○
D. ○○○
E. ○○○
答え：C
解説：〜
---
`;

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7
        },
        {
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const content = response.data.choices[0].message.content;

      const questionMatch = content.match(/問題：(.*?)\n/);
      const choicesMatch = content.match(/A\..*?E\..*?\n/);
      const answerMatch = content.match(/答え：(.*)/);
      const explanationMatch = content.match(/解説：(.*)/);

      const questionText = questionMatch ? questionMatch[0] : "問題の取得に失敗しました。";
      const choicesText = choicesMatch ? choicesMatch[0].replace(/\n/g, '\n') : "";
      const answer = answerMatch ? answerMatch[1].trim() : "不明";
      const explanation = explanationMatch ? explanationMatch[1].trim() : "解説なし";

      userStates[userId] = {
        awaitingAnswer: true,
        answer: answer,
        explanation: explanation
      };

      const reply = `${questionText}${choicesText}
※ A〜E で答えてください`;

      return client.replyMessage(replyToken, {
        type: 'text',
        text: reply
      });

    } catch (error) {
      console.error("OpenAI error:", error.response?.data || error.message);
      return client.replyMessage(replyToken, {
        type: 'text',
        text: '問題の生成中にエラーが発生しました。もう一度お試しください。'
      });
    }
  }

  const prompt = `あなたは宅建士試験の学習アシスタントです。次の質問にわかりやすく答えてください：${userMessage}`;

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
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

  } catch (error) {
    console.error("ChatGPT API error:", error.response?.data || error.message);
    return client.replyMessage(replyToken, {
      type: 'text',
      text: 'エラーが発生しました。時間をおいて再度お試しください。'
    });
  }
}

app.get('/', (req, res) => res.send('宅建Bot is running!'));

// 🔧 Renderが検出できるようにポートを明示的に指定
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});