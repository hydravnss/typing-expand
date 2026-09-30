/**
 * Typing Expand - extension SillyTavern
 * Cache les boutons à gauche de la zone de saisie (#leftSendForm, menu, baguette magique, pièce jointe, avatar...)
 * pendant qu'on écrit, pour que #send_textarea occupe toute la largeur. Les boutons reviennent quand le champ
 * perd le focus ET est vide (ou après l'envoi).
 *
 * Mécanisme : la classe `te-typing` est posée sur #send_form ; les règles CSS (très spécifiques + !important)
 * sont injectées dans <style id="typing-expand-style"> pour l'emporter sur un thème personnalisé.
 * Détection automatique : tous les frères précédents de #send_textarea (à chaque niveau jusqu'à #send_form)
 * reçoivent la classe `te-hide-left`.
 *
 * Vanilla ES module, aucune étape de build.
 * Chemin attendu : /scripts/extensions/third-party/typing-expand/index.js
 */

// Import en namespace : si un export manque dans une version de ST, l'extension ne plante pas au chargement.
import * as stScript from '../../../../script.js';
import * as stExtensions from '../../../extensions.js';

const MODULE_NAME = 'typing-expand';
const LOG = '[Typing Expand]';
const STYLE_ID = 'typing-expand-style';
const CHEVRON_ID = 'te_chevron';
const CLS_TYPING = 'te-typing';
const CLS_LEFT = 'te-hide-left';
const BLUR_DELAY_MS = 80;
const SMALL_SCREEN_QUERY = '(max-width: 1000px)';

const DEFAULT_SELECTORS = '#leftSendForm\n#options_button\n#extensionsMenuButton';
// Ne jamais cacher : barre de Quick Replies, formulaire de fichier...
const DEFAULT_EXCLUDE = '#qr--bar\n#file_form';

const defaultSettings = Object.freeze({
    enabled: true,
    keepWhileText: true, // garder cachés tant qu'il y a du texte (sinon : seulement pendant le focus)
    autoDetect: true, // frères précédents du textarea
    selectors: DEFAULT_SELECTORS,
    exclude: DEFAULT_EXCLUDE,
    duration: 150, // ms, 0-500
    chevron: true, // petite flèche pour ré-afficher les boutons
    onlySmall: false, // seulement <= 1000px
});

// ---------------------------------------------------------------------------
// Fonctions pures (testées sous Node)
// ---------------------------------------------------------------------------

function clampNumber(value, fallback, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
}

/** Découpe une liste de sélecteurs sur les virgules de premier niveau (hors parenthèses / crochets / guillemets). */
function splitTopLevel(sel) {
    const out = [];
    let depth = 0;
    let quote = '';
    let cur = '';
    for (const ch of String(sel)) {
        if (quote) {
            if (ch === quote) quote = '';
        } else if (ch === '"' || ch === '\'') quote = ch;
        else if (ch === '(' || ch === '[') depth++;
        else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
        else if (ch === ',' && depth === 0) {
            if (cur.trim()) out.push(cur.trim());
            cur = '';
            continue;
        }
        cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
}

/**
 * Transforme le texte du réglage (un sélecteur par ligne) en liste de sélecteurs valides.
 * `validate(sel)` doit renvoyer true si le navigateur accepte le sélecteur.
 */
function sanitizeSelectors(text, validate) {
    if (typeof text !== 'string') return [];
    const out = [];
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith('//')) continue;
        if (/[{};@\\]|\/\*/.test(line)) continue; // pas d'injection CSS
        let ok = true;
        try { ok = validate ? !!validate(line) : true; } catch { ok = false; }
        if (ok && !out.includes(line)) out.push(line);
    }
    return out;
}

/**
 * Doit-on cacher les boutons de gauche ?
 * state : { focused, hasText, sentReset, forced }
 */
function computeBaseHide(s, state, isSmall) {
    if (!s.enabled) return false;
    if (s.onlySmall && !isSmall) return false;
    const focusActive = !!state.focused && !state.sentReset;
    const textActive = !!s.keepWhileText && !!state.hasText;
    return focusActive || textActive;
}

