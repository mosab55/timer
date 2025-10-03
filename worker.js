// guard-require-probe.js  (ارفعه على أي رابط ثابت ثم استخدمه مع @require)
// ملف خارجي يُنفَّذ قبل جسم السكربت وفي نفس الـ sandbox
(() => {
  'use strict';

  const PFX = '%c[@require guard]';
  const STY = 'color:#09f';
  const KEY = 'guard:@require_probe';
  const VAL = { ok: true, at: Date.now() };

  // يتعامل تلقائيًا مع الإصدارات المتزامنة/اللا متزامنة
  const awaitify = (x) => (x && typeof x.then === 'function') ? x : Promise.resolve(x);

  (async () => {
    try {
      // يسهّل على جسم السكربت التأكد أن الحارس شغّال
      Object.defineProperty(globalThis, '__STEALTH_GUARD_ACTIVE__', { value: true, configurable: false });

      console.log(PFX, STY, 'GM_* types =', {
        GM_setValue: typeof GM_setValue,
        GM_getValue: typeof GM_getValue,
        GM_listValues: typeof GM_listValues,
        GM_info: typeof GM_info
      });

      // جرّب التخزين والقراءة والسرد
      await awaitify(GM_setValue(KEY, VAL));
      const got  = await awaitify(GM_getValue(KEY, null));
      const keys = await awaitify(GM_listValues());

      console.log(PFX, STY, 'setValue -> OK');
      console.log(PFX, STY, 'getValue ->', got);
      console.log(PFX, STY, 'listValues ->', keys);

      const success = !!(got && got.ok === true);
      console.log(PFX, STY, success
        ? '✅ SUCCESS: @require يَملك صلاحيات GM_* ويعمل قبل جسم السكربت'
        : '⚠️ Unexpected get() result'
      );
    } catch (e) {
      console.error(PFX, STY, '❌ FAILED:', e);
    }
  })();
})();
