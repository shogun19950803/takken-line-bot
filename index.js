const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');

const app = express();
app.use(express.json());

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const openaiApiKey = process.env.OPENAI_API_KEY;
const client = new line.Client(config);

// 簡易的な状態管理（メモリ保持）
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

  // 回答を待っている場合
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

  // 「問題出して」と言われたら出題
  if (userMessage.includes("問題")) {
    const prompt = `
宅建士試験の過去問やそれに準じた内容で、4択の一問一答を1問出してください。
出力形式は以下を厳守してください：
---
問題：{ここに問題文}
選択肢：
A. ～
B. ～
C. ～
D. ～
答え：A
解説：～
---
このうち「答え」と「解説」は別に保存して、最初の返答では出さないでください。
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

      const problemMatch = content.match(/問題：(.*?)\n/);
      const choicesMatch = content.match(/選択肢：(.*?)\n答え/s);
      const answerMatch = content.match(/答え：(.*)/);
      const explanationMatch = content.match(/解説：(.*)/);

      const questionText = problemMatch ? problemMatch[0] : "問題の取得に失敗しました。";
      const choicesText = choicesMatch ? choicesMatch[1].replace(/\n/g, '\n') : "";
      const answer = answerMatch ? answerMatch[1].trim() : "不明";
      const explanation = explanationMatch ? explanationMatch[1].trim() : "解説なし";

      userStates[userId] = {
        awaitingAnswer: true,
        answer: answer,
        explanation: explanation
      };

      const reply = `${questionText}選択肢：
${choicesText}
※ A〜D で答えてください`;

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

  // 通常の宅建質問対応
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
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running at http://localhost:${port}`));