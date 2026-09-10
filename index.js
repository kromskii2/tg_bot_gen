import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';
import { generatePassword, strength } from './lib/generator.js';

const TOKEN = process.env.BOT_TOKEN;
const OWNER_ID = Number(process.env.OWNER_ID);

if (!TOKEN) {
  console.error('BOT_TOKEN not set in .env');
  process.exit(1);
}

const bot = new Telegraf(TOKEN, { handlerTimeout: 5_000 });

/* ---------- User settings state (in-memory) ---------- */
const defaults = () => ({
  length: 16,
  upper: true,
  lower: true,
  digits: true,
  symbols: true,
  excludeAmbiguous: false,
  pronounceable: false,
});
const users = new Map();
const history = new Map(); // userId -> [passwords]

const state = (id) => {
  if (!users.has(id)) users.set(id, defaults());
  return users.get(id);
};

const addHistory = (id, pwd) => {
  if (!history.has(id)) history.set(id, []);
  const h = history.get(id);
  h.unshift(pwd);
  if (h.length > 5) h.pop();
};

/* ---------- Keyboard builders ---------- */
const mainMenu = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback('🔑 Сгенерировать пароль', 'gen')],
    [Markup.button.callback('⚙️ Настройки', 'settings')],
    [Markup.button.callback('📋 История', 'history')],
    [Markup.button.callback('ℹ️ О боте', 'about')],
  ]);

const settingsKb = (s) => {
  const on = (v) => (v ? '✅' : '❎');
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('➖ 1', 'len:-1'),
      Markup.button.callback(`📏 Длина: ${s.length}`, 'noop'),
      Markup.button.callback('➕ 1', 'len:+1'),
    ],
    [
      Markup.button.callback('➖ 5', 'len:-5'),
      Markup.button.callback('➕ 5', 'len:+5'),
    ],
    [Markup.button.callback(`${on(s.upper)} Заглавные (A-Z)`, 'set:upper')],
    [Markup.button.callback(`${on(s.lower)} Строчные (a-z)`, 'set:lower')],
    [Markup.button.callback(`${on(s.digits)} Цифры (0-9)`, 'set:digits')],
    [Markup.button.callback(`${on(s.symbols)} Символы (!@#$)`, 'set:symbols')],
    [Markup.button.callback(`${on(s.excludeAmbiguous)} Без похожих (il1Lo0O)`, 'set:excludeAmbiguous')],
    [Markup.button.callback(`${on(s.pronounceable)} Произносимый`, 'set:pronounceable')],
    [Markup.button.callback('🔑 Сгенерировать', 'gen'), Markup.button.callback('⬅️ Назад', 'main')],
  ]);
};

const resultKb = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback('🔁 Ещё раз', 'gen')],
    [Markup.button.callback('⚙️ Настройки', 'settings'), Markup.button.callback('⬅️ Меню', 'main')],
  ]);

const backKb = (cb = 'main') =>
  Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', cb)]]);

const passwordText = (pwd, s) => {
  const st = strength(pwd);
  return [
    '🔑 Ваш пароль:',
    '',
    '`' + pwd + '`',
    '',
    `${st.bar} ${st.level} · ~${st.bits} бит энтропии`,
    `⚙️ Длина ${s.length} · ${modeLabel(s)}`,
    '',
    '🛡 crypto.randomInt, без Math.random.',
  ].join('\n');
};

const modeLabel = (s) => {
  if (s.pronounceable) return 'произносимый';
  const parts = [];
  if (s.upper) parts.push('A-Z');
  if (s.lower) parts.push('a-z');
  if (s.digits) parts.push('0-9');
  if (s.symbols) parts.push('!@#');
  return parts.join(' + ') || 'a-z';
};

/* ---------- Access restriction: OWNER_ID only ---------- */
const ownerOnly = async (ctx, next) => {
  if (!Number.isFinite(OWNER_ID) || ctx.from?.id === OWNER_ID) return next();
  if (ctx.callbackQuery) await ctx.answerCbQuery('Доступ запрещен').catch(() => {});
  return ctx.reply('⛔ Доступ разрешен только владельцу бота.').catch(() => {});
};
bot.use(ownerOnly);