function computeHide(s, state, isSmall) {
    return computeBaseHide(s, state, isSmall) && !state.forced;
}

/** Règles CSS de repli (avec spécificité gonflée par :not(#id) pour battre un thème personnalisé). */
function buildCss(s, selectors) {
    const spec = ':not(#te_s1):not(#te_s2):not(#te_s3)';
    const base = `html body #send_form.${CLS_TYPING}${spec}`;
    const collapse = 'width:0 !important;min-width:0 !important;max-width:0 !important;padding:0 !important;'
        + 'margin:0 !important;border-width:0 !important;overflow:hidden !important;opacity:0 !important;'
        + 'pointer-events:none !important;flex:0 0 0 !important;';
    const targets = [`.${CLS_LEFT}`];
    for (const sel of selectors || []) {
        for (const part of splitTopLevel(sel)) targets.push(part);
    }
    const rules = [];
    rules.push(`${targets.map(t => `${base} ${t}`).join(',\n')} {${collapse}}`);
    rules.push(`${base} #send_textarea {flex:1 1 auto !important;width:100% !important;min-width:0 !important;}`);
    if (s.chevron) rules.push(`${base}.te-chev #send_textarea {padding-left:28px !important;}`);
    return rules.join('\n');
}

function braceBalance(css) {
    let d = 0;
    for (const c of css) {
        if (c === '{') d++;
        else if (c === '}') { d--; if (d < 0) return false; }
    }
    return d === 0;
}

/**
 * Marque (classe te-hide-left) tous les frères précédents de `textarea`, à chaque niveau d'ancêtre
 * jusqu'à `form` (exclu). Renvoie la liste des éléments marqués. `excludeSelector` : ne jamais marquer.
 */
function markLeftSiblings(textarea, form, excludeSelector) {
    if (!textarea || !form || textarea === form || !form.contains(textarea)) return [];
    const marked = [];
    let el = textarea;
    while (el && el !== form) {
        for (let sib = el.previousElementSibling; sib; sib = sib.previousElementSibling) {
            const tag = sib.tagName;
            if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEMPLATE') continue;
            let excluded = false;
            if (excludeSelector) {
                try { excluded = sib.matches(excludeSelector) || !!sib.querySelector(excludeSelector); } catch { excluded = false; }
            }
            if (excluded) continue;
            sib.classList.add(CLS_LEFT);
            marked.push(sib);
        }
        el = el.parentElement;
    }
    return marked;
}

function clearMarks(root) {
    for (const el of (root || document).querySelectorAll(`.${CLS_LEFT}`)) el.classList.remove(CLS_LEFT);
}

// ---------------------------------------------------------------------------
// Réglages
// ---------------------------------------------------------------------------

function getSettings() {
    const store = stExtensions.extension_settings;
    if (!store[MODULE_NAME] || typeof store[MODULE_NAME] !== 'object') store[MODULE_NAME] = {};
    const s = store[MODULE_NAME];
    for (const [key, value] of Object.entries(defaultSettings)) {
        if (s[key] === undefined) s[key] = value; // fusion des valeurs par défaut
    }
    for (const k of ['enabled', 'keepWhileText', 'autoDetect', 'chevron', 'onlySmall']) s[k] = !!s[k];
    if (typeof s.selectors !== 'string') s.selectors = DEFAULT_SELECTORS;
    if (typeof s.exclude !== 'string') s.exclude = DEFAULT_EXCLUDE;
    s.duration = clampNumber(s.duration, defaultSettings.duration, 0, 500);
    return s;
}

function saveSettings() {
    try {
        stScript.saveSettingsDebounced();
    } catch (e) {
        console.warn(LOG, 'saveSettingsDebounced a échoué', e);
    }
}

// ---------------------------------------------------------------------------
// État et logique DOM
// ---------------------------------------------------------------------------

const state = { focused: false, hasText: false, sentReset: false, forced: false };
let blurTimer = null;
let animTimer = null;
let listenersBound = false;

