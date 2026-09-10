// Смоук-тест генератора: запускается в CI (node tests/smoke.mjs)
import assert from 'node:assert/strict';
import { generatePassword, strength } from '../lib/generator.js';

const cases = [];

// 1. Обычный пароль: все наборы, длина соблюдена
for (let i = 0; i < 50; i++) {
  const p = generatePassword({ length: 16, upper: true, lower: true, digits: true, symbols: true });
  assert.equal(p.length, 16, 'length 16');
  assert.match(p, /[A-Z]/);
  assert.match(p, /[a-z]/);
  assert.match(p, /[0-9]/);
  assert.match(p, /[^a-zA-Z0-9]/);
  cases.push('random16');
}

// 2. Без похожих символов: ni один запрещённый символ
for (let i = 0; i < 50; i++) {
  const p = generatePassword({ length: 24, upper: true, lower: true, digits: true, symbols: true, excludeAmbiguous: true });
  assert.equal(p.length, 24);
  assert.doesNotMatch(p, /[l1oOI0]/, 'no ambiguous chars');
  cases.push('noAmbiguous24');
}

// 3. Произносимый режим
const pr = generatePassword({ length: 12, pronounceable: true });
assert.equal(pr.length, 12);
assert.match(pr, /[aeiou]/, 'has vowels');
cases.push('pronounceable12');

// 4. Границы длины
assert.equal(generatePassword({ length: 1, upper: true }).length, 4, 'min length clamps to 4');
assert.equal(generatePassword({ length: 999 }).length, 128, 'max length clamps to 128');
cases.push('bounds');

// 5. Пустые наборы -> не падает
const p5 = generatePassword({ length: 8 });
assert.equal(p5.length, 8);
cases.push('noSetsFallback');

// 6. Стойкость
const st = strength('aZ1!');
assert.ok(st.bits > 0 && typeof st.level === 'string');
const stStrong = strength(generatePassword({ length: 64 }));
assert.ok(stStrong.bits >= 200, 'long password has high entropy');
cases.push('strength');

// 7. Уникальность (1000 паролей не повторяются)
const set = new Set();
for (let i = 0; i < 1000; i++) set.add(generatePassword({ length: 16 }));
assert.equal(set.size, 1000, 'all unique');
cases.push('uniqueness');

console.log('SMOKE OK — ' + cases.length + ' групп проверок пройдено');
