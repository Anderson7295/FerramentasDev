// Gerador de branches - Winthor
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);

  // ---------- calendário de versões (códigos numéricos, ex: 370 = 37.0) ----------
  // Referência: março/2026 = Sup 370, Mas 380, Rel 390, Dev 400.
  // A Release só é sugerida nos meses de virada (março e setembro).
  function versoesDoMes(data) {
    const ano = data.getFullYear();
    const mes = data.getMonth() + 1;
    const base = 370 + (ano - 2026) * 20;
    let v;
    if (ano === 2026 && mes === 10) {
      v = { sup: 370, mas: 380, rel: 390, dev: 400 };
    } else if (ano === 2026 && mes === 11) {
      v = { sup: 380, mas: 390, rel: null, dev: 400 }; // após descontinuar a 370
    } else if (mes >= 3 && mes <= 10) {
      v = { sup: base, mas: base + 10, rel: base + 20, dev: base + 30 };
    } else if (mes >= 11) {
      v = { sup: base + 10, mas: base + 20, rel: null, dev: base + 30 };
    } else {
      v = { sup: base - 10, mas: base, rel: null, dev: base + 10 }; // janeiro e fevereiro
    }
    if (mes !== 3 && mes !== 9) v.rel = null;
    return v;
  }

  // ---------- configuração (navegador + arquivo no computador) ----------
  const KEY = 'branches.config';
  function lerConfig() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function guardarConfig(c) {
    try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {}
  }
  function normalizarVersoes(v) {
    if (!v || typeof v !== 'object') return null;
    const n = (x) => (x === null || x === undefined || String(x).trim() === '' ? null : String(parseInt(x, 10)));
    const r = { sup: n(v.sup), mas: n(v.mas), rel: n(v.rel), dev: n(v.dev) };
    return r.sup && r.mas && r.dev ? r : null;
  }
  // Fica com o mais recente entre o navegador e o arquivo.
  function mesclarConfig(outra) {
    if (!outra || typeof outra !== 'object') return false;
    const c = lerConfig();
    if ((outra.em || 0) <= (c.em || 0)) return false;
    guardarConfig({ versoes: normalizarVersoes(outra.versoes) || c.versoes || null, ultimos: outra.ultimos || c.ultimos || {}, em: outra.em || 0 });
    return true;
  }
  function persistir(mudancas) {
    const c = Object.assign(lerConfig(), mudancas, { em: Date.now() });
    guardarConfig(c);
    gravarArquivo();
  }

  // ---------- arquivo no computador (File System Access API: Chrome/Edge) ----------
  const suportaArquivo = 'showSaveFilePicker' in window && 'indexedDB' in window;
  const ARQ_KEY = 'branches.arquivoConfig';
  let arq = null, arqOk = false, filaEscrita = Promise.resolve();

  function idb(modo, fn) {
    return new Promise((res, rej) => {
      const r = indexedDB.open('ferramentasdev', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('kv'); };
      r.onerror = () => rej(r.error);
      r.onsuccess = () => {
        let tx, req;
        try { tx = r.result.transaction('kv', modo); req = fn(tx.objectStore('kv')); }
        catch (e) { r.result.close(); rej(e); return; }
        tx.oncomplete = () => { res(req && req.result); r.result.close(); };
        tx.onerror = () => { rej(tx.error); r.result.close(); };
      };
    });
  }
  const guardarHandle = (h) => idb('readwrite', (s) => (h ? s.put(h, ARQ_KEY) : s.delete(ARQ_KEY)));
  const lerHandle = () => idb('readonly', (s) => s.get(ARQ_KEY));

  function gravarArquivo() {
    if (!arq || !arqOk) return;
    const c = lerConfig();
    const texto = JSON.stringify({ versoes: c.versoes || null, ultimos: c.ultimos || {}, em: c.em || 0 }, null, 2);
    filaEscrita = filaEscrita
      .then(() => arq.createWritable().then((w) => w.write(texto).then(() => w.close())))
      .catch(() => { arqOk = false; renderArquivo(); toast('Não foi possível gravar no arquivo. Clique em "Reconectar arquivo".'); });
  }
  function lerArquivo() {
    return arq.getFile().then((f) => f.text()).then((t) => {
      if (!t.trim()) return {};
      const d = JSON.parse(t);
      if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error('formato');
      return d;
    });
  }
  // Carrega do arquivo (o mais recente manda) e grava de volta.
  function sincronizar() {
    return lerArquivo().then((d) => {
      if (mesclarConfig(d)) aplicarConfig();
      gravarArquivo();
      renderArquivo();
    });
  }
  function permissao(pedir) {
    if (!arq) return Promise.resolve(false);
    const o = { mode: 'readwrite' };
    return arq.queryPermission(o)
      .then((p) => (p === 'granted' || !pedir ? p === 'granted' : arq.requestPermission(o).then((p2) => p2 === 'granted')))
      .then((ok) => { arqOk = ok; renderArquivo(); return ok; });
  }
  function garantirArquivo() {
    if (!arq || arqOk) return Promise.resolve();
    return permissao(true).then((ok) => { if (ok) return sincronizar(); }).catch(() => {});
  }
  function renderArquivo() {
    const st = $('statusArquivo');
    const bts = ['btnArqCriar', 'btnArqAbrir', 'btnArqReconectar', 'btnArqDesvincular'];
    if (!suportaArquivo) {
      st.className = 'status pend';
      st.textContent = 'Este navegador não permite salvar em arquivo (use Chrome ou Edge). As versões ficam salvas só neste navegador.';
      bts.forEach((b) => { $(b).hidden = true; });
      return;
    }
    const nome = arq ? arq.name : '';
    if (arq && arqOk) {
      st.className = 'status ok';
      st.textContent = 'Salvando e carregando automaticamente do arquivo "' + nome + '".';
    } else if (arq) {
      st.className = 'status pend';
      st.textContent = 'O navegador pediu confirmação para usar o arquivo "' + nome + '". Clique em "Reconectar arquivo" e permita o acesso.';
    } else {
      st.className = 'status pend';
      st.textContent = 'As versões estão salvas só neste navegador. Vincule um arquivo no computador (ex.: C:\\FerramentasDev\\versoes-branches.json) para salvar e carregar automaticamente.';
    }
    $('btnArqCriar').hidden = $('btnArqAbrir').hidden = !!arq;
    $('btnArqReconectar').hidden = !arq || arqOk;
    $('btnArqDesvincular').hidden = !arq;
  }
  function vincular(h, novo) {
    arq = h; arqOk = true;
    return guardarHandle(h).catch(() => {})
      .then(() => {
        if (novo) {
          if (!lerConfig().versoes) persistir({ versoes: versoesDosCampos() }); else gravarArquivo();
          aplicarConfig(); renderArquivo(); return;
        }
        return sincronizar();
      })
      .then(() => toast('Arquivo "' + h.name + '" vinculado.'))
      .catch(() => toast('Arquivo inválido. Escolha um .json gerado por esta ferramenta.'));
  }
  const tiposJson = [{ description: 'Configuração do Gerador de branches (.json)', accept: { 'application/json': ['.json'] } }];
  function criarArquivo() {
    window.showSaveFilePicker({ suggestedName: 'versoes-branches.json', startIn: 'documents', types: tiposJson })
      .then((h) => vincular(h, true), () => {});
  }
  function abrirArquivo() {
    window.showOpenFilePicker({ startIn: 'documents', types: tiposJson, multiple: false })
      .then((hs) => vincular(hs[0], false), () => {});
  }
  function desvincular() {
    if (!confirm('Parar de usar o arquivo "' + arq.name + '"? O arquivo não será apagado e as versões continuam neste navegador.')) return;
    arq = null; arqOk = false;
    guardarHandle(null).catch(() => {});
    renderArquivo();
  }
  function iniciarArquivo() {
    renderArquivo();
    if (!suportaArquivo) return;
    lerHandle().then((h) => {
      if (!h) return;
      arq = h;
      return permissao(false).then((ok) => { if (ok) return sincronizar(); });
    }).catch(() => renderArquivo());
  }

  // ---------- versões na tela ----------
  function preencherVersoes(v) {
    $('verSup').value = v.sup;
    $('verMas').value = v.mas;
    $('verRel').value = v.rel ?? '';
    $('verDev').value = v.dev;
  }
  function versoesDosCampos() {
    return normalizarVersoes({ sup: $('verSup').value, mas: $('verMas').value, rel: $('verRel').value, dev: $('verDev').value });
  }
  const iguais = (a, b) => !!a && !!b && a.sup === b.sup && a.mas === b.mas && a.rel === b.rel && a.dev === b.dev;

  function renderInfo() {
    const c = lerConfig();
    const atual = versoesDosCampos();
    const info = $('infoVersoes');
    if (c.versoes && iguais(atual, c.versoes)) {
      const d = c.em ? new Date(c.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
      info.textContent = 'Versões salvas' + (d ? ' em ' + d : '') + '. São carregadas sempre que a ferramenta abrir.';
    } else if (c.versoes) {
      info.textContent = 'Versões alteradas e ainda não salvas. Clique em "Salvar versões" ou gere as branches para salvar.';
    } else {
      info.textContent = 'Versões sugeridas pelo calendário deste mês. Ajuste se precisar e clique em "Salvar versões".';
    }
  }

  // Aplica a configuração salva na tela (versões e últimas escolhas).
  function aplicarConfig() {
    const c = lerConfig();
    preencherVersoes(c.versoes || versoesDoMes(new Date()));
    const u = c.ultimos || {};
    if (u.tipo && $('tipo').querySelector('option[value="' + u.tipo + '"]')) $('tipo').value = u.tipo;
    if (u.escopo && $('escopo').querySelector('option[value="' + u.escopo + '"]')) $('escopo').value = u.escopo;
    renderInfo();
  }

  function salvarVersoes() {
    const v = versoesDosCampos();
    if (!v) { mostrarErro('Informe as versões de Suporte, Master e Develop.'); return; }
    garantirArquivo().then(() => {
      persistir({ versoes: v });
      renderInfo();
      toast('Versões salvas!');
    });
  }

  // ---------- geração ----------
  function montar(jira, tipo, escopo, v) {
    return [
      ['Suporte', 'suporte', 'SUP', v.sup],
      ['Master', 'master', 'MAS', v.mas],
      ['Release', 'release', 'REL', v.rel],
      ['Develop', 'develop', 'DEV', v.dev],
    ].filter((a) => a[3]).map(([nome, minus, sigla, ver]) => {
      if (escopo === 'db') return { alvo: `${nome} (${ver})`, nome: `${tipo}/${minus}-${jira}` };
      const curta = sigla.charAt(0) + sigla.slice(1).toLowerCase();
      return { alvo: `${nome} (${curta} ${ver.slice(0, 2)})`, nome: `${tipo}/${jira}-${sigla}${ver}` };
    });
  }

  function mostrarErro(msg) { const e = $('erro'); e.textContent = msg; e.hidden = !msg; }

  let geradas = [];
  function gerar(ev) {
    ev.preventDefault();
    mostrarErro('');
    const jira = $('jira').value.trim().toUpperCase().replace(/\s+/g, '');
    if (!jira) { mostrarErro('Informe a chave do Jira (ex: DDESTOQUE-37406).'); return; }
    const v = versoesDosCampos();
    if (!v) { mostrarErro('Informe as versões de Suporte, Master e Develop.'); return; }

    const tipo = $('tipo').value, escopo = $('escopo').value;
    const c = lerConfig();
    const u = c.ultimos || {};
    if (!iguais(v, c.versoes) || u.tipo !== tipo || u.escopo !== escopo) {
      garantirArquivo().then(() => { persistir({ versoes: v, ultimos: { tipo, escopo } }); renderInfo(); });
    }

    geradas = montar(jira, tipo, escopo, v);
    const lista = $('lista');
    lista.innerHTML = '';
    geradas.forEach((b) => {
      const item = document.createElement('div');
      item.className = 'item';
      const alvo = document.createElement('span');
      alvo.className = 'alvo'; alvo.textContent = b.alvo;
      const linha = document.createElement('div');
      linha.className = 'branch';
      const nome = document.createElement('span'); nome.textContent = b.nome;
      const bt = document.createElement('button');
      bt.type = 'button'; bt.textContent = 'Copiar'; bt.title = 'Copiar nome da branch';
      bt.addEventListener('click', () => copiar(b.nome, 'Nome da branch copiado!'));
      linha.append(nome, bt);
      item.append(alvo, linha);
      lista.appendChild(item);
    });
    $('resultado').hidden = false;
  }

  function limpar() {
    $('jira').value = '';
    $('resultado').hidden = true;
    mostrarErro('');
    aplicarConfig();
    $('jira').focus();
  }

  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('on'), 2200);
  }
  async function copiar(texto, msg) {
    try {
      await navigator.clipboard.writeText(texto);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = texto; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
    toast(msg);
  }

  // ---------- eventos ----------
  $('form').addEventListener('submit', gerar);
  $('limpar').addEventListener('click', limpar);
  $('copiarTodas').addEventListener('click', () => copiar(geradas.map((b) => b.nome).join('\n'), 'Todas as branches copiadas!'));
  $('salvarVersoes').addEventListener('click', salvarVersoes);
  $('usarCalendario').addEventListener('click', () => { preencherVersoes(versoesDoMes(new Date())); renderInfo(); });
  ['verSup', 'verMas', 'verRel', 'verDev'].forEach((id) => $(id).addEventListener('input', renderInfo));
  $('btnArqCriar').addEventListener('click', criarArquivo);
  $('btnArqAbrir').addEventListener('click', abrirArquivo);
  $('btnArqReconectar').addEventListener('click', () => garantirArquivo());
  $('btnArqDesvincular').addEventListener('click', desvincular);
  // Volta para a aba: recarrega do arquivo (pode ter mudado em outra janela)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && arq && arqOk) sincronizar().catch(() => {});
  });

  aplicarConfig();
  iniciarArquivo();
})();
