// Генератор паролей на crypto API (cryptographically secure)
import crypto from 'node:crypto';

const SETS = {
  upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',          // без I O (при excludeAmbiguous)
  upperFull: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower: 'abcdefghijkmnpqrstuvwxyz',          // без l o
  lowerFull: 'abcdefghijklmnopqrstuvwxyz',
  digits: '23456789',                          // без 0 1
  digitsFull: '0123456789',
  symbols: '!@#$%^&*()_+-=[]{};:,.<>?/~',
};

const VOWELS = 'aeiou';
const CONSONANTS = 'bcdfghjkmnpqrstvz';

function randInt(max) {
  return crypto.randomIntRange ? crypto.randomIntRange(max) : crypto.randomInt(0, max);
}

function pick(str) {
  return str[randInt(str.length)];
}

/**
 * @param {object} opts
 * @param {number} opts.length
 * @param {boolean} opts.upper
 * @param {boolean} opts.lower
 * @param {boolean} opts.digits
 * @param {boolean} opts.symbols
 * @param {boolean} opts.excludeAmbiguous - убрать похожие символы (il1Lo0O)
 * @param {boolean} opts.pronounceable - произносимый режим (CV-паттерн)
 */
export function generatePassword(opts) {
  const {
    length = 16,
    upper = true,
    lower = true,
    digits = true,
    symbols = true,
    excludeAmbiguous = false,
    pronounceable = false,
  } = opts || {};

  const len = Math.min(Math.max ? Math.max(Number(length) || 16, 4) : 16, 128);

  if (pronounceable) return pronounceablePassword(len);

  const active = [];
  if (upper) active.push(excludeAmbiguous ? SETS.upper : SETS.upperFull);
  if (lower) active.push(excludeAmbiguous ? SETS.lower : SETS.lowerFull);
  if (digits) active.push(excludeAmbiguous ? SETS.digits : SETS.digitsFull);
  if (symbols) active.push(SETS.symbols);

  if (active.length === 0) active.push(SETS.lowerFull);

  const pool = active.join('');

  // Гарантируем минимум один символ из каждого выбранного набора
  const chars = active.map(pick);
  while (chars.length < len) chars.push(pick(pool));
  // Перемешиваем (Fisher–Yates на crypto)
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.slice(0, len).join('');
}

function pronounceablePassword(len) {
  const out = [];
  while (out.length < len) {
    const c = pick(CONSONANTS);
    const v = pick(VOWELS);
    out.push(randInt(2) === 0 ? c : c.toUpperCase(), v);
    if (randInt(10) < 3 && out.length < len) out.push(pick('0123456789'));
  }
  return out.slice(0, len).join('');
}

/**
 * Оценка пароля: энтропия (бит) + уровень.
 */
export function strength(password) {
  let poolSize = 0;
  if (/[a-z]/.test(password)) poolSize += 26;
  if (/[A-Z]/.test(password)) poolSize += 26;
  if (/[0-9]/.test(password)) poolSize += 10;
  if (/[^a-zA-Z0-9]/.test(password)) poolSize += 32;

  const bits = Math.round(password.length * Math.log2(poolSize || 1));

  let level, bar;
  if (bits < 40) { level = 'Слабый'; bar = '🟥⬜⬜⬜⬜'; }
  else if (bits < 60) { level = 'Средний'; bar = '🟨🟨⬜⬜⬜'; }
  else if (bits < 80) { level = 'Хороший'; bar = '🟩🟩🟩⬜⬜'; }
  else if (bits < 120) { level = 'Отличный'; bar = '🟩🟩🟩🟩⬜'; }
  else { level = 'Максимальный'; bar = '🟩🟩🟩🟩🟩'; }

  return { bits, level, bar };
}

/* ---------- Email (почтовые адреса) ---------- */
export const EMAIL_DOMAINS = [
  'gmail.com','googlemail.com','mail.ru','yandex.ru','ya.ru','outlook.com',
  'hotmail.com','yahoo.com','icloud.com','proton.me','protonmail.com','bk.ru','inbox.ru','list.ru',
];

const EMAIL_WORDS = [
  'swift','dark','cyber','frost','neon','lunar','solar','storm','raven','wolf',
  'fox','pixel','turbo','quantum','echo','vortex','nova','pulse','drift','orbit',
  'lynx','onyx','zephyr','flux','ember','cobalt','delta','omega','prime','crux',
];

const LOCAL_RANDOM = 'abcdefghijkmnpqrstuvwxyz';

/**
 * Стили local-части: random | pronounceable | wordnum
 * @param {object} opts { style, domain, withNumber, length }
 */
export function generateEmail(opts = {}) {
  const { style = 'random', domain = 'gmail.com', withNumber = true, length = 8 } = opts;
  const n = Math.min(Math.max(Number(length) || 8, 4), 24);

  let local;
  if (style === 'pronounceable') {
    local = pronounceablePassword(n).toLowerCase();
  } else if (style === 'wordnum') {
    local = pick(EMAIL_WORDS) + '.' + pick(EMAIL_WORDS) + String(crypto.randomInt(10, 100));
  } else {
    local = Array.from({ length: n }, () => pick(LOCAL_RANDOM)).join('');
  }

  if (withNumber && !new RegExp('[0-9]').test(local)) local += String(crypto.randomInt(10, 1000));
  const dom = EMAIL_DOMAINS.includes(domain) ? domain : EMAIL_DOMAINS[0];
  return local.toLowerCase() + '@' + dom;
}
