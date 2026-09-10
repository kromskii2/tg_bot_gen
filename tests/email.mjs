import { generateEmail, EMAIL_DOMAINS } from '../lib/generator.js';
import assert from 'node:assert/strict';


for (const style of ['random', 'pronounceable', 'wordnum']) {
  for (const domain of EMAIL_DOMAINS) {
    for (let i = 0; i < 200; i++) {
      const e = generateEmail({ style, domain, withNumber: i % 2 === 0 });
      assert.match(e, /^[a-z0-9][a-z0-9.]*@[a-z.]+$/, 'format for ' + style + '/' + domain + ' -> ' + e);
      assert.ok(e.endsWith('@' + domain), 'domain kept: ' + e);
      const local = e.split('@')[0];
      assert.ok(local.length >= 5, 'local length ok: ' + e);
      if (i % 2 === 0) assert.match(local, /\d/, 'has number: ' + e);
    }
  }
}
console.log('EMAIL SMOKE OK — ' + EMAIL_DOMAINS.length * 3 * 200 + ' адресов валидны');
