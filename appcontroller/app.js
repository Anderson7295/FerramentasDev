(function () {
  'use strict';
  var KEY = 'appcontroller.clientes';
  var KEY_EXE = 'appcontroller.ultimoExe';
  var $ = function (id) { return document.getElementById(id); };
  var campos = { exe: 'Diretório AppController.exe', host: 'Host (endereço)', usuario: 'Usuário', senha: 'Senha' };
  var comandoAtual = '';

  function lerClientes() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; }
  }
  function gravarClientes(lista) {
    try { localStorage.setItem(KEY, JSON.stringify(lista)); }
    catch (e) { toast('Não foi possível salvar no navegador.'); return false; }
    gravarArquivo(lista);
    return true;
  }

  // ---------- arquivo no computador (File System Access API: Chrome/Edge) ----------
  var suportaArquivo = 'showSaveFilePicker' in window && 'indexedDB' in window;
  var arq = null;          // FileSystemFileHandle vinculado
  var arqOk = false;       // permissão de leitura/escrita concedida
  var filaEscrita = Promise.resolve();

  function idb(modo, fn) {
    return new Promise(function (res, rej) {
      var r = indexedDB.open('ferramentasdev', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
      r.onerror = function () { rej(r.error); };
      r.onsuccess = function () {
        var tx = r.result.transaction('kv', modo);
        var req = fn(tx.objectStore('kv'));
        tx.oncomplete = function () { res(req && req.result); r.result.close(); };
        tx.onerror = function () { rej(tx.error); r.result.close(); };
      };
    });
  }
  var ARQ_KEY = 'appcontroller.arquivoClientes';
  function guardarHandle(h) { return idb('readwrite', function (s) { return h ? s.put(h, ARQ_KEY) : s.delete(ARQ_KEY); }); }
  function lerHandle() { return idb('readonly', function (s) { return s.get(ARQ_KEY); }); }

  function normalizar(n) {
    return { nome: String(n.nome), exe: n.exe || '', host: n.host || '', usuario: n.usuario || '', senha: n.senha || '' };
  }
  function mesclar(base, novos) {
    var lista = base.slice();
    novos.forEach(function (n) {
      if (!n || !n.nome) return;
      var c = normalizar(n);
      var i = lista.findIndex(function (x) { return x.nome.toLowerCase() === c.nome.toLowerCase(); });
      if (i >= 0) lista[i] = c; else lista.push(c);
    });
    return lista;
  }
  function gravarArquivo(lista) {
    if (!arq || !arqOk) return;
    var texto = JSON.stringify(lista, null, 2);
    filaEscrita = filaEscrita.then(function () {
      return arq.createWritable().then(function (w) { return w.write(texto).then(function () { return w.close(); }); });
    }).catch(function () {
      arqOk = false; renderArquivo();
      toast('Não foi possível gravar no arquivo. Clique em "Reconectar arquivo".');
    });
  }
  function lerArquivo() {
    return arq.getFile().then(function (f) { return f.text(); }).then(function (t) {
      if (!t.trim()) return [];
      var d = JSON.parse(t);
      if (!Array.isArray(d)) throw new Error('formato');
      return d;
    });
  }
  // Carrega do arquivo (ele manda), junta com o que só existe no navegador e grava de volta.
  function sincronizar() {
    return lerArquivo().then(function (doArquivo) {
      var lista = mesclar(lerClientes(), doArquivo);
      try { localStorage.setItem(KEY, JSON.stringify(lista)); } catch (e) {}
      gravarArquivo(lista);
      renderLista($('listaClientes').value);
      renderArquivo();
      return lista;
    });
  }
  function permissao(pedir) {
    if (!arq) return Promise.resolve(false);
    var o = { mode: 'readwrite' };
    return arq.queryPermission(o).then(function (p) {
      if (p === 'granted' || !pedir) return p === 'granted';
      return arq.requestPermission(o).then(function (p2) { return p2 === 'granted'; });
    }).then(function (ok) { arqOk = ok; renderArquivo(); return ok; });
  }
  // Chamado em ações do usuário (salvar/excluir/importar): reconecta o arquivo se preciso.
  function garantirArquivo() {
    if (!arq || arqOk) return Promise.resolve();
    return permissao(true).then(function (ok) { if (ok) return sincronizar(); }).catch(function () {});
  }
  function renderArquivo() {
    var st = $('statusArquivo');
    if (!st) return;
    if (!suportaArquivo) {
      st.className = 'status pend';
      st.textContent = 'Este navegador não permite salvar em arquivo. Use Chrome ou Edge, ou use Exportar/Importar. A lista fica só neste navegador.';
      $('btnArqCriar').hidden = $('btnArqAbrir').hidden = $('btnArqReconectar').hidden = $('btnArqDesvincular').hidden = true;
      return;
    }
    var nome = arq ? arq.name : '';
    if (arq && arqOk) {
      st.className = 'status ok';
      st.textContent = 'Salvando e carregando automaticamente do arquivo "' + nome + '".';
    } else if (arq) {
      st.className = 'status pend';
      st.textContent = 'O navegador pediu confirmação para usar o arquivo "' + nome + '". Clique em "Reconectar arquivo" (ou salve um cliente) e permita o acesso.';
    } else {
      st.className = 'status pend';
      st.textContent = 'A lista está salva só neste navegador. Vincule um arquivo no computador (ex.: C:\\FerramentasDev\\clientes-tcloud.json) para salvar e carregar automaticamente.';
    }
    $('btnArqCriar').hidden = $('btnArqAbrir').hidden = !!arq;
    $('btnArqReconectar').hidden = !arq || arqOk;
    $('btnArqDesvincular').hidden = !arq;
  }
  function vincular(h, novo) {
    arq = h; arqOk = true;
    return guardarHandle(h).catch(function () {}).then(function () {
      if (novo) { gravarArquivo(lerClientes()); renderArquivo(); return; }
      return sincronizar();
    }).then(function () { toast('Arquivo "' + h.name + '" vinculado.'); })
      .catch(function () { toast('Arquivo inválido. Escolha um .json gerado por esta ferramenta.'); });
  }
  var tiposJson = [{ description: 'Lista de clientes (.json)', accept: { 'application/json': ['.json'] } }];
  function criarArquivo() {
    window.showSaveFilePicker({ suggestedName: 'clientes-tcloud.json', startIn: 'documents', types: tiposJson })
      .then(function (h) { return vincular(h, true); }, function () {});
  }
  function abrirArquivo() {
    window.showOpenFilePicker({ startIn: 'documents', types: tiposJson, multiple: false })
      .then(function (hs) { return vincular(hs[0], false); }, function () {});
  }
  function desvincular() {
    if (!confirm('Parar de usar o arquivo "' + arq.name + '"? O arquivo não será apagado e a lista continua neste navegador.')) return;
    arq = null; arqOk = false;
    guardarHandle(null).catch(function () {});
    renderArquivo();
  }
  function iniciarArquivo() {
    renderArquivo();
    if (!suportaArquivo) return;
    lerHandle().then(function (h) {
      if (!h) return;
      arq = h;
      return permissao(false).then(function (ok) { if (ok) return sincronizar(); });
    }).catch(function () { renderArquivo(); });
  }
  function valores() {
    return { nome: $('nome').value.trim(), exe: $('exe').value.trim().replace(/^"|"$/g, ''),
      host: $('host').value.trim(), usuario: $('usuario').value.trim(), senha: $('senha').value };
  }
  function faltando(v) {
    return Object.keys(campos).filter(function (k) { return !v[k] || !String(v[k]).trim(); });
  }
  function montarComando(v) {
    return '"' + v.exe + '" -h ' + v.host + ' -u ' + v.usuario + ' -p ' + v.senha;
  }

  function atualizarEstado() {
    var v = valores();
    var f = faltando(v);
    var ok = f.length === 0;
    $('btnGerar').disabled = !ok;
    $('btnExecutar').disabled = !ok;
    $('faltando').textContent = ok ? '' : 'Obrigatório preencher: ' + f.map(function (k) { return campos[k]; }).join(', ') + '.';
    if (comandoAtual && (!ok || montarComando(v) !== comandoAtual)) limparComando();
    var temCmd = !!comandoAtual;
    $('btnCopiar').disabled = !temCmd;
    $('btnBat').disabled = !temCmd;
  }
  function limparComando() {
    comandoAtual = '';
    var el = $('comando');
    el.textContent = 'Preencha todos os campos obrigatórios e clique em "Gerar comando".';
    el.classList.add('vazio');
  }
  function gerar() {
    var v = valores();
    if (faltando(v).length) return;
    comandoAtual = montarComando(v);
    var el = $('comando');
    el.textContent = comandoAtual;
    el.classList.remove('vazio');
    try { localStorage.setItem(KEY_EXE, v.exe); } catch (e) {}
    atualizarEstado();
  }

  function copiar() {
    if (!comandoAtual) return;
    var feito = function () { toast('Comando copiado!'); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(comandoAtual).then(feito, function () { copiarFallback(); feito(); });
    } else { copiarFallback(); feito(); }
  }
  function copiarFallback() {
    var ta = document.createElement('textarea');
    ta.value = comandoAtual; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  // Escapa caracteres especiais do CMD dentro de um .bat
  function escBat(s) {
    return String(s).replace(/%/g, '%%').replace(/([\^&|<>])/g, '^$1');
  }
  function baixarBat() {
    var v = valores();
    if (faltando(v).length) return;
    var linha = '"' + v.exe + '" -h ' + escBat(v.host) + ' -u ' + escBat(v.usuario) + ' -p ' + escBat(v.senha);
    var conteudo = '@echo off\r\nstart "" ' + linha + '\r\n';
    var nome = (v.nome || v.host.split('.')[0] || 'appcontroller').replace(/[^\w\-]+/g, '_') + '.bat';
    var blob = new Blob([conteudo], { type: 'application/octet-stream' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  var KEY_INST = 'appcontroller.launcherInstalado';
  function instalado() { try { return localStorage.getItem(KEY_INST) === '1'; } catch (e) { return false; } }
  function renderDireto() {
    var st = $('statusDireto');
    if (instalado()) {
      st.className = 'status ok';
      st.innerHTML = 'Este computador está configurado para executar direto. <button class="link" id="btnReconfig">Ver instruções / marcar como não instalado</button>';
      $('btnReconfig').onclick = function () {
        try { localStorage.removeItem(KEY_INST); } catch (e) {}
        renderDireto(); $('instrucoes').open = true;
      };
      $('instrucoes').open = false;
    } else {
      st.className = 'status pend';
      st.textContent = 'Para executar direto pelo navegador, este computador precisa de uma configuração feita uma única vez. Siga os passos abaixo.';
      $('instrucoes').open = true;
    }
  }
  function executar() {
    var v = valores();
    if (faltando(v).length) return;
    if (!instalado()) {
      $('instrucoes').open = true;
      $('secDireto').scrollIntoView({ behavior: 'smooth' });
      toast('Configure o computador primeiro (passos abaixo).');
      return;
    }
    var e = encodeURIComponent;
    var url = 'appcontroller:?exe=' + e(v.exe) + '&h=' + e(v.host) + '&u=' + e(v.usuario) + '&p=' + e(v.senha);
    window.location.href = url;
    toast('Abrindo AppController… (se nada acontecer, instale o launcher abaixo)');
  }

  // ---------- clientes ----------
  function renderLista(selecionar) {
    var sel = $('listaClientes');
    var lista = lerClientes().sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
    sel.innerHTML = '<option value="">— Selecione um cliente (' + lista.length + ') —</option>';
    lista.forEach(function (c) {
      var o = document.createElement('option');
      o.value = c.nome;
      var falta = faltando(c).length;
      o.textContent = c.nome + (falta ? '  (incompleto)' : '');
      sel.appendChild(o);
    });
    if (selecionar) sel.value = selecionar;
    estadoLista();
  }
  function estadoLista() {
    var tem = !!$('listaClientes').value;
    $('btnCarregar').disabled = !tem;
    $('btnExcluir').disabled = !tem;
  }
  function salvar() {
    var v = valores();
    if (!v.nome) { toast('Informe o nome do cliente para salvar.'); $('nome').focus(); return; }
    garantirArquivo().then(function () { salvarAgora(v); });
  }
  function salvarAgora(v) {
    var lista = lerClientes();
    var i = lista.findIndex(function (c) { return c.nome.toLowerCase() === v.nome.toLowerCase(); });
    if (i >= 0 && !confirm('Já existe o cliente "' + lista[i].nome + '". Deseja sobrescrever?')) return;
    if (i >= 0) lista[i] = v; else lista.push(v);
    if (gravarClientes(lista)) {
      renderLista(v.nome);
      toast(faltando(v).length ? 'Cliente salvo (parcialmente preenchido).' : 'Cliente salvo!');
    }
  }
  function carregar() {
    var nome = $('listaClientes').value;
    var c = lerClientes().find(function (x) { return x.nome === nome; });
    if (!c) return;
    ['nome', 'exe', 'host', 'usuario', 'senha'].forEach(function (k) { $(k).value = c[k] || ''; });
    if (!c.exe) { try { $('exe').value = localStorage.getItem(KEY_EXE) || ''; } catch (e) {} }
    limparComando();
    atualizarEstado();
    if (!faltando(valores()).length) gerar();
    toast('Cliente "' + c.nome + '" carregado.');
  }
  function excluir() {
    var nome = $('listaClientes').value;
    if (!nome || !confirm('Excluir o cliente "' + nome + '"?')) return;
    garantirArquivo().then(function () {
      gravarClientes(lerClientes().filter(function (c) { return c.nome !== nome; }));
      renderLista();
      toast('Cliente excluído.');
    });
  }
  function limpar() {
    ['nome', 'host', 'usuario', 'senha'].forEach(function (k) { $(k).value = ''; });
    $('listaClientes').value = '';
    estadoLista();
    limparComando();
    atualizarEstado();
  }
  function exportar() {
    var blob = new Blob([JSON.stringify(lerClientes(), null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'clientes-appcontroller.json';
    document.body.appendChild(a); a.click(); a.remove();
  }
  function importar(ev) {
    var f = ev.target.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var novos = JSON.parse(r.result);
        if (!Array.isArray(novos)) throw new Error();
        gravarClientes(mesclar(lerClientes(), novos)); renderLista(); toast('Lista importada.');
      } catch (e) { toast('Arquivo inválido.'); }
      ev.target.value = '';
    };
    r.readAsText(f);
  }

  var tt;
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(tt); tt = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  // ---------- eventos ----------
  ['nome', 'exe', 'host', 'usuario', 'senha'].forEach(function (k) { $(k).addEventListener('input', atualizarEstado); });
  $('btnGerar').addEventListener('click', gerar);
  $('btnCopiar').addEventListener('click', copiar);
  $('btnBat').addEventListener('click', baixarBat);
  $('btnExecutar').addEventListener('click', executar);
  $('btnSalvar').addEventListener('click', salvar);
  $('btnLimpar').addEventListener('click', limpar);
  $('btnCarregar').addEventListener('click', carregar);
  $('btnExcluir').addEventListener('click', excluir);
  $('listaClientes').addEventListener('change', estadoLista);
  $('listaClientes').addEventListener('dblclick', carregar);
  $('btnJaInstalei').addEventListener('click', function () {
    try { localStorage.setItem(KEY_INST, '1'); } catch (e) {}
    renderDireto(); toast('Pronto! Agora o botão Executar abre o AppController.');
  });
  $('btnExportar').addEventListener('click', exportar);
  $('arqImportar').addEventListener('change', importar);
  $('btnArqCriar').addEventListener('click', criarArquivo);
  $('btnArqAbrir').addEventListener('click', abrirArquivo);
  $('btnArqReconectar').addEventListener('click', function () { garantirArquivo(); });
  $('btnArqDesvincular').addEventListener('click', desvincular);
  // Volta para a aba: recarrega do arquivo (pode ter sido alterado em outra aba/janela)
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && arq && arqOk) sincronizar().catch(function () {});
  });
  $('btnVerSenha').addEventListener('click', function () {
    var s = $('senha'); var mostrar = s.type === 'password';
    s.type = mostrar ? 'text' : 'password'; this.textContent = mostrar ? 'Ocultar' : 'Mostrar';
  });

  try { $('exe').value = localStorage.getItem(KEY_EXE) || ''; } catch (e) {}
  renderLista();
  iniciarArquivo();
  renderDireto();
  atualizarEstado();
})();