const getForm = () => document.getElementById('send_form');
const getTextarea = () => document.getElementById('send_textarea');
const isSmallScreen = () => {
    try { return !!globalThis.matchMedia && globalThis.matchMedia(SMALL_SCREEN_QUERY).matches; } catch { return false; }
};
const validateSelector = (sel) => {
    try { document.createDocumentFragment().querySelector(sel); return true; } catch { return false; }
};
const hasTextNow = () => {
    const ta = getTextarea();
    return !!ta && String(ta.value || '').length > 0;
};

function getSelectorList() {
    return sanitizeSelectors(getSettings().selectors, validateSelector);
}

function applyStyle() {
    try {
        const s = getSettings();
        let el = document.getElementById(STYLE_ID);
        if (!el) {
            el = document.createElement('style');
            el.id = STYLE_ID;
            document.head.appendChild(el);
        } else if (el !== document.head.lastElementChild) {
            document.head.appendChild(el); // toujours en dernier
        }
        el.textContent = buildCss(s, getSelectorList());
    } catch (e) { console.error(LOG, e); }
}

/** Éléments à animer : ceux qui correspondent aux sélecteurs + marqués, sans ceux dont un ancêtre est déjà dans la liste. */
function collectTargets(form) {
    const set = new Set();
    for (const el of form.querySelectorAll(`.${CLS_LEFT}`)) set.add(el);
    for (const sel of getSelectorList()) {
        try { for (const el of form.querySelectorAll(sel)) set.add(el); } catch { /* ignoré */ }
    }
    const ta = getTextarea();
    const list = [...set].filter(el => el !== ta && !el.contains(ta));
    return list.filter(el => !list.some(o => o !== el && o.contains(el)));
}

const ANIM_PROPS = ['width', 'marginLeft', 'marginRight', 'paddingLeft', 'paddingRight', 'opacity'];
const CSS_NAME = { width: 'width', marginLeft: 'margin-left', marginRight: 'margin-right', paddingLeft: 'padding-left', paddingRight: 'padding-right', opacity: 'opacity' };

function readVals(el) {
    const cs = getComputedStyle(el);
    const v = {};
    for (const p of ANIM_PROPS) v[p] = cs[p];
    return v;
}

function setInline(el, vals) {
    for (const p of ANIM_PROPS) el.style.setProperty(CSS_NAME[p], vals[p], 'important');
}

function clearInline(el) {
    for (const p of ANIM_PROPS) el.style.removeProperty(CSS_NAME[p]);
    for (const p of ['transition', 'overflow', 'min-width', 'max-width', 'flex']) el.style.removeProperty(p);
}

function prepInline(el, withTransition, ms) {
    el.style.setProperty('overflow', 'hidden', 'important');
    el.style.setProperty('min-width', '0', 'important');
    el.style.setProperty('max-width', 'none', 'important');
    el.style.setProperty('flex', '0 0 auto', 'important');
    el.style.setProperty('transition', withTransition
        ? ANIM_PROPS.map(p => `${CSS_NAME[p]} ${ms}ms ease`).join(', ') + ' !important'
        : 'none', 'important');
}

const ZERO = { width: '0px', marginLeft: '0px', marginRight: '0px', paddingLeft: '0px', paddingRight: '0px', opacity: '0' };

/** Applique / retire la classe te-typing, avec animation (largeur -> 0) si possible. */
function setHidden(form, hide, ms) {
    let targets = [];
    let animate = false;
    try { targets = collectTargets(form); animate = ms > 0 && targets.length > 0 && typeof form.getBoundingClientRect === 'function'; } catch { animate = false; }
    clearTimeout(animTimer);

    if (!animate) {
        for (const el of targets) { try { clearInline(el); } catch { /* ignoré */ } }
        form.classList.toggle(CLS_TYPING, hide);
        return;
    }

    try {
        const cur = targets.map(readVals);
        targets.forEach((el, i) => { prepInline(el, false, 0); setInline(el, cur[i]); });
        if (hide) {
            form.classList.add(CLS_TYPING); // l'inline !important garde l'état visuel actuel
            void form.offsetWidth;
            targets.forEach((el) => { prepInline(el, true, ms); setInline(el, ZERO); });
        } else {
            // mesure de l'état naturel, sans classe ni inline
            targets.forEach(clearInline);
            form.classList.remove(CLS_TYPING);
            void form.offsetWidth;
            const nat = targets.map(readVals);
            targets.forEach((el, i) => { prepInline(el, false, 0); setInline(el, cur[i]); });
            void form.offsetWidth;
            targets.forEach((el, i) => { prepInline(el, true, ms); setInline(el, nat[i]); });
        }
        animTimer = setTimeout(() => {
            for (const el of targets) clearInline(el); // l'état final est tenu par la classe (ou par le CSS d'origine)
        }, ms + 40);
    } catch (e) {
        console.warn(LOG, 'animation ignorée', e);
        for (const el of targets) { try { clearInline(el); } catch { /* ignoré */ } }
        form.classList.toggle(CLS_TYPING, hide);
    }
}

