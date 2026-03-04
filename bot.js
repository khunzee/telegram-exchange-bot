require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");

// 🔑 Token & Admin from .env
const token = process.env.BOT_TOKEN;
const ADMIN_ID = parseInt(process.env.ADMIN_ID);

const bot = new TelegramBot(token, { polling: true });

// ==============================
// Error Handler
// ==============================

bot.on("polling_error", (err) => {
  console.error("Polling error:", err.message);
});

// ==============================
// 💾 Load Exchange Data
// ==============================

let data = {
  kyatBase: 100000,
  kyatToBaht: 780,
  bahtToKyat: 800,
};

if (fs.existsSync("data.json")) {
  data = JSON.parse(fs.readFileSync("data.json"));
} else {
  fs.writeFileSync("data.json", JSON.stringify(data, null, 2));
}

let { kyatBase, kyatToBaht, bahtToKyat } = data;

function saveRate() {
  fs.writeFileSync(
    "data.json",
    JSON.stringify({ kyatBase, kyatToBaht, bahtToKyat }, null, 2),
  );
}

// ==============================
// 🔁 State & Message Tracking
// ==============================

let userState = {};

// Track bot message IDs per chat for /clear
// { chatId: [msgId, msgId, ...] }
let botMessages = {};

function trackBotMsg(chatId, msgId) {
  if (!botMessages[chatId]) botMessages[chatId] = [];
  botMessages[chatId].push(msgId);
}

async function sendTracked(chatId, text, options = {}) {
  const sent = await bot.sendMessage(chatId, text, options);
  trackBotMsg(chatId, sent.message_id);
  return sent;
}

// ==============================
// 🚀 /start
// ==============================

bot.onText(/\/start/, (msg) => {
  trackBotMsg(msg.chat.id, msg.message_id); // track user cmd too for full clear
  sendTracked(
    msg.chat.id,
    "မင်္ဂလာပါ 👋\n\n" +
      "အသုံးပြုရန်:\n" +
      "/rate    - ငွေလဲနှုန်းကြည့်ရန်\n" +
      "/convert - ငွေပြောင်းရန်\n" +
      "/clear   - chat ရှင်းလင်းရန်",
  );
});

// ==============================
// 📊 /rate
// ==============================

bot.onText(/\/rate/, (msg) => {
  trackBotMsg(msg.chat.id, msg.message_id);
  sendTracked(
    msg.chat.id,
    `📊 လက်ရှိ ငွေလဲနှုန်း\n\n` +
      `💵 ကျပ် ➜ ဘတ်\n` +
      `   ${kyatBase.toLocaleString()} ကျပ် = ${kyatToBaht} ဘတ်\n\n` +
      `💵 ဘတ် ➜ ကျပ်\n` +
      `   ${bahtToKyat} ဘတ် = ${kyatBase.toLocaleString()} ကျပ်`,
  );
});

// ==============================
// 🗑️ /clear
// ==============================

bot.onText(/\/clear/, async (msg) => {
  const chatId = msg.chat.id;

  // Also delete the /clear command message itself
  const allIds = [...(botMessages[chatId] || []), msg.message_id];
  botMessages[chatId] = [];

  for (const id of allIds) {
    try {
      await bot.deleteMessage(chatId, id);
    } catch (_) {
      // Message may be too old (>48h) or already deleted — skip silently
    }
  }

  const sent = await bot.sendMessage(chatId, "🗑️ Chat ရှင်းလင်းပြီးပါပြီ။");
  trackBotMsg(chatId, sent.message_id);
});

// ==============================
// 💱 /convert (Button Version)
// ==============================

bot.onText(/\/convert$/, (msg) => {
  const chatId = msg.chat.id;
  trackBotMsg(chatId, msg.message_id);

  sendTracked(chatId, "💱 ဘယ်အမျိုးအစား ပြောင်းမလဲ?", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "ကျပ် ➜ ဘတ်", callback_data: "k2b" }],
        [{ text: "ဘတ် ➜ ကျပ်", callback_data: "b2k" }],
      ],
    },
  });
});

// ==============================
// 🔘 Button Click Handler
// ==============================

bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;

  if (query.data === "k2b") {
    userState[userId] = { type: "k2b" };
    sendTracked(chatId, "💰 ကျပ် ပမာဏ ရိုက်ထည့်ပါ။");
  } else if (query.data === "b2k") {
    userState[userId] = { type: "b2k" };
    sendTracked(chatId, "💰 ဘတ် ပမာဏ ရိုက်ထည့်ပါ။");
  }

  bot.answerCallbackQuery(query.id);
});

// ==============================
// 💰 Handle Amount Input
// ==============================

bot.on("message", (msg) => {
  if (!msg.text) return;

  // Skip commands — handled by their own onText handlers
  if (msg.text.startsWith("/")) return;

  const userId = msg.from.id;
  const chatId = msg.chat.id;

  // Track the user's message for /clear
  trackBotMsg(chatId, msg.message_id);

  if (!userState[userId]) return;

  const amount = parseFloat(msg.text.replace(/,/g, ""));

  if (isNaN(amount) || amount <= 0) {
    sendTracked(chatId, "⚠️ ဂဏန်းမှန်ကန်စွာ ရိုက်ထည့်ပါ။");
    return;
  }

  if (userState[userId].type === "k2b") {
    const result = (amount / kyatBase) * kyatToBaht;
    sendTracked(
      chatId,
      `💱 ${amount.toLocaleString()} ကျပ် = ${result.toFixed(2)} ဘတ် ဖြစ်ပါသည်။`,
    );
  } else if (userState[userId].type === "b2k") {
    const result = (amount / bahtToKyat) * kyatBase;
    sendTracked(
      chatId,
      `💱 ${amount.toLocaleString()} ဘတ် = ${result.toLocaleString()} ကျပ် ဖြစ်ပါသည်။`,
    );
  }

  delete userState[userId];
});

// ==============================
// 👑 /setrate (Admin Only)
// ==============================

bot.onText(/\/setrate (\d+)\s+(\d+)/, (msg, match) => {
  if (msg.from.id !== ADMIN_ID) {
    sendTracked(msg.chat.id, "⛔ သင့်မှာ ခွင့်မရှိပါ။");
    return;
  }

  const newKyatToBaht = parseFloat(match[1]);
  const newBahtToKyat = parseFloat(match[2]);

  if (newKyatToBaht <= 0 || newBahtToKyat <= 0) {
    sendTracked(msg.chat.id, "⚠️ ဥပမာ - /setrate 780 800");
    return;
  }

  kyatToBaht = newKyatToBaht;
  bahtToKyat = newBahtToKyat;

  saveRate();

  sendTracked(
    msg.chat.id,
    `✅ ငွေလဲနှုန်း အသစ်ပြောင်းပြီးပါပြီ။\n\n` +
      `💵 ${kyatBase.toLocaleString()} ကျပ် ➜ ${kyatToBaht} ဘတ်\n` +
      `💵 ${bahtToKyat} ဘတ် ➜ ${kyatBase.toLocaleString()} ကျပ်`,
  );
});
