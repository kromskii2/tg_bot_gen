import 'dotenv/config';
import fs from 'node:fs';
import { Telegraf, Markup } from 'telegraf';
import { generatePassword, strength } from './lib/generator.js';

const boot = (m) =>
  fs.appendFileSync(
    new URL('./bot.log', import.meta.url),
    new Date().toISOString() + ' ' + m + '\n'
  );

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
    [Markup.button.callback('🎰 Пачка из 5', 'gen5')],
    [Markup.button.callback('⚙️ Настройки', 'settings')],
    [Markup.button.callback('📋 История', 'history')],
    [Markup.button.callback('ℹ️ О боте', 'about')],
  ]);

const settingsKb = (s) => {
  const on = (v) => (v ? '✅' : '❎');
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('➖ 5', 'len:-5'),
      Markup.button.callback('➖ 1', 'len:-1'),
      Markup.button.callback(`📏 ${s.length}`, 'noop'),
      Markup.button.callback('➕ 1', 'len:+1'),
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
    [Markup.button.callback('🔁 Ещё раз', 'gen'), Markup.button.callback('🎰 Пачка из 5', 'gen5')],
    [Markup.button.callback('⚙️ Настройки', 'settings'), Markup.button.callback('⬅️ Меню', 'main')],
  ]);

const backKb = (cb = 'main') =>
  Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', cb)]]);

const modeLabel = (s) => {
  if (s.pronounceable) return 'произносимый';
  const parts = [];
  if (s.upper) parts.push('A-Z');
  if (s.lower) parts.push('a-z');
  if (s.digits) parts.push('0-9');
  if (s.symbols) parts.push('!@#');
  return parts.join(' + ') || 'a-z';
};

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
    '🛡 crypto.randomInt — нажми на пароль, чтобы скопировать.',
  ].join('\n');
};

/* ---------- Shared actions ---------- */
const sendPassword = async (ctx, s) => {
  const pwd = generatePassword(s);
  addHistory(ctx.from.id, pwd);
  return ctx.replyWithMarkdown(passwordText(pwd, s), resultKb());
};

const sendGreeting = (ctx) =>
  ctx.reply(
    '👋 Привет! Я генератор паролей.\n\n' +
      '🔑 Жми «Сгенерировать» — пароль создаётся криптографически стойким генератором Node.js (crypto.randomInt).\n' +
      '⚙️ В настройках — длина (4–128), наборы символов, режимы.\n' +
      '💬 Быстрая команда: /gen 24 — пароль длиной 24.',
    mainMenu()
  );

/* ---------- Access restriction: OWNER_ID only ---------- */
const ownerOnly = async (ctx, next) => {
  if (!Number.isFinite(OWNER_ID) || ctx.from?.id === OWNER_ID) return next();
  if (ctx.callbackQuery) await ctx.answerCbQuery('Доступ запрещен').catch(() => {});
  return ctx.reply('⛔ Доступ разрешен только владельцу бота.').catch(() => {});
};
bot.use(async (ctx, next) => {
  const t = ctx.callbackQuery ? "callback " + ctx.callbackQuery.data : "message " + (ctx.message?.text || "");
  boot("UPDATE from " + ctx.from?.id + ": " + t);
  return next();
});
bot.use(ownerOnly);

/* ---------- Handlers ---------- */
bot.start((ctx) => {
  state(ctx.from.id);
  return sendGreeting(ctx);
});

bot.action('noop', (ctx) => ctx.answerCbQuery());

bot.action('main', (ctx) => {
  ctx.answerCbQuery().catch(() => {});
  return ctx.editMessageText('Выбери действие:', mainMenu()).catch(() => {});
});

bot.action('settings', (ctx) => {
  const s = state(ctx.from.id);
  return ctx
    .editMessageText('⚙️ Настройки генерации:', settingsKb(s))
    .then(() => ctx.answerCbQuery())
    .catch(() => {});
});

bot.action(/^len:(-?\d+)$/, (ctx) => {
  const delta = Number(ctx.match[1]);
  const s = state(ctx.from.id);
  s.length = Math.min(128, Math.max(4, s.length + delta));
  return ctx
    .editMessageText('⚙️ Настройки генерации:', settingsKb(s))
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
  return ctx
    .editMessageText('⚙️ Настройки генерации:', settingsKb(s))
    .then(() => ctx.answerCbQuery())
    .catch(() => {});
});