function getChevron() {
    let el = document.getElementById(CHEVRON_ID);
    if (el) return el;
    el = document.createElement('button');
    el.id = CHEVRON_ID;
    el.type = 'button';
    el.tabIndex = -1;
    el.setAttribute('aria-label', 'Afficher / cacher les boutons');
    el.textContent = '›';
    // Ne pas voler le focus au champ de saisie (clavier iOS qui reste ouvert)
    el.addEventListener('mousedown', (e) => e.preventDefault());
    el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        state.forced = !state.forced;
        update();
    });
    document.body.appendChild(el);
    return el;
}

function positionChevron() {
    const el = document.getElementById(CHEVRON_ID);
    const form = getForm();
    if (!el || !form) return;
    const r = form.getBoundingClientRect();
    if (!r.width && !r.height) { el.classList.remove('te-show'); return; }
    el.style.left = `${Math.round(r.left + 4)}px`;
    if (state.forced) el.style.top = `${Math.max(0, Math.round(r.top - 32))}px`; // au-dessus de la barre
    else el.style.top = `${Math.round(r.top + r.height / 2 - 14)}px`;
}

function updateChevron(form, baseHide) {
    const s = getSettings();
    const want = s.enabled && s.chevron && baseHide;
    form.classList.toggle('te-chev', want && !state.forced);
    const existing = document.getElementById(CHEVRON_ID);
    if (!want) {
        if (existing) existing.classList.remove('te-show');
        return;
    }
    const el = getChevron();
    el.textContent = state.forced ? '‹' : '›';
    el.classList.add('te-show');
    positionChevron();
}

function update() {
    try {
        const form = getForm();
        const ta = getTextarea();
        if (!form || !ta) return;
        const s = getSettings();
        state.hasText = hasTextNow();
        const small = isSmallScreen();
        const base = computeBaseHide(s, state, small);
        if (!base) state.forced = false;
        const hide = base && !state.forced;

        if (hide && s.autoDetect) {
            clearMarks(form);
            markLeftSiblings(ta, form, getSettings().exclude ? sanitizeSelectors(s.exclude, validateSelector).join(',') : '');
        }
        const isHidden = form.classList.contains(CLS_TYPING);
        if (hide !== isHidden) {
            if (!hide && !s.autoDetect) clearMarks(form);
            setHidden(form, hide, s.duration);
        }
        updateChevron(form, base);
    } catch (e) {
        console.error(LOG, 'update a échoué', e);
    }
}

function disableEffects() {
    const form = getForm();
    clearTimeout(animTimer);
    if (form) {
        form.classList.remove(CLS_TYPING, 'te-chev');
        clearMarks(form);
        for (const el of form.querySelectorAll('[style]')) { try { clearInline(el); } catch { /* ignoré */ } }
    }
    const c = document.getElementById(CHEVRON_ID);
    if (c) c.classList.remove('te-show');
}

function scheduleAfterSend() {
    setTimeout(() => {
        if (!hasTextNow()) {
            state.sentReset = true;
            state.forced = false;
        }
        update();
    }, 60);
}

