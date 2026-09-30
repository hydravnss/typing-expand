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

// logique (défaut : caché si texte, restauré si vide même avec le focus)
const S = { ...t.defaultSettings };
assert.equal(S.hideOnFocus, false);
assert.equal(t.computeBaseHide(S, { focused: true, hasText: false }, false), false);
assert.equal(t.computeBaseHide(S, { focused: true, hasText: true }, false), true);
assert.equal(t.computeBaseHide(S, { focused: false, hasText: true }, false), true);
assert.equal(t.computeBaseHide(S, { focused: false, hasText: false }, false), false);
assert.equal(t.computeBaseHide({ ...S, keepWhileText: false }, { focused: false, hasText: true }, false), false);
assert.equal(t.computeBaseHide({ ...S, keepWhileText: false }, { focused: true, hasText: true }, false), true);
assert.equal(t.computeBaseHide({ ...S, onlySmall: true }, { focused: true, hasText: true }, false), false);
assert.equal(t.computeBaseHide({ ...S, onlySmall: true }, { focused: true, hasText: true }, true), true);
assert.equal(t.computeBaseHide({ ...S, enabled: false }, { focused: true, hasText: true }, true), false);
assert.equal(t.computeHide(S, { focused: true, hasText: true, forced: true }, false), false);
// « Cacher dès le focus »
const SF = { ...S, hideOnFocus: true };
assert.equal(t.computeBaseHide(SF, { focused: true, hasText: false }, false), true);
assert.equal(t.computeBaseHide(SF, { focused: true, hasText: false, sentReset: true }, false), false);
assert.equal(t.computeBaseHide(SF, { focused: true, hasText: true, sentReset: false }, false), true);
assert.equal(t.computeBaseHide(SF, { focused: false, hasText: false }, false), false);

// CSS
const css = t.buildCss(S, ['#leftSendForm', '#options_button', '#extensionsMenuButton']);
assert.ok(t.braceBalance(css));
for (const needle of ['#leftSendForm', '.te-hide-left', 'width:0 !important', '#send_textarea', 'flex:1 1 auto !important', 'pointer-events:none !important']) assert.ok(css.includes(needle), needle);

// réglages / fusion
globalThis.__settings['typing-expand'] = { duration: 9999, selectors: 5, enabled: false };
const s = t.getSettings();
assert.equal(s.duration, 500); assert.equal(s.enabled, false); assert.equal(s.keepWhileText, true);
assert.equal(s.hideOnFocus, false); assert.equal(s.selectors, '#leftSendForm\n#options_button\n#extensionsMenuButton'); assert.equal(s.onlySmall, false); assert.equal(s.chevron, true);

// intégration
const DW = dom.window;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const typed = (ta, v, type = 'input') => { ta.value = v; ta.dispatchEvent(new DW.Event(type, { bubbles: true })); };
const setup = (settings) => {
    globalThis.__settings['typing-expand'] = { duration: 0, ...settings };
    document.body.innerHTML = SEND;
    t.resetState();
    document.getElementById('send_form').getBoundingClientRect = () => ({ left: 0, top: 500, width: 400, height: 40 }); // jsdom : rect vide par défaut
    return { form: document.getElementById('send_form'), ta: document.getElementById('send_textarea'), left: document.getElementById('leftSendForm') };
};
const hidden = (form) => form.classList.contains('te-typing');

