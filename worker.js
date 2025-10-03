// scpf-guard.require.js — SCPF Guard + GM Filter + Bridge (v1.3)
// - يعيد تعريف GM_* و GM.* بفلترة لنطاق سرّي scpf:secret:*
// - يفرض وجود @grant في الهيدر ويوقف التنفيذ إن حُذفت
// - ينشر علامات حراسة عالمية + جسر لـ new Function
// - لا يلمس: unsafeWindow, window.onurlchange, window.close, window.focus

(() => {
  'use strict';

  // =========[ 0) إعدادات عامّة ]=========
  const GUARD_VERSION = 'SCPF-Guard/1.3';
  const SECRET_PREFIX = 'scpf:secret:';              // نطاق سري داخلي
  const INDEX_KEY     = SECRET_PREFIX + '__index__'; // فهرس مفاتيح النطاق السري

  // فحص @grant المعلَن نصيًا في رأس السكربت
  const REQUIRED_GRANTS = [
    'unsafeWindow',
    'GM_addElement','GM_addStyle','GM_download','GM_getResourceText','GM_getResourceURL',
    'GM_info','GM_log','GM_notification','GM_openInTab','GM_registerMenuCommand','GM_unregisterMenuCommand',
    'GM_setClipboard','GM_getTab','GM_saveTab','GM_getTabs',
    'GM_setValue','GM_getValue','GM_deleteValue','GM_listValues','GM_setValues','GM_getValues','GM_deleteValues',
    'GM_addValueChangeListener','GM_removeValueChangeListener','GM_xmlhttpRequest',
    'window.onurlchange','window.close','window.focus'
  ];

  // =========[ 1) أدوات ]=========
  const defineRO = (obj, key, val) => {
    try { Object.defineProperty(obj, key, { value: val, configurable: false, enumerable: false, writable: false }); }
    catch(_) { try { obj[key] = val; } catch(__) {} }
  };
  const awaitify = (x) => (x && typeof x.then === 'function') ? x : Promise.resolve(x);
  const isSecret = (k) => String(k||'').startsWith(SECRET_PREFIX);

  // =========[ 2) التقاط النسخ الأصلية داخل الإغلاق ]=========
  const ORIG = Object.freeze({
    GM: (typeof GM !== 'undefined' && GM) ? GM : null,
    set  : (typeof GM_setValue    === 'function') ? GM_setValue    : null,
    get  : (typeof GM_getValue    === 'function') ? GM_getValue    : null,
    del  : (typeof GM_deleteValue === 'function') ? GM_deleteValue : null,
    list : (typeof GM_listValues  === 'function') ? GM_listValues  : null,
    add  : (typeof GM_addValueChangeListener      === 'function') ? GM_addValueChangeListener : null,
    rem  : (typeof GM_removeValueChangeListener   === 'function') ? GM_removeValueChangeListener : null,
    xreq : (typeof (GM && GM.xmlHttpRequest) === 'function') ? GM.xmlHttpRequest
          : (typeof GM_xmlhttpRequest === 'function') ? GM_xmlhttpRequest : null,
    addStyle   : (typeof GM_addStyle   === 'function') ? GM_addStyle   : null,
    addElement : (typeof GM_addElement === 'function') ? GM_addElement : null,
    log        : (typeof GM_log        === 'function') ? GM_log        : null,
    note       : (typeof GM_notification=== 'function') ? GM_notification : null,
    open       : (typeof GM_openInTab  === 'function') ? GM_openInTab  : null,
    dl         : (typeof GM_download   === 'function') ? GM_download   : null,
    setClip    : (typeof GM_setClipboard === 'function') ? GM_setClipboard : null,
    reg        : (typeof GM_registerMenuCommand   === 'function') ? GM_registerMenuCommand   : null,
    unreg      : (typeof GM_unregisterMenuCommand === 'function') ? GM_unregisterMenuCommand : null,
    getResText : (typeof GM_getResourceText === 'function') ? GM_getResourceText : null,
    getResURL  : (typeof GM_getResourceURL  === 'function') ? GM_getResourceURL  : null,
    getTab     : (typeof GM_getTab === 'function') ? GM_getTab : null,
    saveTab    : (typeof GM_saveTab=== 'function') ? GM_saveTab: null,
    info       : (typeof GM_info !== 'undefined') ? GM_info : {},
  });

  // =========[ 3) إنفاذ المنح (@grant) + تحقق من توفر اللب الأساسي ]=========
  (function enforceGrants() {
    // 3.1: تأكد أن @grant معلنة نصيًا
    try {
      const declared = new Set((ORIG.info && ORIG.info.script && Array.isArray(ORIG.info.script.grant))
        ? ORIG.info.script.grant : []);
      const missingDecl = REQUIRED_GRANTS.filter(g => !declared.has(g));
      if (missingDecl.length) {
        const msg = `[SCPF Guard] [STOP] ينقص @grant للهيدر: ${missingDecl.join(', ')}.`;
        console.error(msg); try { alert(msg); } catch(_) {}
        throw new Error(msg);
      }
    } catch {
      const msg = '[SCPF Guard] [STOP] GM_info.script.grant غير متاح — لا يمكن التحقق من المنح.';
      console.error(msg); try { alert(msg); } catch(_) {}
      throw new Error(msg);
    }

    // 3.2: استخدم النسخ الأصلية في ORIG للفحص (بدل globalThis)
    const missingCore = [];
    if (!ORIG.set)  missingCore.push('GM_setValue');
    if (!ORIG.get)  missingCore.push('GM_getValue');
    if (!ORIG.del)  missingCore.push('GM_deleteValue');
    if (!ORIG.list) missingCore.push('GM_listValues');
    if (!ORIG.xreq) missingCore.push('GM_xmlhttpRequest');

    if (missingCore.length) {
      const msg = `[SCPF Guard] [STOP] دوال GM الأساسية غير متاحة (تأكد من @grant وعدم استخدام @grant none): ${missingCore.join(', ')}`;
      console.error(msg); try { alert(msg); } catch(_) {}
      throw new Error(msg);
    }
  })();

  // =========[ 4) فهرس النطاق السرّي + أدوات تخزين داخليّة ]=========
  function idxGet() {
    let arr = ORIG.get(INDEX_KEY, []);
    if (!Array.isArray(arr)) arr = [];
    return arr;
  }
  function idxAdd(rawKey) {
    const arr = idxGet();
    if (!arr.includes(rawKey)) { arr.push(rawKey); ORIG.set(INDEX_KEY, arr); }
  }
  function idxDel(rawKey) {
    const arr = idxGet();
    const i = arr.indexOf(rawKey);
    if (i >= 0) { arr.splice(i,1); ORIG.set(INDEX_KEY, arr); }
  }

  // =========[ 5) دوال GM مفلترة ]=========
  function GM_setValue_f(key, value) {
    if (isSecret(key)) throw new Error('[SCPF Guard] write to secret namespace is forbidden');
    return ORIG.set(key, value);
  }
  function GM_getValue_f(key, def) {
    if (isSecret(key)) return def;
    return ORIG.get(key, def);
  }
  function GM_deleteValue_f(key) {
    if (isSecret(key)) return;
    return ORIG.del(key);
  }
  function GM_listValues_f() {
    const ks = ORIG.list();
    return (ks || []).filter(k => !isSecret(k));
  }

  // مستمعو التغيّر — إخفاء مفاتيح السر
  const listenerMap = new Map();
  function GM_addValueChangeListener_f(key, cb) {
    if (!ORIG.add) throw new Error('GM_addValueChangeListener not available');
    if (isSecret(key)) {
      const id = Math.random().toString(36).slice(2);
      listenerMap.set(id, null);
      return id;
    }
    const wrapped = (name, oldValue, newValue, remote) => {
      try { if (!isSecret(name)) cb(name, oldValue, newValue, remote); } catch(_) {}
    };
    const id = ORIG.add(key, wrapped);
    listenerMap.set(id, wrapped);
    return id;
  }
  function GM_removeValueChangeListener_f(id) {
    if (!ORIG.rem) return;
    const wrapped = listenerMap.get(id);
    listenerMap.delete(id);
    if (wrapped) ORIG.rem(id);
  }

  // =========[ 6) بوليفلز: setValues/getValues/deleteValues ]=========
  async function GM_setValues_f(objOrEntries) {
    if (!objOrEntries) return;
    const entries = Array.isArray(objOrEntries) ? objOrEntries : Object.entries(objOrEntries);
    for (const [k, v] of entries) {
      if (isSecret(k)) throw new Error('[SCPF Guard] write to secret namespace is forbidden');
      await awaitify(ORIG.set(k, v));
    }
  }
  async function GM_getValues_f(keysOrDefaults) {
    const out = {};
    if (Array.isArray(keysOrDefaults)) {
      for (const k of keysOrDefaults) {
        out[k] = isSecret(k) ? undefined : await awaitify(ORIG.get(k));
      }
    } else if (keysOrDefaults && typeof keysOrDefaults === 'object') {
      for (const [k, def] of Object.entries(keysOrDefaults)) {
        out[k] = isSecret(k) ? def : await awaitify(ORIG.get(k, def));
      }
    }
    return out;
  }
  async function GM_deleteValues_f(keys) {
    for (const k of (keys || [])) {
      if (!isSecret(k)) await awaitify(ORIG.del(k));
    }
  }

  // =========[ 7) نشر النسخ المفلترة عالميًا + GM.* ]=========
  try {
    /* eslint-disable no-global-assign */
    GM_setValue    = GM_setValue_f;
    GM_getValue    = GM_getValue_f;
    GM_deleteValue = GM_deleteValue_f;
    GM_listValues  = GM_listValues_f;
    GM_setValues   = GM_setValues_f;
    GM_getValues   = GM_getValues_f;
    GM_deleteValues= GM_deleteValues_f;
    if (ORIG.add) GM_addValueChangeListener = GM_addValueChangeListener_f;
    if (ORIG.rem) GM_removeValueChangeListener = GM_removeValueChangeListener_f;
    /* eslint-enable no-global-assign */
  } catch(_) {
    const defs = {
      GM_setValue   : { value: GM_setValue_f, configurable: true },
      GM_getValue   : { value: GM_getValue_f, configurable: true },
      GM_deleteValue: { value: GM_deleteValue_f, configurable: true },
      GM_listValues : { value: GM_listValues_f, configurable: true },
      GM_setValues  : { value: GM_setValues_f, configurable: true },
      GM_getValues  : { value: GM_getValues_f, configurable: true },
      GM_deleteValues: { value: GM_deleteValues_f, configurable: true }
    };
    if (ORIG.add) defs.GM_addValueChangeListener = { value: GM_addValueChangeListener_f, configurable: true };
    if (ORIG.rem) defs.GM_removeValueChangeListener = { value: GM_removeValueChangeListener_f, configurable: true };
    Object.defineProperties(globalThis, defs);
  }

  const pass = (fn) => (...a) => fn && fn.apply(null, a);
  const GM_filtered = (() => {
    const obj = {
      setValue   : GM_setValue_f,
      getValue   : GM_getValue_f,
      deleteValue: GM_deleteValue_f,
      listValues : GM_listValues_f,
      setValues  : GM_setValues_f,
      getValues  : GM_getValues_f,
      deleteValues: GM_deleteValues_f,
      addValueChangeListener    : ORIG.add ? GM_addValueChangeListener_f    : undefined,
      removeValueChangeListener : ORIG.rem ? GM_removeValueChangeListener_f : undefined,
      addStyle       : pass(ORIG.addStyle),
      addElement     : pass(ORIG.addElement),
      log            : pass(ORIG.log),
      notification   : pass(ORIG.note),
      openInTab      : pass(ORIG.open),
      download       : pass(ORIG.dl),
      setClipboard   : pass(ORIG.setClip),
      getResourceText: pass(ORIG.getResText),
      getResourceURL : pass(ORIG.getResURL),
      getTab         : pass(ORIG.getTab),
      saveTab        : pass(ORIG.saveTab),
      xmlHttpRequest : ORIG.xreq ? (...a)=>ORIG.xreq.apply(null, a) : undefined,
      info           : ORIG.info || {}
    };
    return Object.freeze(obj);
  })();

  try { Object.defineProperty(globalThis, 'GM', { value: GM_filtered, configurable: true }); } catch(_) {}

  // =========[ 8) إخفاء واجهات GM عن الصفحة (unsafeWindow) ]=========
  (function hardenPageAgainstGMLeak() {
    try {
      const w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
      const names = [
        'GM','GM_info','GM_getValue','GM_setValue','GM_listValues','GM_deleteValue',
        'GM_addValueChangeListener','GM_removeValueChangeListener','GM_xmlhttpRequest',
        'GM_download','GM_openInTab','GM_notification','GM_addStyle','GM_addElement',
        'GM_setClipboard','GM_getResourceText','GM_getResourceURL','GM_getTab','GM_saveTab',
        'GM_registerMenuCommand','GM_unregisterMenuCommand','GM_setValues','GM_getValues','GM_deleteValues'
      ];
      for (const n of names) {
        if (Object.prototype.hasOwnProperty.call(w, n)) continue;
        Object.defineProperty(w, n, { configurable: false, enumerable: false,
          get(){ return undefined; }, set(){} });
      }
    } catch(_) {}
  })();

  // =========[ 9) Vault داخلي (اختياري) ]=========
  const Vault = Object.freeze({
    set(key, value) { const raw = SECRET_PREFIX + key; ORIG.set(raw, { v: value, t: Date.now() }); idxAdd(raw); },
    get(key, def=null) { const p = ORIG.get(SECRET_PREFIX + key, null); return p && 'v' in p ? p.v : def; },
    del(key) { const raw = SECRET_PREFIX + key; ORIG.del(raw); idxDel(raw); },
    list() { return (ORIG.list() || []).filter(k => k.startsWith(SECRET_PREFIX)); }
  });

  // =========[ 10) جسر لـ new Function ]=========
  function SCPF_runNF(codeString) {
    const fn = new Function('GM','GM_info','unsafeWindow', `"use strict"; return (async()=>{ ${codeString} })();`);
    const w  = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
    return fn(GM_filtered, ORIG.info || {}, w);
  }

  // =========[ 11) علامات الحراسة + assert سلوكي ]=========
  const TOKEN = Math.random().toString(36).slice(2) + Date.now().toString(36);

  const GuardAPI = {
    version: GUARD_VERSION,
    token: TOKEN,
    bridge: Object.freeze({ GM: GM_filtered, GM_info: ORIG.info || {}, unsafeWindow: (typeof unsafeWindow!=='undefined')?unsafeWindow:window }),
    vault: Vault,
    runNF: SCPF_runNF,
// بدّل جسم assert بالكامل بهذا
assert(mode = 'soft') {
  try {
    // (أ) اختبار سلوكي: المفتاح السري لا يظهر ولا يُقرأ عبر النسخ المفلترة
    const probe = SECRET_PREFIX + '__probe__' + Math.random().toString(36).slice(2);
    ORIG.set(probe, { v: 'ok', t: Date.now() });
    const listed = GM_listValues_f();
    const hidden = Array.isArray(listed) && !listed.includes(probe);
    const def = Symbol('def');
    const masked = GM_getValue_f(probe, def) === def;
    ORIG.del(probe); idxDel(probe);

    // (ب) نجاح بأيّ من مسارين:
    //  1) إمّا استطعنا تعيين GM العالمي إلى النسخة المفلترة
    const gmVisible =
      typeof GM === 'object' && GM &&
      GM.setValue === GM_setValue_f &&
      GM.listValues === GM_listValues_f;

    //  2) أو (إذا كان GM العالمي غير قابل للتغيير) على الأقل الجسر يعمل
    const gmBridgeOK =
      !!this.bridge && this.bridge.GM &&
      this.bridge.GM.setValue === GM_setValue_f &&
      this.bridge.GM.listValues === GM_listValues_f;

    // (ج) شرط النجاح النهائي
    const ok = hidden && masked && (gmVisible || gmBridgeOK);

    if (ok) {
      try { defineRO(globalThis, '__SCPF_GUARD_ASSERT_OK__', true); } catch (_){}
      try { if (typeof unsafeWindow !== 'undefined') defineRO(unsafeWindow, '__SCPF_GUARD_ASSERT_OK__', true); } catch (_){}
    }
    return ok;
  } catch {
    return false;
  }
}
  };

  defineRO(globalThis,    '__SCPF_GUARD_ACTIVE__', true);
  defineRO(globalThis,    '__SCPF_GUARD_VERSION__', GUARD_VERSION);
  defineRO(globalThis,    '__SCPF_GUARD_TOKEN__', TOKEN);
  defineRO(globalThis,    '__SCPF_GUARD__', Object.freeze(GuardAPI));

  try {
    const w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : null;
    if (w) {
      defineRO(w, '__SCPF_GUARD_ACTIVE__', true);
      defineRO(w, '__SCPF_GUARD_VERSION__', GUARD_VERSION);
      defineRO(w, '__SCPF_GUARD_TOKEN__', TOKEN);
      defineRO(w, '__SCPF_GUARD__', Object.freeze(GuardAPI));
    }
  } catch(_) {}

  // نفّذ التحقق السلوكي مرة لضبط العلم العالمي فورًا
  try { GuardAPI.assert('soft'); } catch {}

  // لوق بسيط (احذفه في الإنتاج)
  try {
    console.log('%c[SCPF Guard]', 'color:#09f',
      'ready:', (globalThis.__SCPF_GUARD_ASSERT_OK__ === true),
      'version:', GUARD_VERSION);
  } catch(_) {}

})();
