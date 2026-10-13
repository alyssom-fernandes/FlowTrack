/* Registro de erros do navegador: JS, promessas rejeitadas, console.error,
   recursos que não carregaram e falhas capturadas pelo ErrorBoundary.
   Consulte no console com errosRegistrados(). Nada aqui pode lançar erro. */
(function () {
  var lista = [];
  function anotar(tipo, msg) {
    try { lista.push({ tipo: tipo, mensagem: String(msg).slice(0, 500), quando: new Date().toISOString(), pagina: location.pathname }); if (lista.length > 200) lista.shift(); } catch (e) {}
  }
  window.addEventListener('error', function (ev) {
    try {
      var alvo = ev.target;
      if (alvo && alvo !== window && (alvo.src || alvo.href)) anotar('recurso', (alvo.src || alvo.href));
      else anotar('js', (ev.message || 'erro') + (ev.filename ? ' @ ' + ev.filename + ':' + ev.lineno : ''));
    } catch (e) {}
  }, true);
  document.addEventListener('securitypolicyviolation', function (ev) {
    try { anotar('csp', ev.violatedDirective + ' bloqueou ' + (ev.blockedURI || 'inline')); } catch (e) {}
  });
  window.addEventListener('unhandledrejection', function (ev) {
    try { var r = ev.reason; anotar('promessa', (r && (r.stack || r.message)) || r); } catch (e) {}
  });
  var original = console.error;
  console.error = function () {
    try { anotar('console', Array.prototype.map.call(arguments, function (a) { return a && a.stack ? a.stack : (typeof a === 'object' ? JSON.stringify(a) : String(a)); }).join(' ')); } catch (e) {}
    return original.apply(console, arguments);
  };
  window.__anotarErro = anotar;
  window.errosRegistrados = function () { return lista.slice(); };
  window.limparErros = function () { lista.length = 0; };
})();
    