bot.action('gen', async (ctx) => {
  const s = state(ctx.from.id);
  await ctx.answerCbQuery('Готово').catch(() => {});
  return sendPassword(ctx, s).catch(() => {});
});

bot.action('gen5', async (ctx) => {
  const s = state(ctx.from.id);
  const rows = [];
  for (let i = 0; i < 5; i++) {
    const pwd = generatePassword(s);
    addHistory(ctx.from.id, pwd);
    const st = strength(pwd);
    rows.push(`${i + 1}. \`${pwd}\` · ${st.bar}`);
  }
  const text = `🎰 Пачка из 5 (длина ${s.length}, ${modeLabel(s)}):\n\n` + rows.join('\n');
  await ctx.answerCbQuery('Готово').catch(() => {});
  return ctx
    .replyWithMarkdown(text, Markup.inlineKeyboard([
      [Markup.button.callback('🔁 Ещё пачку', 'gen5')],
      [Markup.button.callback('⚙️ Настройки', 'settings'), Markup.button.callback('⬅️ Меню', 'main')],
    ]))
    .catch(() => {});
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
  return ctx
    .replyWithMarkdown(text, kb)
    .then(() => ctx.answerCbQuery())
    .catch(() => {});
});

bot.action('clearhist', (ctx) => {
  history.delete(ctx.from.id);
  return ctx
    .editMessageText('🧹 История очищена.', backKb())
    .then(() => ctx.answerCbQuery())
    .catch(() => {});
});

bot.action('about', (ctx) =>
  ctx
    .editMessageText(
      'ℹ️ tg_bot_gen — генератор паролей в Telegram\n\n' +
        '🛡 Node.js crypto (crypto.randomInt), Fisher–Yates перемешивание, гарантия минимум одного символа из каждого набора.\n' +
        '📏 Длина 4–128 символов.\n' +
        '🔤 Наборы: A-Z, a-z, 0-9, символы; опции «без похожих» и «произносимый».\n' +
        '📊 Оценка стойкости в битах энтропии.\n' +
        '🔒 Пароли не отправляются на серверы и не сохраняются на диске.',
      backKb()
    )
    .then(() => ctx.answerCbQuery())
    .catch(() => {})
);

// Быстрые команды: /help /menu /gen <length>
bot.help((ctx) => sendGreeting(ctx));
bot.command('menu', (ctx) => sendGreeting(ctx));
bot.command('gen', (ctx) => {
  const arg = (ctx.message?.text || '').trim().split(/\s+/)[1];
  const s = state(ctx.from.id);
  if (arg) {
    const n = Number(arg);
    if (!Number.isFinite(n) || n < 4 || n > 128) {
      return ctx.reply('📏 Длина — число от 4 до 128. Пример: /gen 24');
    }
    s.length = Math.round(n);
  }
  return sendPassword(ctx, s).catch(() => {});
});

bot.on('text', (ctx) => ctx.reply('Используй /start 🙂', mainMenu()));

bot.catch((err) => {
  const msg = err?.response?.description || err?.message || String(err);
  boot('HANDLER ERROR: ' + msg);
  console.error('Bot error:', msg);
});

/* ---------- Menu of bot commands ---------- */
const COMMANDS = [
  { command: 'start', description: 'Главное меню' },
  { command: 'gen', description: 'Сгенерировать пароль (/gen 24)' },
  { command: 'help', description: 'Справка' },
];

/* ---------- Start (long polling) ---------- */
boot('booting...');
bot.telegram.getMe().then((me) => boot('getMe ok @' + me.username)).catch((e) => boot('getMe FAIL ' + (e?.response?.description || e.message)));

bot.telegram
  .setMyCommands(COMMANDS)
  .then(() => boot('setMyCommands OK'))
  .catch((e) => boot('setMyCommands FAIL ' + (e?.response?.description || e.message)));

boot('launching...');
bot.launch({ dropPendingUpdates: true }).finally(() => boot('polling stopped'));
console.log('Bot @' + TOKEN.slice(0,4) + ' launched; waiting for updates');

const shutdown = () => {
  boot('stopping');
  try { bot.stop('shutting down'); } catch {}
  process.exit(0);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
process.on('unhandledRejection', (e) => boot('UNHANDLED: ' + (e?.message || e)));
