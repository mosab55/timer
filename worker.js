// scpf-guard.require.js — SCPF Guard + GM Filter + Bridge (v1.3)
// - يعيد تعريف GM_* و GM.* بفلترة لنطاق سرّي scpf:secret:*
// - يفرض وجود @grant في الهيدر ويوقف التنفيذ إن حُذفت
// - ينشر علامات حراسة عالمية + جسر لـ new Function
// - لا يلمس: unsafeWindow, window.onurlchange, window.close, window.focus

(() => {
  'use strict';

  // =========[ 0) إعدادات عامّة ]=========
  const GUARD_VERSION = 'SCPF-Guard/1.4';
  const SECRET_PREFIX = 'scpf:secret:';              // نطاق سري داخلي
  const INDEX_KEY     = SECRET_PREFIX + '__index__'; // فهرس مفاتيح النطاق السري

  // اللبّ الأساسي الواجب توافره فعلاً ليعمل الحارس
  const REQUIRED_CORE = [
    'GM_setValue','GM_getValue','GM_deleteValue','GM_listValues',
    // واحد على الأقل من قناتي XHR (الجديدة أو القديمة)
    'GM_xmlhttpRequest'
  ];

  // =========[ 1) أدوات صغيرة ]=========
  const defineRO = (obj, key, val) => {
    try { Object.defineProperty(obj, key, { value: val, configurable: false, enumerable: false, writable: false }); }
    catch(_) { try { obj[key] = val; } catch(__) {} }
  };
  const awaitify = (x) => (x && typeof x.then === 'function') ? x : Promise.resolve(x);
  const isSecret = (k) => String(k||'').startsWith(SECRET_PREFIX);
  const noConsole = { log(){}, warn(){}, error(){}, info(){}, debug(){} };

  // =========[ 2) التقاط النسخ الأصلية داخل الإغلاق ]=========
  const ORIG = Object.freeze({
    GM: (typeof GM !== 'undefined' && GM) ? GM : null,
    set  : (typeof GM_setValue    === 'function') ? GM_setValue    : null,
    get  : (typeof GM_getValue    === 'function') ? GM_getValue    : null,
    del  : (typeof GM_deleteValue === 'function') ? GM_deleteValue : null,
    list : (typeof GM_listValues  === 'function') ? GM_listValues  : null,
    add  : (typeof GM_addValueChangeListener      === 'function') ? GM_addValueChangeListener : null,
    rem  : (typeof GM_removeValueChangeListener   === 'function') ? GM_removeValueChangeListener : null,
    // XHR: إمّا GM.xmlHttpRequest (TM الحديث) أو GM_xmlhttpRequest
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
    // تبويب: قد يكون على الشكل القديم فقط (callbacks)
    getTab_cb  : (typeof GM_getTab  === 'function') ? GM_getTab  : null,
    saveTab_cb : (typeof GM_saveTab === 'function') ? GM_saveTab : null,
    getTabs_cb : (typeof GM_getTabs === 'function') ? GM_getTabs : null,
    info       : (typeof GM_info !== 'undefined') ? GM_info : {},
  });

  // =========[ 3) إنفاذ اللبّ الأساسي ]=========
  (function enforceCore() {
    const missing = [];
    if (!ORIG.set)  missing.push('GM_setValue');
    if (!ORIG.get)  missing.push('GM_getValue');
    if (!ORIG.del)  missing.push('GM_deleteValue');
    if (!ORIG.list) missing.push('GM_listValues');
    if (!ORIG.xreq) missing.push('GM_xmlhttpRequest');

    if (missing.length) {
      // لا نطبع في الكونسول — لكن نمنع الحارس كي لا يورّث بيئة مضروبة
      throw new Error('[SCPF Guard] Core GM API missing: ' + missing.join(', '));
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

  // =========[ 5) طبقة GM مفلترة + توحيد السلوك ]=========
  // التخزين: دائمًا Promise
  function GM_setValue_f(key, value) {
    if (isSecret(key)) return Promise.reject(new Error('[SCPF Guard] write to secret namespace is forbidden'));
    return awaitify(ORIG.set(key, value));
  }
  function GM_getValue_f(key, def) {
    if (isSecret(key)) return Promise.resolve(def);
    return awaitify(ORIG.get(key, def));
  }
  function GM_deleteValue_f(key) {
    if (isSecret(key)) return Promise.resolve();
    return awaitify(ORIG.del(key));
  }
  function GM_listValues_f() {
    const ks = ORIG.list();
    const arr = (Array.isArray(ks) ? ks : []);
    return Promise.resolve(arr.filter(k => !isSecret(k)));
  }

  // مستمعو التغيّر — نُخفي مفاتيح السر
  const listenerMap = new Map();
  function GM_addValueChangeListener_f(key, cb) {
    if (!ORIG.add) return undefined;
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

  // تبويب: دائمًا Promise حتى لو المصدر callback فقط
  function makeTabsAPI() {
    // لو توفّرت واجهة Promise حديثة داخل GM، استخدمها كما هي:
    if (ORIG.GM && typeof ORIG.GM.getTab === 'function' &&
        typeof ORIG.GM.saveTab === 'function' && typeof ORIG.GM.getTabs === 'function') {
      return {
        getTab:    () => ORIG.GM.getTab(),
        saveTab:   (obj) => ORIG.GM.saveTab(obj),
        getTabs:   () => ORIG.GM.getTabs()
      };
    }
    // خلاف ذلك: لفّ الواجهة القديمة callback → Promise
    const getTab = () => new Promise(resolve => {
      try { ORIG.getTab_cb ? ORIG.getTab_cb(resolve) : resolve({id:'0'}); }
      catch(_) { resolve({id:'0'}); }
    });
    const saveTab = (obj) => new Promise(resolve => {
      try { ORIG.saveTab_cb ? ORIG.saveTab_cb(obj, resolve) : resolve(); }
      catch(_) { resolve(); }
    });
    const getTabs = () => new Promise(resolve => {
      try { ORIG.getTabs_cb ? ORIG.getTabs_cb(resolve) : getTab().then(t => resolve({[t.id]:t})); }
      catch(_) { getTab().then(t => resolve({[t.id]:t})); }
    });
    return { getTab, saveTab, getTabs };
  }
  const TabsAPI = makeTabsAPI();

  // تمهيد XHR: مرّر كما هو بدون تغيير في نوع الإرجاع
  const XHR_f = ORIG.xreq ? (...a)=>ORIG.xreq.apply(null, a) : undefined;

  // تجميعة GM المفلترة (شكل ثابت)
  const GM_filtered = (() => {
    const obj = {
      // تخزين (Promises)
      setValue   : GM_setValue_f,
      getValue   : GM_getValue_f,
      deleteValue: GM_deleteValue_f,
      listValues : GM_listValues_f,
      setValues  : async (objOrEntries) => {
        if (!objOrEntries) return;
        const entries = Array.isArray(objOrEntries) ? objOrEntries : Object.entries(objOrEntries);
        for (const [k, v] of entries) {
          if (isSecret(k)) throw new Error('[SCPF Guard] write to secret namespace is forbidden');
          await GM_setValue_f(k, v);
        }
      },
      getValues  : async (keysOrDefaults) => {
        const out = {};
        if (Array.isArray(keysOrDefaults)) {
          for (const k of keysOrDefaults) out[k] = isSecret(k) ? undefined : await GM_getValue_f(k);
        } else if (keysOrDefaults && typeof keysOrDefaults === 'object') {
          for (const [k, def] of Object.entries(keysOrDefaults)) out[k] = isSecret(k) ? def : await GM_getValue_f(k, def);
        }
        return out;
      },
      deleteValues: async (keys) => {
        for (const k of (keys || [])) if (!isSecret(k)) await GM_deleteValue_f(k);
      },
      addValueChangeListener    : ORIG.add ? GM_addValueChangeListener_f    : undefined,
      removeValueChangeListener : ORIG.rem ? GM_removeValueChangeListener_f : undefined,

      // تبويب (Promises دائمًا)
      getTab  : TabsAPI.getTab,
      saveTab : TabsAPI.saveTab,
      getTabs : TabsAPI.getTabs,

      // بقية الدوال كما هي
      addStyle       : ORIG.addStyle   || (()=>{}),
      addElement     : ORIG.addElement || (()=>{}),
      log            : ORIG.log        || noConsole.log,
      notification   : ORIG.note       || (()=>{}),
      openInTab      : ORIG.open       || (()=>{}),
      download       : ORIG.dl         || (() => {}),
      setClipboard   : ORIG.setClip    || (()=>{}),
      getResourceText: ORIG.getResText || (()=>undefined),
      getResourceURL : ORIG.getResURL  || (()=>undefined),
      xmlHttpRequest : XHR_f,
      info           : ORIG.info || {}
    };
    return Object.freeze(obj);
  })();

  // نشر GM المفلتر على globalThis ليقرأه الرئيسي إن احتاج
  try { Object.defineProperty(globalThis, 'GM', { value: GM_filtered, configurable: true }); } catch(_) {}

  // =========[ 6) إخفاء واجهات GM عن الصفحة (unsafeWindow) ]=========
  (function hardenPageAgainstGMLeak() {
    try {
      const w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
      const names = [
        'GM','GM_info','GM_getValue','GM_setValue','GM_listValues','GM_deleteValue',
        'GM_addValueChangeListener','GM_removeValueChangeListener','GM_xmlhttpRequest',
        'GM_download','GM_openInTab','GM_notification','GM_addStyle','GM_addElement',
        'GM_setClipboard','GM_getResourceText','GM_getResourceURL','GM_getTab','GM_saveTab',
        'GM_registerMenuCommand','GM_unregisterMenuCommand','GM_setValues','GM_getValues','GM_deleteValues','GM_getTabs'
      ];
      for (const n of names) {
        if (Object.prototype.hasOwnProperty.call(w, n)) continue;
        Object.defineProperty(w, n, { configurable: false, enumerable: false, get(){ return undefined; }, set(){} });
      }
    } catch(_) {}
  })();

  // =========[ 7) Vault داخلي (اختياري) ]=========
  const Vault = Object.freeze({
    set(key, value) { const raw = SECRET_PREFIX + key; ORIG.set(raw, { v: value, t: Date.now() }); idxAdd(raw); },
    get(key, def=null) { const p = ORIG.get(SECRET_PREFIX + key, null); return p && 'v' in p ? p.v : def; },
    del(key) { const raw = SECRET_PREFIX + key; ORIG.del(raw); idxDel(raw); },
    list() { return (ORIG.list() || []).filter(k => k.startsWith(SECRET_PREFIX)); }
  });

  // =========[ 8) runNF — متوافق مع الرئيسي ]=========
  function SCPF_runNF(codeString) {
    const fn = new Function('GM','GM_info','unsafeWindow', `"use strict"; return (async()=>{ ${codeString} })();`);
    const w  = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
    return fn(GM_filtered, ORIG.info || {}, w);
  }

  // =========[ 9) assert سلوكي + نشر العلامات ]=========
  const GuardAPI = {
    version: GUARD_VERSION,
    bridge: Object.freeze({ GM: GM_filtered, GM_info: ORIG.info || {}, unsafeWindow: (typeof unsafeWindow!=='undefined')?unsafeWindow:window }),
    vault: Vault,
    runNF: SCPF_runNF,
    assert(mode = 'soft') {
      try {
        // (أ) اختبار سلوكي: المفتاح السري لا يظهر ولا يُقرأ عبر النسخ المفلترة
        const probe = SECRET_PREFIX + '__probe__' + Math.random().toString(36).slice(2);
        ORIG.set(probe, { v: 'ok', t: Date.now() });
        return Promise.resolve().then(() => GM_listValues_f())
          .then(listed => {
            const hidden = Array.isArray(listed) && !listed.includes(probe);
            const def = Symbol('def');
            return GM_getValue_f(probe, def).then(v => {
              const masked = (v === def);
              ORIG.del(probe); idxDel(probe);
              const gmVisible =
                typeof GM === 'object' && GM &&
                GM.setValue === GM_setValue_f &&
                GM.listValues === GM_listValues_f;
              const gmBridgeOK =
                !!this.bridge && this.bridge.GM &&
                this.bridge.GM.setValue === GM_setValue_f &&
                this.bridge.GM.listValues === GM_listValues_f;
              const ok = hidden && masked && (gmVisible || gmBridgeOK);
              if (ok) {
                try { defineRO(globalThis, '__SCPF_GUARD_ASSERT_OK__', true); } catch (_){}
                try {
                  const w = (typeof unsafeWindow!=='undefined')?unsafeWindow:null;
                  if (w) defineRO(w,'__SCPF_GUARD_ASSERT_OK__',true);
                } catch(_){}
              }
              return ok;
            });
          });
      } catch {
        return Promise.resolve(false);
      }
    }
  };

  defineRO(globalThis, '__SCPF_GUARD_ACTIVE__', true);
  defineRO(globalThis, '__SCPF_GUARD_VERSION__', GUARD_VERSION);
  defineRO(globalThis, '__SCPF_GUARD__', Object.freeze(GuardAPI));

  try {
    const w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : null;
    if (w) {
      defineRO(w, '__SCPF_GUARD_ACTIVE__', true);
      defineRO(w, '__SCPF_GUARD_VERSION__', GUARD_VERSION);
      defineRO(w, '__SCPF_GUARD__', Object.freeze(GuardAPI));
    }
  } catch(_) {}

  // شغّل assert مرة لضبط العلم (بدون كونسول)
  try { GuardAPI.assert('soft'); } catch {}

})();

(() => {
  'use strict';

  const META = new WeakMap();   // element -> {createdBy, lastHiddenBy, lastShownBy, lastRemovedBy, history[]}
  let   REENT = 0;              // مانع إعادة الدخول

  // التقط إطار المناداة الأول غير تابع لسكربتك (تقدر تخصّص فلتر excludeBelow)
  const EXCLUDE = /(userscript\.html|tamper|trace|vendors?|chrome-extension)/i;
  function captureTopFrame() {
    const e = {};
    if (Error.captureStackTrace) Error.captureStackTrace(e, captureTopFrame);
    else e.stack = (new Error()).stack || '';
    const lines = String(e.stack).split('\n').slice(1);
    const top = lines.find(l => !EXCLUDE.test(l)) || lines[0] || '';
    return top.trim();
  }

  function tag(el, action) {
    if (!el || typeof el !== 'object') return;
    const m = META.get(el) || { history: [] };
    const top = captureTopFrame();
    m.history.push({ t: Date.now(), action, top });
    if (action === 'created' && !m.createdBy) m.createdBy = top;
    if (action === 'hidden')  m.lastHiddenBy = top;
    if (action === 'shown')   m.lastShownBy  = top;
    if (action === 'removed') m.lastRemovedBy= top;
    META.set(el, m);
  }

  // API بسيطة لك
  window.DOM_TRACE = {
    info(el)  { return META.get(el) || null; },
    print(el) {
      const m = META.get(el);
      if (!m) return console.warn('[TRACE] no meta for element', el);
      console.group('[TRACE] element');
      console.log('createdBy :', m.createdBy);
      console.log('lastShown :', m.lastShownBy);
      console.log('lastHidden:', m.lastHiddenBy);
      console.log('lastRemoved:', m.lastRemovedBy);
      console.table(m.history);
      console.groupEnd();
    }
  };

  const guard = (fn) => function(...args) {
    if (REENT) return fn.apply(this, args);
    try { REENT++; return fn.apply(this, args); } finally { REENT--; }
  };

  // ==== حفظ النسخ الأصلية ====
  const ORIG = {
    createElement: Document.prototype.createElement,
    createElementNS: Document.prototype.createElementNS,
    appendChild: Node.prototype.appendChild,
    insertBefore: Node.prototype.insertBefore,
    replaceChild: Node.prototype.replaceChild,
    removeChild: Node.prototype.removeChild,
    remove: Element.prototype.remove,
    append: Element.prototype.append,
    prepend: Element.prototype.prepend,
    insertAdjacentElement: Element.prototype.insertAdjacentElement,
    insertAdjacentHTML: Element.prototype.insertAdjacentHTML,
    setAttribute: Element.prototype.setAttribute,
    removeAttribute: Element.prototype.removeAttribute,
    setProperty: CSSStyleDeclaration.prototype.setProperty,
    removeProperty: CSSStyleDeclaration.prototype.removeProperty,
    attachShadow: Element.prototype.attachShadow,
  };
  const IH = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  const CSSText = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, 'cssText');

  // ==== إنشاء ====
  Document.prototype.createElement = guard(function(name, opts) {
    const el = ORIG.createElement.call(this, name, opts);
    try { tag(el, 'created'); } catch {}
    return el;
  });
  Document.prototype.createElementNS = guard(function(ns, qn, opts) {
    const el = ORIG.createElementNS.call(this, ns, qn, opts);
    try { tag(el, 'created'); } catch {}
    return el;
  });

  // ==== إدراج ====
  Node.prototype.appendChild = guard(function(node) {
    const out = ORIG.appendChild.call(this, node);
    try { tag(node, 'inserted'); } catch {}
    return out;
  });
  Node.prototype.insertBefore = guard(function(node, before) {
    const out = ORIG.insertBefore.call(this, node, before);
    try { tag(node, 'inserted'); } catch {}
    return out;
  });
  Node.prototype.replaceChild = guard(function(newChild, oldChild) {
    const out = ORIG.replaceChild.call(this, newChild, oldChild);
    try { tag(newChild, 'inserted'); } catch {}
    return out;
  });

  // ==== إزالة ====
  Node.prototype.removeChild = guard(function(child) {
    try { tag(child, 'removed'); } catch {}
    return ORIG.removeChild.call(this, child);
  });
  Element.prototype.remove = guard(function() {
    try { tag(this, 'removed'); } catch {}
    return ORIG.remove.call(this);
  });

  // ==== classList (إظهار/إخفاء عبر class) ====
  const DTL = DOMTokenList.prototype;
  const dAdd = DTL.add, dRem = DTL.remove, dTog = DTL.toggle;
  DTL.add = guard(function(...tokens) {
    const el = this.ownerElement || this._ownerElement;
    const r  = dAdd.apply(this, tokens);
    if (el) {
      if (tokens.includes('hidden')) tag(el, 'hidden');
      if (tokens.includes('shown'))  tag(el, 'shown');
    }
    return r;
  });
  DTL.remove = guard(function(...tokens) {
    const el = this.ownerElement || this._ownerElement;
    const hadHidden = tokens.includes('hidden');
    const hadShown  = tokens.includes('shown');
    const r = dRem.apply(this, tokens);
    if (el) {
      if (hadHidden) tag(el, 'shown'); // إزالة hidden => صار ظاهر
      if (hadShown)  tag(el, 'hidden');
    }
    return r;
  });
  DTL.toggle = guard(function(token, force) {
    const el = this.ownerElement || this._ownerElement;
    const before = this.contains(token);
    const r = dTog.call(this, token, force);
    if (el && token) {
      const after = this.contains(token);
      if (token === 'hidden') tag(el, after ? 'hidden' : 'shown');
      if (token === 'shown')  tag(el, after ? 'shown'  : 'hidden');
    }
    return r;
  });

  // ==== inline style (display/visibility) ====
  CSSStyleDeclaration.prototype.setProperty = guard(function(name, value, priority) {
    const el = this.ownerElement;
    const r = ORIG.setProperty.call(this, name, value, priority);
    if (el && (name === 'display' || name === 'visibility')) {
      const disp = String(el.style.display || '').trim();
      const vis  = String(el.style.visibility || '').trim();
      if (disp === 'none' || vis === 'hidden') tag(el, 'hidden'); else tag(el, 'shown');
    }
    return r;
  });
  CSSStyleDeclaration.prototype.removeProperty = guard(function(name) {
    const el = this.ownerElement;
    const r = ORIG.removeProperty.call(this, name);
    if (el && (name === 'display' || name === 'visibility')) {
      const disp = String(el.style.display || '').trim();
      const vis  = String(el.style.visibility || '').trim();
      if (disp === 'none' || vis === 'hidden') tag(el, 'hidden'); else tag(el, 'shown');
    }
    return r;
  });
  if (CSSText && CSSText.set) {
    Object.defineProperty(CSSStyleDeclaration.prototype, 'cssText', {
      get: CSSText.get,
      set: guard(function(v) {
        const el = this.ownerElement;
        const r = CSSText.set.call(this, v);
        if (el) {
          const disp = String(el.style.display || '').trim();
          const vis  = String(el.style.visibility || '').trim();
          if (disp === 'none' || vis === 'hidden') tag(el, 'hidden'); else tag(el, 'shown');
        }
        return r;
      }),
      configurable: true,
      enumerable: CSSText.enumerable
    });
  }

  // ==== سمات تؤثر على الظهور ====
  Element.prototype.setAttribute = guard(function(name, val) {
    const r = ORIG.setAttribute.call(this, name, val);
    if (name === 'hidden') tag(this, 'hidden');
    if (name === 'class') {
      if (this.classList.contains('hidden')) tag(this, 'hidden');
      if (this.classList.contains('shown'))  tag(this, 'shown');
    }
    return r;
  });
  Element.prototype.removeAttribute = guard(function(name) {
    const r = ORIG.removeAttribute.call(this, name);
    if (name === 'hidden') tag(this, 'shown');
    return r;
  });

  // ==== Shadow DOM: راقب ما يحدث داخله (رصد فقط) ====
  Element.prototype.attachShadow = guard(function(init) {
    const root = ORIG.attachShadow.call(this, init);
    try { observe(root); } catch {}
    return root;
  });

  // ==== مراقِب تغييرات (fallback لرصد أي تعديل لم يمر بدوالنا) ====
  function observe(root) {
    const mo = new MutationObserver(recs => {
      for (const r of recs) {
        if (r.type === 'childList') {
          r.addedNodes.forEach(n => { if (n.nodeType === 1) tag(n, 'inserted'); });
          r.removedNodes.forEach(n => { if (n.nodeType === 1) tag(n, 'removed');  });
        } else if (r.type === 'attributes') {
          const el = r.target;
          if (r.attributeName === 'class') {
            if (el.classList.contains('hidden')) tag(el, 'hidden');
            else tag(el, 'shown');
          } else if (r.attributeName === 'style') {
            const disp = el.style.display, vis = el.style.visibility;
            if (disp === 'none' || vis === 'hidden') tag(el, 'hidden'); else tag(el, 'shown');
          } else if (r.attributeName === 'hidden') {
            if (el.hasAttribute('hidden')) tag(el, 'hidden'); else tag(el, 'shown');
          }
        }
      }
    });
    mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  }
  if (document.documentElement) observe(document.documentElement);
  else document.addEventListener('readystatechange', () => {
    if (document.documentElement) observe(document.documentElement);
  }, { once: true });

  // تم
})();

(() => {
  'use strict';

  // ================= إعدادات / حالة عامة =================
  const LOG = false;     // فعّل إن أردت لوج
  let REENT = 0;         // مانع إعادة الدخول

  // مخازن للـ wrappers
  const WRAPS = new WeakMap();  // WeakMap<EventTarget, Map<key, wrapper>>
  const ONSTORE = new WeakMap(); // WeakMap<Element|Document|Window, Map<type, {orig, wrapper}>>
  const REV   = new WeakMap();   // WeakMap<wrapper, original>
  const SELF  = Symbol('evt_wrap_self');

  // ================ أدوات مساعدة =================
  const guard = (fn) => function (...args) {
    if (REENT) return fn.apply(this, args);
    try { REENT++; return fn.apply(this, args); } finally { REENT--; }
  };

  const getCapture = (opts) =>
    (typeof opts === 'boolean') ? !!opts : !!(opts && opts.capture);

  // هويات listeners (ثابتة لكل دالة/كائن)
  const LIDS = new WeakMap(); let LSEQ = 1;
  function getListenerId(listener) {
    if (typeof listener === 'function') {
      if (!LIDS.has(listener)) LIDS.set(listener, `fn#${LSEQ++}`);
      return LIDS.get(listener);
    }
    if (listener && typeof listener.handleEvent === 'function') {
      if (!LIDS.has(listener)) LIDS.set(listener, `obj#${LSEQ++}`);
      return LIDS.get(listener);
    }
    return String(listener);
  }

  function keyOf(type, listener, capture) {
    return `${type}::${capture?'1':'0'}::${getListenerId(listener)}`;
  }

  function storeForTarget(t) {
    let m = WRAPS.get(t);
    if (!m) { m = new Map(); WRAPS.set(t, m); }
    return m;
  }

  // إنشاء wrapper يُظهر سكربتك كمصدر، لكنه يستدعي الأصلي كما هو
  function makeWrapper(type, listener) {
    let wrapped;
    if (typeof listener === 'function') {
      wrapped = function (event) { return listener.call(this, event); };
    } else {
      // { handleEvent(e) { ... } }
      wrapped = function (event) { return listener.handleEvent.call(listener, event); };
    }
    // طمس المظهر قليلاً (fn.toString() يعيد شكل "native")
    try {
      Object.defineProperty(wrapped, 'name', { value: listener.name || 'bound', configurable: true });
      Object.defineProperty(wrapped, 'toString', {
        value() { return 'function () { [native code] }'; }, configurable: true
      });
    } catch {}
    REV.set(wrapped, listener);
    wrapped[SELF] = true;
    return wrapped;
  }

  // مساعد لتخزين/قراءة on* لكل هدف
  const getOnMap = (el) => {
    let m = ONSTORE.get(el);
    if (!m) { m = new Map(); ONSTORE.set(el, m); }
    return m;
  };

  function setOnHandler(el, type, v) {
    const map  = getOnMap(el);
    const prev = map.get(type);
    // فك القديم إن وجد
    if (prev) {
      try { el.removeEventListener(type, prev.wrapper, false); } catch {}
      map.delete(type);
    }
    // تعيين جديد؟
    const isCallable = (typeof v === 'function') || (v && typeof v.handleEvent === 'function');
    if (isCallable) {
      const w = makeWrapper(type, v);
      // خصائص on* تعمل طور bubble (قياسيًا)
      el.addEventListener(type, w, false);
      map.set(type, { orig: v, wrapper: w });
      if (LOG) console.debug('[on* set]', type, el, v);
    } else if (LOG) {
      console.debug('[on* cleared]', type, el);
    }
  }

  // ================== لف add/removeEventListener ==================
  const _add = EventTarget.prototype.addEventListener;
  const _rem = EventTarget.prototype.removeEventListener;

  EventTarget.prototype.addEventListener = guard(function (type, listener, options) {
    if (!listener) return _add.call(this, type, listener, options);

    const capture = getCapture(options);
    const store   = storeForTarget(this);
    const k       = keyOf(type, listener, capture);

    let w = store.get(k);
    if (!w) {
      w = makeWrapper(type, listener);
      store.set(k, w);
      if (LOG) console.debug('[evt-wrap:add]', type, k, this);
    }
    return _add.call(this, type, w, options);
  });

  EventTarget.prototype.removeEventListener = guard(function (type, listener, options) {
    if (!listener) return _rem.call(this, type, listener, options);

    const capture = getCapture(options);
    const store   = storeForTarget(this);
    const k       = keyOf(type, listener, capture);
    const w       = store.get(k);

    if (w) {
      if (LOG) console.debug('[evt-wrap:rem]', type, k, this);
      const out = _rem.call(this, type, w, options);
      // بإمكانك إبقاء الـwrapper أو حذفه؛ نحذف لتقليل التسريب.
      store.delete(k);
      return out;
    }
    // fallback: لو أضيف قبل تلبيسنا
    return _rem.call(this, type, listener, options);
  });

  // ================== لف خصائص on* (GlobalEventHandlers) ==================
  (function wrapOnProps() {
    const PROTOS = [
      Window.prototype,
      Document.prototype,
      HTMLElement.prototype,
      (typeof SVGElement !== 'undefined' ? SVGElement.prototype : HTMLElement.prototype)
    ];

    for (const proto of PROTOS) {
      for (const key of Object.getOwnPropertyNames(proto)) {
        if (!key.startsWith('on')) continue;
        const type = key.slice(2).toLowerCase();

        const desc = Object.getOwnPropertyDescriptor(proto, key);
        // نضبط getter ليُرجع الدالة الأصلية (وليس wrapper)، والـsetter يعين/يزيل فعليًا
        const getter = function () {
          const m = ONSTORE.get(this);
          return m?.get(type)?.orig ?? null;
        };
        const setter = function (v) {
          setOnHandler(this, type, v ?? null);
        };

        Object.defineProperty(proto, key, {
          configurable: true,
          enumerable: desc ? desc.enumerable : true,
          get: getter,
          set: setter
        });
      }
    }
  })();

  // ================= setAttribute/removeAttribute لسمات on* =================
  const _setAttr = Element.prototype.setAttribute;
  const _remAttr = Element.prototype.removeAttribute;

  Element.prototype.setAttribute = guard(function (name, value) {
    if (typeof name === 'string' && name.toLowerCase().startsWith('on')) {
      const type = name.slice(2).toLowerCase();
      try {
        // سلوك تقريبي لسمات on*: تُحوَّل لنص يُركّب كدالة
        // راجع MDN: event handler attributes تُصنّع دالة من النص.
        const fn = new Function('event', String(value));
        setOnHandler(this, type, fn);
        // نبقي السمة موجودة شكليًا (اختياري): يمكن مسحها لتقليل الضجيج
        // _setAttr.call(this, name, '');
        return;
      } catch {
        // CSP قد تمنع new Function — عندها نُسقِط للغرز العادي
      }
    }
    return _setAttr.call(this, name, value);
  });

  Element.prototype.removeAttribute = guard(function (name) {
    if (typeof name === 'string' && name.toLowerCase().startsWith('on')) {
      const type = name.slice(2).toLowerCase();
      setOnHandler(this, type, null);
    }
    return _remAttr.call(this, name);
  });

  if (LOG) console.log('[evt-wrap] installed OK');
})();
(() => {
  'use strict';

  // إعداد خفيف
  const LOG = false;
  let REENT = 0;
  const guard = (fn) => function(...args){ if(REENT) return fn.apply(this,args); try{REENT++; return fn.apply(this,args);} finally{REENT--;} };

  // ===== CSSStyleDeclaration: setProperty/removeProperty/cssText (موجود عندك جزئيًا) =====
  // (لو كانت ملفوفة مسبقًا، هذا المقطع يتخطّى بهدوء)
  try {
    const ORIG = {
      setProperty: CSSStyleDeclaration.prototype.setProperty,
      removeProperty: CSSStyleDeclaration.prototype.removeProperty,
    };
    const CT = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, 'cssText');
    if (ORIG.setProperty) {
      CSSStyleDeclaration.prototype.setProperty = guard(function(name, value, priority){
        return ORIG.setProperty.call(this, name, value, priority);
      });
    }
    if (ORIG.removeProperty) {
      CSSStyleDeclaration.prototype.removeProperty = guard(function(name){
        return ORIG.removeProperty.call(this, name);
      });
    }
    if (CT && CT.set) {
      Object.defineProperty(CSSStyleDeclaration.prototype, 'cssText', {
        get: CT.get,
        set: guard(function(v){ return CT.set.call(this, v); }),
        enumerable: CT.enumerable, configurable: true
      });
    }
  } catch {}

  // ===== لف خصائص style الشائعة (عند توفر setter قابل للّف) =====
  const HOT = ['display','visibility','opacity','transform','left','top','right','bottom',
               'width','height','position','zIndex','background','backgroundColor','color','pointerEvents'];
  for (const prop of HOT) {
    try {
      const d = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, prop);
      if (d && d.set && d.configurable) {
        Object.defineProperty(CSSStyleDeclaration.prototype, prop, {
          get: d.get,
          set: guard(function(v){ return d.set.call(this, v); }),
          enumerable: d.enumerable, configurable: true
        });
      }
    } catch {}
  }
  // مرجع: خصائص CSSStyleDeclaration و setProperty/cssText.  (MDN)  // ← للاستناد
  // (لن نكرر السرد هنا؛ الروابط بالأسفل)

  // ===== className setters (بالإضافة لـclassList التي لفتها) =====
  const targetsForClassName = [
    HTMLElement.prototype,
    (typeof SVGElement !== 'undefined' ? SVGElement.prototype : null)
  ].filter(Boolean);

  for (const P of targetsForClassName) {
    try {
      const d = Object.getOwnPropertyDescriptor(P, 'className') || Object.getOwnPropertyDescriptor(Element.prototype, 'className');
      if (d && d.set) {
        Object.defineProperty(P, 'className', {
          get(){ return d.get ? d.get.call(this) : this.getAttribute('class'); },
          set: guard(function(v){ return d.set.call(this, v); }),
          enumerable: d.enumerable, configurable: true
        });
      }
    } catch {}
  }
  // مرجع: Element.classList/DOMTokenList، وخصائص GlobalEventHandlers/className. :contentReference[oaicite:2]{index=2}

  // ===== CSSOM: إدراج/حذف/استبدال القواعد في الـStyleSheets =====
  try {
    const SH = {
      insertRule: CSSStyleSheet.prototype.insertRule,
      deleteRule: CSSStyleSheet.prototype.deleteRule,
      replace: CSSStyleSheet.prototype.replace,
      replaceSync: CSSStyleSheet.prototype.replaceSync
    };
    if (SH.insertRule) CSSStyleSheet.prototype.insertRule   = guard(function(rule, index){ return SH.insertRule.call(this, rule, index); });
    if (SH.deleteRule) CSSStyleSheet.prototype.deleteRule   = guard(function(index){ return SH.deleteRule.call(this, index); });
    if (SH.replace)    CSSStyleSheet.prototype.replace      = guard(function(text){ return SH.replace.call(this, text); });
    if (SH.replaceSync)CSSStyleSheet.prototype.replaceSync  = guard(function(text){ return SH.replaceSync.call(this, text); });
    if (LOG) console.debug('[cssom] sheet wrappers installed');
  } catch {}

  // مرجع: CSSStyleSheet.insertRule/deleteRule و replace/replaceSync. :contentReference[oaicite:3]{index=3}

  // ===== adoptedStyleSheets (Document & ShadowRoot) =====
  function wrapAdopted(proto){
    const d = Object.getOwnPropertyDescriptor(proto, 'adoptedStyleSheets');
    if (d && (d.set || d.get)) {
      Object.defineProperty(proto, 'adoptedStyleSheets', {
        get(){ return d.get ? d.get.call(this) : []; },
        set: guard(function(arr){ return d.set ? d.set.call(this, arr) : undefined; }),
        enumerable: d.enumerable, configurable: true
      });
    }
  }
  try { wrapAdopted(Document.prototype); } catch {}
  try { wrapAdopted(ShadowRoot.prototype); } catch {}
  // مرجع: Document/ShadowRoot.adoptedStyleSheets، وConstructable Stylesheets. :contentReference[oaicite:4]{index=4}

  // ===== StyleSheet.disabled (وكذلك HTMLStyleElement/HTMLLinkElement/SVGStyleElement.disabled) =====
  try {
    const DS = Object.getOwnPropertyDescriptor(StyleSheet.prototype, 'disabled');
    if (DS && DS.set) {
      Object.defineProperty(StyleSheet.prototype, 'disabled', {
        get(){ return DS.get ? DS.get.call(this) : false; },
        set: guard(function(v){ return DS.set.call(this, v); }),
        enumerable: DS.enumerable, configurable: true
      });
    }
  } catch {}
  // HTMLStyleElement / HTMLLinkElement / SVGStyleElement قد تملِك disabled أيضًا:
  for (const P of [HTMLStyleElement?.prototype, HTMLLinkElement?.prototype, (typeof SVGStyleElement!=='undefined'?SVGStyleElement.prototype:null)].filter(Boolean)) {
    try {
      const d = Object.getOwnPropertyDescriptor(P, 'disabled');
      if (d && d.set) {
        Object.defineProperty(P, 'disabled', {
          get(){ return d.get ? d.get.call(this) : false; },
          set: guard(function(v){ return d.set.call(this, v); }),
          enumerable: d.enumerable, configurable: true
        });
      }
    } catch {}
  }
  // مراجع: StyleSheet.disabled و HTMLStyleElement/HTMLLinkElement/SVGStyleElement.disabled. :contentReference[oaicite:5]{index=5}

  if (LOG) console.log('[style-broker] installed');
})();
(() => {
  'use strict';
  let REENT = 0;
  const guard = (fn) => function(...args){ if(REENT) return fn.apply(this,args); try{REENT++; return fn.apply(this,args);} finally{REENT--;} };
  const nativeLike = (f) => { try { Object.defineProperty(f,'toString',{value(){return 'function () { [native code] }';}, configurable:true}); } catch{} return f; };

  // helpers
  const wrapCb = (cb) => typeof cb === 'function' ? nativeLike(function(...a){ return cb.apply(this,a); }) : cb;

  // setTimeout / clearTimeout
  const _st = window.setTimeout, _ct = window.clearTimeout;
  const TO = new Map();
  window.setTimeout = guard(function(handler, timeout, ...args){
    const w = wrapCb(handler);
    const id = _st(w, timeout, ...args);
    TO.set(id, w);
    return id;
  });
  window.clearTimeout = guard(function(id){ TO.delete(id); return _ct(id); });

  // setInterval / clearInterval
  const _si = window.setInterval, _ci = window.clearInterval;
  const IV = new Map();
  window.setInterval = guard(function(handler, timeout, ...args){
    const w = wrapCb(handler);
    const id = _si(w, timeout, ...args);
    IV.set(id, w);
    return id;
  });
  window.clearInterval = guard(function(id){ IV.delete(id); return _ci(id); });

  // requestAnimationFrame / cancelAnimationFrame
  const _raf = window.requestAnimationFrame, _caf = window.cancelAnimationFrame;
  const RAF = new Map();
  window.requestAnimationFrame = guard(function(cb){
    const w = wrapCb(cb);
    const id = _raf(w);
    RAF.set(id, w);
    return id;
  });
  window.cancelAnimationFrame = guard(function(id){ RAF.delete(id); return _caf(id); });

  // requestIdleCallback / cancelIdleCallback (حيث مدعومة)
  if ('requestIdleCallback' in window && 'cancelIdleCallback' in window) {
    const _ric = window.requestIdleCallback, _cic = window.cancelIdleCallback;
    const IDL = new Map();
    window.requestIdleCallback = guard(function(cb, opts){
      const w = wrapCb(cb);
      const id = _ric(w, opts);
      IDL.set(id, w);
      return id;
    });
    window.cancelIdleCallback = guard(function(id){ IDL.delete(id); return _cic(id); });
  }
})();
(() => {
  'use strict';

  const LOG = false;      // فعّل للمراقبة
  let REENT = 0;
  const guard = fn => function(...a){ if(REENT) return fn.apply(this,a); try{REENT++; return fn.apply(this,a);} finally{REENT--;} };

  // ——— التقاط أعلى إطار (اختياري) ———
  const EXCLUDE = /(userscript\.html|tamper|chrome-extension|vendors?)/i;
  function topFrame() {
    const e = {};
    if (Error.captureStackTrace) Error.captureStackTrace(e, topFrame);
    else e.stack = (new Error()).stack || '';
    const lines = String(e.stack).split('\n').slice(1);
    const top = lines.find(l => !EXCLUDE.test(l)) || lines[0] || '';
    return top.trim();
  }
  const log = (...args) => { if (LOG) console.debug('[css-passive]', ...args); };

  // ===== CSSStyleDeclaration: setProperty/removeProperty/cssText =====
  try {
    const ORIG = {
      setProperty: CSSStyleDeclaration.prototype.setProperty,
      removeProperty: CSSStyleDeclaration.prototype.removeProperty,
    };
    const CT = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, 'cssText');

    if (ORIG.setProperty) {
      CSSStyleDeclaration.prototype.setProperty = guard(function(name, value, priority){
        const ret = ORIG.setProperty.call(this, name, value, priority); // تمرير للأصل
        if (this.ownerElement) log('setProperty', name, 'on', this.ownerElement, 'at', topFrame());
        return ret;
      });
    }
    if (ORIG.removeProperty) {
      CSSStyleDeclaration.prototype.removeProperty = guard(function(name){
        const ret = ORIG.removeProperty.call(this, name);
        if (this.ownerElement) log('removeProperty', name, 'on', this.ownerElement, 'at', topFrame());
        return ret;
      });
    }
    if (CT && CT.set) {
      Object.defineProperty(CSSStyleDeclaration.prototype, 'cssText', {
        get: CT.get,
        set: guard(function(v){
          const ret = CT.set.call(this, v);
          if (this.ownerElement) log('cssText set on', this.ownerElement, 'at', topFrame());
          return ret;
        }),
        enumerable: CT.enumerable, configurable: true
      });
    }
  } catch {}

  // ===== className (إضافةً لـ classList اللي لفّيتها) =====
  for (const P of [HTMLElement.prototype, (typeof SVGElement!=='undefined'?SVGElement.prototype:null)].filter(Boolean)) {
    try {
      const d = Object.getOwnPropertyDescriptor(P, 'className') || Object.getOwnPropertyDescriptor(Element.prototype, 'className');
      if (d && d.set) {
        Object.defineProperty(P, 'className', {
          get(){ return d.get ? d.get.call(this) : this.getAttribute('class'); },
          set: guard(function(v){
            const ret = d.set.call(this, v);
            log('className set', v, 'on', this, 'at', topFrame());
            return ret;
          }),
          enumerable: d.enumerable, configurable: true
        });
      }
    } catch {}
  }
  // مرجع: CSSStyleDeclaration و setProperty/cssText. :contentReference[oaicite:2]{index=2}

  // ===== CSSOM: CSSStyleSheet insert/delete/replace/replaceSync =====
  try {
    const SH = {
      insertRule: CSSStyleSheet.prototype.insertRule,
      deleteRule: CSSStyleSheet.prototype.deleteRule,
      replace:     CSSStyleSheet.prototype.replace,
      replaceSync: CSSStyleSheet.prototype.replaceSync
    };
    if (SH.insertRule) CSSStyleSheet.prototype.insertRule = guard(function(rule, index){
      const out = SH.insertRule.call(this, rule, index);
      log('insertRule', rule, 'on sheet', this.href || this.ownerNode || this, 'at', topFrame());
      return out;
    });
    if (SH.deleteRule) CSSStyleSheet.prototype.deleteRule = guard(function(index){
      const out = SH.deleteRule.call(this, index);
      log('deleteRule', index, 'on sheet', this.href || this.ownerNode || this, 'at', topFrame());
      return out;
    });
    if (SH.replace) CSSStyleSheet.prototype.replace = guard(function(text){
      const p = SH.replace.call(this, text);
      log('replace (async) on sheet', this, 'at', topFrame());
      return p;
    });
    if (SH.replaceSync) CSSStyleSheet.prototype.replaceSync = guard(function(text){
      const out = SH.replaceSync.call(this, text);
      log('replaceSync on sheet', this, 'at', topFrame());
      return out;
    });
  } catch {}
  // مراجع: insertRule/deleteRule و replace/replaceSync. :contentReference[oaicite:3]{index=3}

  // ===== adoptedStyleSheets (Document & ShadowRoot) =====
  function wrapAdopted(proto, label){
    const d = Object.getOwnPropertyDescriptor(proto, 'adoptedStyleSheets');
    if (d && (d.set || d.get)) {
      Object.defineProperty(proto, 'adoptedStyleSheets', {
        get(){ return d.get ? d.get.call(this) : []; },
        set: guard(function(arr){
          const out = d.set ? d.set.call(this, arr) : undefined;
          log(label+'.adoptedStyleSheets set', arr, 'at', topFrame());
          return out;
        }),
        enumerable: d.enumerable, configurable: true
      });
    }
  }
  try { wrapAdopted(Document.prototype, 'Document'); } catch {}
  try { wrapAdopted(ShadowRoot.prototype, 'ShadowRoot'); } catch {}
  // مراجع: adoptedStyleSheets على Document وShadowRoot. :contentReference[oaicite:4]{index=4}

  // ===== مراقبة الروابط والستايلات دون لمسها (شبكة أمان) =====
  try {
    const mo = new MutationObserver(recs => {
      for (const r of recs) {
        if (r.type === 'childList') {
          r.addedNodes.forEach(n => {
            if (n.nodeType === 1) {
              if (n.nodeName === 'LINK' && /\bstylesheet\b/i.test(n.rel||'')) log('link stylesheet added', n.href || n, 'at', topFrame());
              else if (n.nodeName === 'STYLE') log('<style> added', n, 'at', topFrame());
            }
          });
        } else if (r.type === 'attributes') {
          if (r.target.nodeName === 'LINK' && (r.attributeName === 'disabled' || r.attributeName === 'media')) {
            log('link attr change', r.attributeName, '=>', r.target.getAttribute(r.attributeName), r.target.href||r.target);
          } else if (r.target.nodeName === 'STYLE' && r.attributeName === 'media') {
            log('style media change =>', r.target.media, r.target);
          }
        }
      }
    });
    mo.observe(document.documentElement || document, { childList:true, subtree:true, attributes:true, attributeFilter:['rel','href','disabled','media'] });
  } catch {}

  // انتهى؛ لا re-hosting، لا تعطيل، تمرير فقط.
})();