function bindListeners() {
    if (listenersBound) return;
    listenersBound = true;
    const isTa = (t) => !!t && t.id === 'send_textarea';

    document.addEventListener('focusin', (e) => {
        if (!isTa(e.target)) return;
        clearTimeout(blurTimer);
        state.focused = true;
        state.sentReset = false;
        update();
    });
    document.addEventListener('focusout', (e) => {
        if (!isTa(e.target)) return;
        clearTimeout(blurTimer);
        // Petit délai : un tap sur le bouton d'envoi ne doit pas déclencher un saut de mise en page avant le click.
        blurTimer = setTimeout(() => {
            if (document.activeElement === getTextarea()) return;
            state.focused = false;
            // `forced` (boutons ré-affichés via la flèche) est conservé : toucher un bouton fait perdre le focus au champ
            // et ne doit pas re-cacher les boutons avant le clic. Il est remis à zéro quand il n'y a plus de raison de cacher.
            update();
        }, BLUR_DELAY_MS);
    });
    document.addEventListener('input', (e) => {
        if (!isTa(e.target)) return;
        state.sentReset = false;
        update();
    });
    // Envoi sans événement ST (clic sur le bouton / Entrée) : le champ est vidé sans événement 'input'
    document.addEventListener('click', (e) => {
        if (e.target && e.target.closest && e.target.closest('#send_but')) scheduleAfterSend();
    });
    document.addEventListener('keydown', (e) => {
        if (isTa(e.target) && e.key === 'Enter' && !e.shiftKey) scheduleAfterSend();
    });
    globalThis.addEventListener('resize', () => update());
    if (globalThis.visualViewport) {
        globalThis.visualViewport.addEventListener('resize', () => positionChevron());
        globalThis.visualViewport.addEventListener('scroll', () => positionChevron());
    }
    // Filet de sécurité : le champ peut être vidé/rempli par ST ou une autre extension sans événement
    setInterval(() => {
        const ta = getTextarea();
        if (!ta) return;
        if (hasTextNow() !== state.hasText) update();
    }, 700);
}

// ---------------------------------------------------------------------------
// Panneau de réglages
// ---------------------------------------------------------------------------

function buildSettingsHtml() {
    return `
<div id="typing_expand_settings" class="extension_container">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>Typing Expand</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
      <div class="te-block">
        <label class="checkbox_label"><input type="checkbox" id="te_enabled"><span>Activer Typing Expand</span></label>
        <div class="te-hint">Cache les boutons à gauche de la zone de saisie pendant que vous écrivez.</div>
      </div>
      <div class="te-block">
        <label class="checkbox_label"><input type="checkbox" id="te_keep"><span>Garder cachés tant qu'il y a du texte</span></label>
        <div class="te-hint">Désactivé : les boutons ne sont cachés que pendant le focus (« Seulement pendant le focus »).</div>
      </div>
      <div class="te-block">
        <label class="checkbox_label"><input type="checkbox" id="te_auto"><span>Détecter automatiquement</span></label>
        <div class="te-hint">Cache aussi tout élément placé avant la zone de saisie dans la barre (avatar, boutons personnalisés...).</div>
      </div>
      <div class="te-block">
        <label for="te_selectors">Sélecteurs CSS à cacher (un par ligne)</label>
        <textarea id="te_selectors" class="text_pole textarea_compact" rows="4" spellcheck="false" autocapitalize="off" autocorrect="off"></textarea>
      </div>
      <div class="te-block">
        <label for="te_exclude">Sélecteurs à ne jamais cacher (détection auto)</label>
        <textarea id="te_exclude" class="text_pole textarea_compact" rows="2" spellcheck="false" autocapitalize="off" autocorrect="off"></textarea>
      </div>
      <div class="te-row">
        <label for="te_duration">Durée de la transition</label>
        <input type="range" id="te_duration" min="0" max="500" step="10">
        <span class="te-val" id="te_duration_value"></span>
      </div>
      <div class="te-block">
        <label class="checkbox_label"><input type="checkbox" id="te_chevron"><span>Afficher une petite flèche pour ré-afficher les boutons</span></label>
      </div>
      <div class="te-block">
        <label class="checkbox_label"><input type="checkbox" id="te_small"><span>Seulement sur petit écran (&lt;=1000px)</span></label>
      </div>
      <hr>
      <div class="menu_button" id="te_reset">Réinitialiser les réglages</div>
    </div>
  </div>
</div>`;
}

