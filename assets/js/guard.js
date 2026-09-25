/**
 * 错误可见化：任何未捕获的脚本错误都会在页面顶部显示成一条提示，
 * 而不是让用户面对一个空白页面。普通脚本（非 module），保证先于页面模块执行。
 */
(function () {
  function banner(text) {
    try {
      var d = document.createElement('div');
      d.className = 'notice warn';
      d.setAttribute('data-js-error', '1');
      d.style.cssText = 'margin:14px 22px';
      d.textContent = '页面脚本错误：' + text;
      (document.body || document.documentElement).prepend(d);
    } catch (_) { /* 忽略 */ }
  }
  window.addEventListener('error', function (e) {
    banner((e && e.message) || '未知错误');
  });
  window.addEventListener('unhandledrejection', function (e) {
    banner('未处理的 Promise 异常：' + ((e && e.reason && (e.reason.message || e.reason)) || '未知'));
  });
})();
