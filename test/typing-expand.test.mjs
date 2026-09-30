// Test Node avec jsdom : node test/typing-expand.test.mjs   (npm install jsdom au préalable)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'te-test-'));
const extDir = path.join(root, 'scripts/extensions/third-party/typing-expand');
fs.mkdirSync(extDir, { recursive: true });
fs.copyFileSync(path.join(here, '../index.js'), path.join(extDir, 'index.js'));
fs.writeFileSync(path.join(root, 'script.js'), 'export const eventSource = { on: () => {} };\nexport const event_types = {};\nexport const saveSettingsDebounced = () => {};\n');
fs.writeFileSync(path.join(root, 'scripts/extensions.js'), 'export const extension_settings = globalThis.__settings;\n');
globalThis.__settings = {};

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.addEventListener = () => {};
const { __test: t } = await import(pathToFileURL(path.join(extDir, 'index.js')).href);

const SEND = `<div id="send_form"><div id="nonQRFormItems">
  <div id="leftSendForm"><div id="options_button"></div><div id="extensionsMenuButton"></div><div id="attachFile"></div></div>
  <textarea id="send_textarea"></textarea>
  <div id="rightSendForm"><div id="mes_continue"></div><div id="send_but"></div></div></div></div>`;
const AVATAR = `<div id="send_form"><img id="persona_avatar" class="avatar"><div id="nonQRFormItems">
  <div id="leftSendForm"><div id="options_button"></div></div><div id="pencil"></div>
  <textarea id="send_textarea"></textarea>
  <div id="rightSendForm"><div id="send_but"></div></div></div></div>`;
const QR = `<div id="send_form"><div id="qr--bar"></div>` + SEND.replace('<div id="send_form">', '');

const ids = (els) => els.map(e => e.id).sort();
function run(html, exclude) {
    document.body.innerHTML = html;
    const f = document.getElementById('send_form');
    const ta = document.getElementById('send_textarea');
    return ids(t.markLeftSiblings(ta, f, exclude));
}

// détection auto
assert.deepEqual(run(SEND), ['leftSendForm']);
assert.ok(!document.getElementById('rightSendForm').classList.contains('te-hide-left'));
assert.ok(!document.getElementById('send_but').classList.contains('te-hide-left'));
assert.ok(!document.getElementById('mes_continue').classList.contains('te-hide-left'));
assert.ok(!document.getElementById('send_textarea').classList.contains('te-hide-left'));

assert.deepEqual(run(AVATAR), ['leftSendForm', 'pencil', 'persona_avatar']);
assert.ok(!document.getElementById('rightSendForm').classList.contains('te-hide-left'));
assert.ok(!document.getElementById('nonQRFormItems').classList.contains('te-hide-left'));

// avatar au niveau supérieur (frère de nonQRFormItems)
document.body.innerHTML = AVATAR;
{
    const f = document.getElementById('send_form'); const ta = document.getElementById('send_textarea');
    const m = t.markLeftSiblings(ta, f, '');
    assert.ok(m.some(e => e.id === 'persona_avatar'), 'avatar frère du conteneur marqué');
    t.clearMarks(document);
    assert.equal(document.querySelectorAll('.te-hide-left').length, 0);
}
// exclusion
assert.deepEqual(run(QR, '#qr--bar'), ['leftSendForm']);
assert.ok(run(QR, '').includes('qr--bar'));
// textarea hors du formulaire / invalide
assert.deepEqual(t.markLeftSiblings(null, null, ''), []);
document.body.innerHTML = '<div id="x"></div>' + SEND;
assert.deepEqual(t.markLeftSiblings(document.getElementById('send_textarea'), document.getElementById('x'), ''), []);

// sélecteurs
const valid = (s) => { document.createDocumentFragment().querySelector(s); return true; };
assert.deepEqual(t.sanitizeSelectors('#a\n\n  .b \n#a\n// c\n}bad{\n:::nope\n@import x', valid), ['#a', '.b']);
assert.deepEqual(t.sanitizeSelectors(42, valid), []);
assert.deepEqual(t.splitTopLevel('a, b:not(.c, .d), [x="1,2"]'), ['a', 'b:not(.c, .d)', '[x="1,2"]']);

// logique
const S = { ...t.defaultSettings };
assert.equal(t.computeBaseHide(S, { focused: true, hasText: false }, false), true);
assert.equal(t.computeBaseHide(S, { focused: false, hasText: true }, false), true);
assert.equal(t.computeBaseHide(S, { focused: false, hasText: false }, false), false);
assert.equal(t.computeBaseHide({ ...S, keepWhileText: false }, { focused: false, hasText: true }, false), false);
assert.equal(t.computeBaseHide(S, { focused: true, hasText: false, sentReset: true }, false), false);
assert.equal(t.computeBaseHide({ ...S, onlySmall: true }, { focused: true }, false), false);
assert.equal(t.computeBaseHide({ ...S, onlySmall: true }, { focused: true }, true), true);
assert.equal(t.computeBaseHide({ ...S, enabled: false }, { focused: true }, true), false);
assert.equal(t.computeHide(S, { focused: true, forced: true }, false), false);

// CSS
const css = t.buildCss(S, ['#leftSendForm', '#options_button', '#extensionsMenuButton']);
assert.ok(t.braceBalance(css));
for (const needle of ['#leftSendForm', '.te-hide-left', 'width:0 !important', '#send_textarea', 'flex:1 1 auto !important', 'pointer-events:none !important']) assert.ok(css.includes(needle), needle);

// réglages / fusion
globalThis.__settings['typing-expand'] = { duration: 9999, selectors: 5, enabled: false };
const s = t.getSettings();
assert.equal(s.duration, 500); assert.equal(s.enabled, false); assert.equal(s.keepWhileText, true);
assert.equal(s.selectors, '#leftSendForm\n#options_button\n#extensionsMenuButton'); assert.equal(s.onlySmall, false); assert.equal(s.chevron, true);

// intégration : focus -> te-typing, blur + vide -> restauré
globalThis.__settings['typing-expand'] = { duration: 0 };
document.body.innerHTML = SEND;
const form = document.getElementById('send_form');
const ta = document.getElementById('send_textarea');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
ta.focus();
await sleep(50);
assert.ok(form.classList.contains('te-typing'), 'caché au focus');
assert.ok(document.getElementById('leftSendForm').classList.contains('te-hide-left'));
assert.ok(!document.getElementById('rightSendForm').classList.contains('te-hide-left'));
ta.value = 'salut'; ta.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
ta.blur();
await sleep(200);
assert.ok(form.classList.contains('te-typing'), 'reste caché avec du texte');
ta.value = ''; ta.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
await sleep(50);
assert.ok(!form.classList.contains('te-typing'), 'restauré quand vide et sans focus');

console.log('typing-expand: tous les tests OK');
process.exit(0);