function syncUi() {
    const $ = globalThis.jQuery;
    const s = getSettings();
    $('#te_enabled').prop('checked', s.enabled);
    $('#te_keep').prop('checked', s.keepWhileText);
    $('#te_auto').prop('checked', s.autoDetect);
    $('#te_selectors').val(s.selectors);
    $('#te_exclude').val(s.exclude);
    $('#te_duration').val(s.duration);
    $('#te_duration_value').text(`${s.duration} ms`);
    $('#te_chevron').prop('checked', s.chevron);
    $('#te_small').prop('checked', s.onlySmall);
}

function bindUi() {
    const $ = globalThis.jQuery;
    const s = getSettings();
    const change = (restyle) => {
        saveSettings();
        if (restyle) applyStyle();
        if (!s.enabled) disableEffects();
        update();
    };
    $('#te_enabled').on('change', function () { s.enabled = !!$(this).prop('checked'); change(true); });
    $('#te_keep').on('change', function () { s.keepWhileText = !!$(this).prop('checked'); change(false); });
    $('#te_auto').on('change', function () {
        s.autoDetect = !!$(this).prop('checked');
        if (!s.autoDetect) { const f = getForm(); if (f) clearMarks(f); }
        change(false);
    });
    $('#te_selectors').on('input change', function () { s.selectors = String($(this).val()); change(true); });
    $('#te_exclude').on('input change', function () { s.exclude = String($(this).val()); change(false); });
    $('#te_duration').on('input change', function () {
        s.duration = clampNumber($(this).val(), defaultSettings.duration, 0, 500);
        $('#te_duration_value').text(`${s.duration} ms`);
        change(false);
    });
    $('#te_chevron').on('change', function () { s.chevron = !!$(this).prop('checked'); change(true); });
    $('#te_small').on('change', function () { s.onlySmall = !!$(this).prop('checked'); change(false); });
    $('#te_reset').on('click', () => {
        try {
            stExtensions.extension_settings[MODULE_NAME] = {};
            getSettings();
            $('#typing_expand_settings').remove();
            mountSettings();
            saveSettings();
            applyStyle();
            disableEffects();
            update();
        } catch (e) { console.error(LOG, e); }
    });
}

function mountSettings() {
    const $ = globalThis.jQuery;
    if (!$ || $('#typing_expand_settings').length) return;
    const host = $('#extensions_settings2').length ? $('#extensions_settings2') : $('#extensions_settings');
    if (!host.length) {
        console.warn(LOG, 'Conteneur des réglages introuvable.');
        return;
    }
    host.append(buildSettingsHtml());
    syncUi();
    bindUi();
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

function resetState() {
    clearTimeout(blurTimer);
    state.forced = false;
    state.sentReset = false;
    state.focused = !!getTextarea() && document.activeElement === getTextarea();
    update();
}

function init() {
    try {
        getSettings(); // fusionne les valeurs par défaut
        applyStyle();
        mountSettings();
        bindListeners();
        resetState();

        const { eventSource, event_types } = stScript;
        if (!eventSource || !event_types) {
            console.warn(LOG, 'eventSource / event_types introuvables : restauration après envoi via clic/Entrée uniquement.');
            return;
        }
        if (event_types.MESSAGE_SENT) eventSource.on(event_types.MESSAGE_SENT, scheduleAfterSend);
        if (event_types.GENERATION_STARTED) eventSource.on(event_types.GENERATION_STARTED, scheduleAfterSend);
        if (event_types.CHAT_CHANGED) eventSource.on(event_types.CHAT_CHANGED, () => { try { resetState(); } catch (e) { console.error(LOG, e); } });
        console.log(LOG, 'chargé');
    } catch (e) {
        console.error(LOG, 'Initialisation échouée (chat non affecté)', e);
    }
}

if (globalThis.jQuery) {
    globalThis.jQuery(() => init());
} else {
    init();
}

// Exposé uniquement pour les tests Node (sans effet dans SillyTavern)
export const __test = { clampNumber, splitTopLevel, sanitizeSelectors, computeBaseHide, computeHide, buildCss, braceBalance, markLeftSiblings, clearMarks, getSettings, defaultSettings };