/* ---------- Handlers ---------- */
bot.start((ctx) => {
  state(ctx.from.id);
  return ctx.reply(
    '👋 Привет! Я генератор паролей.\n\n' +
      '🔑 Жми «Сгенерировать» — пароль создаётся криптографически стойким генератором Node.js (crypto.randomInt).\n' +
      '⚙️ В настройках — длина, наборы символов, режимы.',
    mainMenu()
  );
});

bot.action('noop', (ctx) => ctx.answerCbQuery());

bot.action('main', (ctx) =>
  ctx.editMessageText('Выбери действие:', mainMenu()).catch(() => {})
);

bot.action('settings', (ctx) => {
  const s = state(ctx.from.id);
  return ctx.editMessageText('⚙️ Настройки генерации:', settingsKb(s)).catch(() => {});
});

bot.action(/^len:(-?\d+)$/, (ctx) => {
  const delta = Number(ctx.match[1]);
  const s = state(ctx.from.id);
  s.length = Math.min(128, Math.max(4, s.length + delta));
  return ctx
    .editMessageText(`⚙️ Настройки генерации:\nДлина: ${s.length} (4–128)`, settingsKb(s))
    .then(() => ctx.answerCbQuery(`Длина: ${s.length}`))
    .catch(() => {});
});

bot.action(/^set:(\w+)$/, (ctx) => {
  const key = ctx.match[1];
  if (!(key in defaults())) return ctx.answerCbQuery('Неизвестная настройка');
  const s = state(ctx.from.id);
  if (key === 'pronounceable' || key === 'excludeAmbiguous') {
    s[key] = !s[key];
  } else {
    const others = ['upper', 'lower', 'digits', 'symbols'].filter((k) => k !== key);
    if (s[key] && !others.some((k) => s[k])) {
      return ctx.answerCbQuery('Нужен хотя бы один набор символов');
    }
    s[key] = !s[key];
  }
  return ctx.editMessageText('⚙️ Настройки генерации:', settingsKb(s)).catch(() => {});
});

bot.action('gen', async (ctx) => {
  const s = state(ctx.from.id);
  const pwd = generatePassword(s);
  addHistory(ctx.from.id, pwd);
  await ctx.answerCbQuery('Готово').catch(() => {});
  return ctx.replyWithMarkdown(passwordText(pwd, s), resultKb()).catch(() => {});
});

bot.action('history', (ctx) => {
  const h = history.get(ctx.from.id) || [];
  const text = h.length
    ? '📋 Последние 5 паролей:\n\n' + h.map((p, i) => `${i + 1}. \`${p}\``).join('\n')
    : '📋 История пуста — сначала сгенерируй пароль.';
  const kb = Markup.inlineKeyboard([
    [Markup.button.callback('🧹 Очистить', 'clearhist')],
    [Markup.button.callback('⬅️ Назад', 'main')],
  ]);
  return ctx.replyWithMarkdown(text, kb).catch(() => {});
});

bot.action('clearhist', (ctx) => {
  history.delete(ctx.from.id);
  return ctx.editMessageText('🧹 История очищена.', backKb()).catch(() => {});
});

bot.action('about', (ctx) =>
  ctx
    .editMessageText(
      'ℹ️ tg_bot_gen — генератор паролей в Telegram\n\n' +
        '🛡 Node.js crypto (crypto.randomInt), Fisher–Yates перемешивание, гарантия минимум одного символа из каждого набора.\n' +
        '📏 Длина 4–128 символов.\n' +
        '🔤 Наборы: A-Z, a-z, 0-9, символы; опции «без похожих» и «произносимый».\n' +
        '🔒 Пароли не отправляются на серверы и не сохраняются на диске.',
      backKb()
    )
    .catch(() => {})
);

bot.on(['text', 'message'], (ctx) => {
  const t = ctx.message?.text;
  if (t === '/start' || t === '/help' || t === '/menu') return bot.start(ctx);
  return ctx.reply('Используй /start 🙂', mainMenu());
});

bot.catch((err) => console.error('Bot error:', err?.response?.description || err));

/* ---------- Start (long polling) ---------- */
bot
  .launch({ dropPendingUpdates: true })
  .then(() => console.log(`Bot @${bot.botInfo?.username ?? '?'} started (polling)`))
  .catch((e) => {
    console.error('Failed to launch:', e?.response?.description || e.message);
    process.exit(1);
  });

const shutdown = () => {
  bot.stop('shutting down');
  process.exit(0);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