// 1) défaut : focus sur champ vide => boutons normaux ; 1er caractère => cachés
{
    const { form, ta, left } = setup({});
    ta.focus(); await sleep(50);
    assert.ok(!hidden(form), 'défaut : champ vide + focus => visibles');
    typed(ta, 's');
    assert.ok(hidden(form), 'texte tapé => cachés');
    assert.ok(left.classList.contains('te-hide-left'));
    assert.ok(!document.getElementById('rightSendForm').classList.contains('te-hide-left'));
    typed(ta, 'salut');
    assert.ok(hidden(form));

    // 2) effacement par l'utilisateur (input), champ toujours focus => restauré immédiatement
    typed(ta, '');
    assert.equal(document.activeElement, ta, 'toujours focus');
    assert.ok(!hidden(form), 'effacé par input => restauré alors que focus');
    // idem keyup seul / cut / change (iOS)
    typed(ta, 'abc'); assert.ok(hidden(form));
    typed(ta, '', 'keyup'); assert.ok(!hidden(form), 'keyup => restauré');
    typed(ta, 'abc'); assert.ok(hidden(form));
    typed(ta, '', 'change'); assert.ok(!hidden(form), 'change => restauré');
    typed(ta, 'abc', 'compositionend'); assert.ok(hidden(form), 'compositionend => caché');
    ta.value = ''; ta.dispatchEvent(new DW.Event('cut', { bubbles: true }));
    await sleep(20);
    assert.ok(!hidden(form), 'cut => restauré');
    // espaces seuls = vide
    typed(ta, '   '); assert.ok(!hidden(form), 'espaces seuls = vide');

    // 3) effacement programmatique (value = '' sans événement) => poll
    typed(ta, 'bonjour'); assert.ok(hidden(form));
    ta.value = '';
    await sleep(400);
    assert.ok(!hidden(form), 'value="" sans événement => restauré par le poll');
    // et remplissage programmatique => caché par le poll
    ta.value = 'auto';
    await sleep(400);
    assert.ok(hidden(form), 'value programmatique => caché par le poll');
    ta.value = ''; await sleep(400);
    assert.ok(!hidden(form));

    // 4) blur avec texte : reste caché (keepWhileText) ; restauré quand vidé sans focus
    typed(ta, 'texte'); ta.blur(); await sleep(200);
    assert.ok(hidden(form), 'blur avec texte => reste caché');
    typed(ta, ''); await sleep(20);
    assert.ok(!hidden(form), 'vidé sans focus => restauré');
    ta.focus(); await sleep(50); assert.ok(!hidden(form));

    // chevron : bascule boutons visibles / cachés tant que texte
    typed(ta, 'hey'); assert.ok(hidden(form));
    const chev = document.getElementById('te_chevron');
    assert.ok(chev && chev.classList.contains('te-show'), 'chevron visible');
    chev.dispatchEvent(new DW.MouseEvent('click', { bubbles: true, cancelable: true }));
    assert.ok(!hidden(form), 'chevron => boutons ré-affichés');
    chev.dispatchEvent(new DW.MouseEvent('click', { bubbles: true, cancelable: true }));
    assert.ok(hidden(form), 'chevron => re-cachés');
    typed(ta, ''); assert.ok(!hidden(form));
    assert.ok(!chev.classList.contains('te-show'), 'chevron masqué quand vide');

    // 5) envoi (MESSAGE_SENT-like) : champ vidé sans événement puis scheduleAfterSend
    typed(ta, 'envoyer');
    assert.ok(hidden(form));
    ta.value = '';
    t.scheduleAfterSend();
    await sleep(100);
    assert.ok(!hidden(form), 'après envoi => restauré');
    typed(ta, 'suite'); assert.ok(hidden(form), 'nouvelle saisie => caché');
}

// 6) keepWhileText = false : blur avec texte => restauré
{
    const { form, ta } = setup({ keepWhileText: false });
    ta.focus(); await sleep(50);
    typed(ta, 'x'); assert.ok(hidden(form));
    ta.blur(); await sleep(200);
    assert.ok(!hidden(form), 'keepWhileText off : blur => visibles');
}

// 7) « Cacher dès le focus » ON
{
    const { form, ta } = setup({ hideOnFocus: true });
    ta.blur(); await sleep(150);
    ta.focus(); await sleep(50);
    assert.ok(hidden(form), 'hideOnFocus : caché dès le focus');
    typed(ta, 'abc'); assert.ok(hidden(form));
    typed(ta, '');
    assert.equal(document.activeElement, ta);
    assert.ok(!hidden(form), 'hideOnFocus : texte effacé => restauré (focus conservé)');
    await sleep(400);
    assert.ok(!hidden(form), 'pas re-caché par le poll ni autre');
    typed(ta, '', 'keyup'); assert.ok(!hidden(form), 'pas re-caché avant saisie');
    typed(ta, 'z'); assert.ok(hidden(form), 'prochaine saisie => caché');
    // effacement programmatique
    ta.value = ''; await sleep(400);
    assert.ok(!hidden(form), 'hideOnFocus : value="" => restauré par le poll');
    // blur avec texte : reste caché
    typed(ta, 'q'); ta.blur(); await sleep(200);
    assert.ok(hidden(form), 'hideOnFocus : blur avec texte => reste caché');
    // envoi
    ta.value = ''; t.scheduleAfterSend(); await sleep(100);
    assert.ok(!hidden(form), 'hideOnFocus : après envoi => restauré');
    // nouveau focus => caché de nouveau
    ta.focus(); await sleep(50);
    assert.ok(hidden(form), 'hideOnFocus : refocus => caché');
}

console.log('typing-expand: tous les tests OK');
process.exit(0);
