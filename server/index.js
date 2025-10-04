// server/index.js
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Telegraf } = require('telegraf');

const { BOT_TOKEN, PORT = 3000 } = process.env;
if (!BOT_TOKEN) {
  console.error('ERROR: .env BOT_TOKEN is missing');
  process.exit(1);
}

const app = express();
app.use(bodyParser.json());
app.use(cors({ origin: true })); // при желании ограничьте своим доменом

// Временное хранилище результатов выбора: request_id -> { user_id, username, name }
const selections = new Map();

// эндпоинт, который опрашивает ваш WebApp (pages/stars/app.js)
app.get('/api/user-share', (req, res) => {
  const rid = String(req.query.rid || '');
  const data = selections.get(rid);
  if (data) return res.json({ ready: true, ...data });
  return res.json({ ready: false });
});

const bot = new Telegraf(BOT_TOKEN);

// Пришли данные из WebApp (sendData)
bot.on('message', async (ctx) => {
  const wad = ctx.message?.web_app_data;
  if (!wad) return;

  let payload = {};
  try { payload = JSON.parse(wad.data || '{}'); } catch (_) {}

  if (payload.action === 'request_user' && payload.request_id) {
    const request_id = String(payload.request_id);

    await ctx.reply(
      'Выберите получателя:',
      {
        reply_markup: {
          keyboard: [[{
            text: 'Выбрать получателя',
            request_user: { request_id } // системная кнопка Telegram
          }]],
          resize_keyboard: true,
          one_time_keyboard: true,
          input_field_placeholder: 'Нажмите кнопку, чтобы выбрать получателя'
        }
      }
    );
  }
});

// Когда пользователь в Telegram выбрал человека — приходит user_shared
bot.on('user_shared', async (ctx) => {
  const { request_id, user_id } = ctx.message.user_shared;

  let username = null;
  let name = null;
  try {
    // username может отсутствовать — пробуем подтянуть
    const chat = await ctx.telegram.getChat(user_id).catch(() => null);
    if (chat) {
      username = chat.username || null;
      name = [chat.first_name, chat.last_name].filter(Boolean).join(' ') || null;
    }
  } catch(_) {}

  selections.set(String(request_id), { user_id, username, name, ts: Date.now() });

  // авто-очистка через 5 минут (чтобы память не росла)
  setTimeout(() => selections.delete(String(request_id)), 5 * 60 * 1000);

  await ctx.reply('Получатель выбран ✓', { reply_markup: { remove_keyboard: true } });
});

bot.launch().then(() => console.log('Bot launched'));
app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));

// При корректном завершении
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
