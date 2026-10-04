/* Application identity is independent of the version which produced a character snapshot.
 * Native installations use the installed receipt; file:// browser mode uses package metadata.
 * Never infer the current application version from AE_DATA.toolVersion or an update target. */
(function (global) {
  'use strict';
  var AE = global.AE = global.AE || {};
  function valid(value) {
    return typeof value === 'string' && /^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(value) && value !== '0.0.0' ? value : '';
  }
  AE.applicationVersion = function () {
    var boot = global.AE_APP_UPDATE_BOOT;
    var installed = boot && boot.protocol === 1 ? valid(boot.currentVersion) : '';
    if (installed) return installed;
    var meta = global.document && global.document.getElementById('application-version');
    return meta ? valid(meta.getAttribute('content')) : '';
  };
})(typeof window !== 'undefined' ? window : globalThis);
