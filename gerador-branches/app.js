// Gerador de branches - Winthor
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);

  // ---------- regras por tipo de rotina ----------
  const NOMES_VERSAO = { SUP: 'Suporte', MAS: 'Master', REL: 'Release', DEV: 'Develop' };
  const LINK_ADMDB = 'https://totvstfs.visualstudio.com/Linha-Winthor/_git/ADMDB-plsql';
  const TIPOS = {
    delphi: {
      dirPadrao: 'C:\\FontesGit',
      versoes: ['SUP', 'MAS', 'REL', 'DEV'],
      base: { SUP: (v) => 'support/' + v.sup, MAS: () => 'main', REL: (v) => 'release/' + v.rel, DEV: () => 'develop' },
      pman: true,
    },
    admdb: {
      dirPadrao: 'C:\\FontesGit',
      versoes: ['SUP', 'MAS', 'REL', 'DEV'],
      base: { SUP: () => 'suporte', MAS: () => 'master', REL: () => 'release', DEV: () => 'develop' },
      linkFixo: LINK_ADMDB,
      prefixoBase: true, // feature/master-DDESTOQUE-123_Descricao
    },
    java: {
      dirPadrao: 'C:\\pcsist\\produtos\\RotinasJava',
      versoes: ['MAS', 'REL', 'DEV'],
      base: { MAS: () => 'master', REL: (v) => 'release/' + v.rel, DEV: () => 'develop' },
    },
    apps: {
      dirPadrao: 'C:\\pcsist\\produtos\\RotinasJava',
      versoes: ['MAS', 'REL', 'DEV'],
      base: { MAS: () => 'master', REL: (v) => 'release/' + v.rel, DEV: () => 'develop' },
    },
  };
  const PADRAO_VERSOES = { delphi: { sup: '37.0', rel: '39.0' }, java: { rel: '39.0' }, apps: { rel: '39.0' }, admdb: {} };

  // "37" / "37.0" / "37,0" -> "37.0"; inválido -> null
  function normVersao(s) {
    s = String(s || '').trim().replace(',', '.');
    const m = s.match(/^(\d{1,3})(?:\.(\d{1,2}))?$/);
    return m ? m[1] + '.' + (m[2] || '0') : null;
  }
  function somarVersao(v, n) {
    const m = String(v || '').match(/^(\d+)\.(\d+)$/);
    return m ? (parseInt(m[1], 10) + n) + '.' + m[2] : '';
  }
  function limparDescricao(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, ' ').trim().replace(/\s+/g, '_');
  }
  const normJira = (s) => String(s || '').trim().toUpperCase().replace(/\s+/g, '');

  // ---------- configuração (navegador + arquivo no computador) ----------
  const KEY = 'branches.config.v2';
  function lerConfig() {
    let c = {};
    try { c = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { c = {}; }
    c.tipos = c.tipos || {};
    Object.keys(TIPOS).forEach((t) => { c.tipos[t] = Object.assign({}, PADRAO_VERSOES[t], { dir: '' }, c.tipos[t] || {}); });
    c.ultimos = c.ultimos || {};
    if (!TIPOS[c.tipoRotina]) c.tipoRotina = 'delphi';
    return c;
  }
  function guardarConfig(c) {
    try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {}
  }
  function paraArquivo(c) {
    return { tipoRotina: c.tipoRotina, tipos: c.tipos, ultimos: c.ultimos, em: c.em || 0 };
  }
  // Fica com o mais recente entre o navegador e o arquivo.
  function mesclarConfig(outra) {
    if (!outra || typeof outra !== 'object' || !outra.tipos) return false;
    const c = lerConfig();
    if ((outra.em || 0) <= (c.em || 0)) return false;
    const n = { tipoRotina: TIPOS[outra.tipoRotina] ? outra.tipoRotina : c.tipoRotina, tipos: {}, ultimos: Object.assign({}, c.ultimos, outra.ultimos || {}), em: outra.em };
    Object.keys(TIPOS).forEach((t) => {
      const o = (outra.tipos && outra.tipos[t]) || {};
      n.tipos[t] = { dir: typeof o.dir === 'string' ? o.dir : c.tipos[t].dir };
      ['sup', 'rel'].forEach((k) => { if (k in c.tipos[t] || k in o) n.tipos[t][k] = normVersao(o[k]) || c.tipos[t][k]; });
    });
    guardarConfig(n);
    return true;
  }
  function persistir(fn) {
    const c = lerConfig();
    fn(c);
    c.em = Date.now();
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
    const texto = JSON.stringify(paraArquivo(lerConfig()), null, 2);
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
      st.textContent = 'Este navegador não permite salvar em arquivo (use Chrome ou Edge). A configuração fica salva só neste navegador.';
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
      st.textContent = 'A configuração está salva só neste navegador. Vincule um arquivo no computador (ex.: C:\\FerramentasDev\\config-branches.json) para salvar e carregar automaticamente.';
    }
    $('btnArqCriar').hidden = $('btnArqAbrir').hidden = !!arq;
    $('btnArqReconectar').hidden = !arq || arqOk;
    $('btnArqDesvincular').hidden = !arq;
  }
  function vincular(h, novo) {
    arq = h; arqOk = true;
    return guardarHandle(h).catch(() => {})
      .then(() => {
        if (novo) { salvarTela(); renderArquivo(); return; }
        return sincronizar();
      })
      .then(() => toast('Arquivo "' + h.name + '" vinculado.'))
      .catch(() => toast('Arquivo inválido. Escolha um .json gerado por esta ferramenta.'));
  }
  const tiposJson = [{ description: 'Configuração do Gerador de branches (.json)', accept: { 'application/json': ['.json'] } }];
  function criarArquivo() {
    window.showSaveFilePicker({ suggestedName: 'config-branches.json', startIn: 'documents', types: tiposJson })
      .then((h) => vincular(h, true), () => {});
  }
  function abrirArquivo() {
    window.showOpenFilePicker({ startIn: 'documents', types: tiposJson, multiple: false })
      .then((hs) => vincular(hs[0], false), () => {});
  }
  function desvincular() {
    if (!confirm('Parar de usar o arquivo "' + arq.name + '"? O arquivo não será apagado e a configuração continua neste navegador.')) return;
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

  // ---------- tela ----------
  const tipoAtual = () => $('tipoRotina').value;
  const def = () => TIPOS[tipoAtual()];
  const marcadas = () => def().versoes.filter((s) => { const c = $('chk' + s); return c && c.checked; });

  function renderChecks() {
    const box = $('checksVersoes');
    box.innerHTML = '';
    def().versoes.forEach((s) => {
      const l = document.createElement('label');
      l.className = 'chk';
      const c = document.createElement('input');
      c.type = 'checkbox'; c.id = 'chk' + s; c.checked = true;
      c.addEventListener('change', renderCamposVersao);
      l.append(c, document.createTextNode(' ' + NOMES_VERSAO[s] + ' (' + s + ')'));
      box.appendChild(l);
    });
  }
  function renderCamposVersao() {
    const t = tipoAtual(), m = marcadas();
    const pedeSup = t === 'delphi' && m.includes('SUP');
    const pedeRel = t !== 'admdb' && m.includes('REL');
    $('boxSup').hidden = !pedeSup;
    $('boxRel').hidden = !pedeRel;
    $('camposVersao').hidden = !pedeSup && !pedeRel;
    $('baseSup').textContent = normVersao($('verSup').value) || '?';
    $('baseRel').textContent = normVersao($('verRel').value) || '?';
    atualizarPrevia();
  }
  function renderDescricao() {
    const d = limparDescricao($('descricao').value);
    $('previaDesc').textContent = d ? 'No nome da branch: ' + d : 'Acentos e símbolos são removidos e os espaços viram "_".';
  }
  function pastaEfetiva() { return $('pasta').value.trim().replace(/[\\/]+$/, '') || def().dirPadrao; }
  function nomeRepo(link) {
    const m = String(link || '').trim().replace(/\/+$/, '').replace(/\.git$/i, '').match(/([^/]+)$/);
    return m ? m[1] : '';
  }
  function atualizarPrevia() {
    const jira = normJira($('jira').value) || 'DEMANDA';
    const repo = nomeRepo($('link').value) || 'ROTINA';
    const m = marcadas();
    $('previaPasta').textContent = 'Estrutura: ' + pastaEfetiva() + '\\' + jira + '\\' + (m.length ? m.join('|') : 'VERSÃO') + '\\' + repo;
    estadoBotoes();
  }

  // Aplica a configuração salva (tipo de rotina, versões, pasta e últimas escolhas).
  function aplicarConfig() {
    const c = lerConfig();
    if ($('tipoRotina').value !== c.tipoRotina) { $('tipoRotina').value = c.tipoRotina; renderChecks(); }
    aplicarTipo(c);
    const u = c.ultimos;
    if (u.tarefa && $('tarefa').querySelector('option[value="' + u.tarefa + '"]')) $('tarefa').value = u.tarefa;
    if (typeof u.push === 'boolean') $('push').checked = u.push;
    if (typeof u.pman === 'boolean') $('pman').checked = u.pman;
  }
  function aplicarTipo(c) {
    c = c || lerConfig();
    const t = tipoAtual(), cfg = c.tipos[t], d = def();
    $('verSup').value = cfg.sup || '';
    $('verRel').value = cfg.rel || '';
    $('dicaRel').firstChild.textContent = t === 'delphi' ? 'Sugestão: 2 acima do support. Base: release/' : 'Base: release/';
    $('pasta').value = cfg.dir || '';
    $('pasta').placeholder = d.dirPadrao;
    $('dicaPasta').textContent = 'Padrão: ' + d.dirPadrao + ' (criada se não existir).';
    if (d.linkFixo) {
      $('link').value = d.linkFixo; $('link').readOnly = true;
      $('dicaLink').textContent = 'ADMDB usa sempre este repositório.';
    } else {
      if ($('link').readOnly) $('link').value = '';
      $('link').readOnly = false;
      $('dicaLink').textContent = 'O botão Clone + Checkout fica ativo quando o link estiver preenchido.';
    }
    $('boxPman').hidden = !d.pman;
    renderCamposVersao();
  }

  // Lê a tela e guarda (versões e pasta do tipo atual, últimas escolhas).
  function salvarTela() {
    persistir((c) => {
      const t = tipoAtual(), cfg = c.tipos[t];
      c.tipoRotina = t;
      if ('sup' in cfg) cfg.sup = normVersao($('verSup').value) || cfg.sup;
      if ('rel' in cfg) cfg.rel = normVersao($('verRel').value) || cfg.rel;
      cfg.dir = $('pasta').value.trim();
      c.ultimos = { tarefa: $('tarefa').value, push: $('push').checked, pman: $('pman').checked };
    });
  }

  // ---------- geração ----------
  function mostrarErro(msg) { const e = $('erro'); e.textContent = msg || ''; e.hidden = !msg; }

  // Valida o formulário e devolve a lista de branches, ou null (mostrando o erro).
  function montar() {
    mostrarErro('');
    const jira = normJira($('jira').value);
    if (!/^[A-Z][A-Z0-9]*-\d+$/.test(jira)) { mostrarErro('Informe a chave do Jira no formato DDESTOQUE-37406.'); return null; }
    const desc = limparDescricao($('descricao').value);
    if (!desc) { mostrarErro('Informe a descrição do desenvolvimento.'); return null; }
    const m = marcadas();
    if (!m.length) { mostrarErro('Marque ao menos uma versão.'); return null; }
    const t = tipoAtual(), d = def();
    const v = { sup: normVersao($('verSup').value), rel: normVersao($('verRel').value) };
    if (!$('boxSup').hidden && !v.sup) { mostrarErro('Informe a versão do support (ex: 37.0).'); return null; }
    if (!$('boxRel').hidden && !v.rel) { mostrarErro('Informe a versão da release (ex: 39.0).'); return null; }
    const tarefa = $('tarefa').value;
    return {
      jira, tipo: t,
      itens: m.map((s) => ({
        sigla: s,
        nomeVersao: NOMES_VERSAO[s],
        base: d.base[s](v),
        branch: d.prefixoBase
          ? `${tarefa}/${d.base[s](v)}-${jira}_${desc}`
          : `${tarefa}/${jira}_${s}_${desc}`,
      })),
    };
  }

  let geradas = [];
  function gerar(ev) {
    if (ev) ev.preventDefault();
    const r = montar();
    if (!r) return null;
    salvarTela();
    geradas = r.itens;
    const lista = $('lista');
    lista.innerHTML = '';
    geradas.forEach((b) => {
      const item = document.createElement('div');
      item.className = 'item';
      const alvo = document.createElement('span');
      alvo.className = 'alvo'; alvo.textContent = b.nomeVersao + ' (' + b.sigla + ')';
      const base = document.createElement('span');
      base.className = 'base'; base.textContent = 'a partir de ' + b.base;
      const linha = document.createElement('div');
      linha.className = 'branch';
      const nome = document.createElement('span'); nome.textContent = b.branch;
      const bt = document.createElement('button');
      bt.type = 'button'; bt.textContent = 'Copiar'; bt.title = 'Copiar nome da branch';
      bt.addEventListener('click', () => copiar(b.branch, 'Nome da branch copiado!'));
      linha.append(nome, bt);
      item.append(alvo, base, linha);
      lista.appendChild(item);
    });
    $('resultado').hidden = false;
    return r;
  }

  function limpar() {
    $('jira').value = '';
    $('descricao').value = '';
    if (!def().linkFixo) $('link').value = '';
    $('resultado').hidden = true;
    $('listaClone').innerHTML = '';
    mostrarErro('');
    renderChecks();
    aplicarConfig();
    renderDescricao();
    $('jira').focus();
  }

  // ---------- agente local ----------
  const AGENTE = 'http://localhost:47615';
  let agente = { online: false, autorizado: false };
  let ocupado = false;

  function chamarAgente(caminho, corpo) {
    const op = corpo === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) };
    return fetch(AGENTE + caminho, op).then((r) => r.json().then((j) => {
      if (!r.ok) throw new Error(j && j.erro ? j.erro : 'HTTP ' + r.status);
      return j;
    }));
  }
  function verificarAgente() {
    return chamarAgente('/status').then((s) => {
      agente = { online: true, autorizado: !!s.autorizado, git: s.git, pman: s.pman, versao: s.versao };
    }, () => { agente = { online: false, autorizado: false }; }).then(renderAgente);
  }
  function renderAgente() {
    const st = $('statusAgente');
    $('btnAutorizar').hidden = !(agente.online && !agente.autorizado);
    $('btnIniciarAgente').hidden = agente.online;
    if (!agente.online) {
      st.className = 'status pend';
      st.textContent = 'Agente local não encontrado. Instale (passos abaixo) ou clique em "Iniciar agente" se ele já estiver instalado.';
      $('instrucoesAgente').open = true;
    } else if (!agente.autorizado) {
      st.className = 'status pend';
      st.textContent = 'Agente encontrado. Clique em "Autorizar este site no agente" e confirme a janela que vai abrir no Windows.';
    } else {
      st.className = agente.git ? 'status ok' : 'status pend';
      st.textContent = agente.git
        ? 'Agente conectado (v' + agente.versao + ', ' + agente.git + ').' + (agente.pman ? '' : ' Aviso: o comando pman não foi encontrado no PATH.')
        : 'Agente conectado, mas o git não foi encontrado no PATH do Windows.';
      $('instrucoesAgente').open = false;
    }
    estadoBotoes();
  }
  function estadoBotoes() {
    const pronto = agente.online && agente.autorizado && !ocupado;
    $('btnClonar').disabled = !pronto || !$('link').value.trim();
    $('btnListarLimpeza').disabled = !pronto;
  }
  function autorizar() {
    $('btnAutorizar').disabled = true;
    toast('Confirme a janela do agente no Windows.');
    chamarAgente('/autorizar', {}).then((r) => {
      agente.autorizado = !!r.autorizado;
      toast(r.autorizado ? 'Site autorizado no agente.' : 'Autorização recusada.');
    }, (e) => toast('Erro: ' + e.message)).then(() => { $('btnAutorizar').disabled = false; verificarAgente(); });
  }
  function iniciarAgente() {
    window.location.href = 'ferramentasdev-agente:iniciar';
    toast('Iniciando o agente…');
    setTimeout(verificarAgente, 2500);
    setTimeout(verificarAgente, 6000);
  }

  // ---------- clone + checkout ----------
  function linhaResultado(item) {
    const div = document.createElement('div');
    div.className = 'res';
    div.innerHTML = '<div class="res-cab"><span class="ico rodando">…</span><div class="res-txt"><b></b><span class="msg"></span><div class="cam"></div></div></div>';
    div.querySelector('b').textContent = item.nomeVersao + ' (' + item.sigla + ')';
    div.querySelector('.msg').textContent = 'aguardando…';
    $('listaClone').appendChild(div);
    return div;
  }
  function preencherResultado(div, r, erroRede) {
    const ico = div.querySelector('.ico');
    const ok = !erroRede && r && r.ok;
    ico.className = 'ico ' + (ok ? 'ok' : 'erro');
    ico.textContent = ok ? '✓' : '✗';
    div.querySelector('.msg').textContent = ok ? 'pronto' : (erroRede ? 'falha ao falar com o agente' : (r.erro || 'erro'));
    div.querySelector('.cam').textContent = r && r.destino ? r.destino : '';
    if (r && r.faltando && r.faltando.length) {
      const p = document.createElement('p');
      p.className = 'falta';
      p.textContent = 'Não encontrado: ' + r.faltando.join(' | ');
      div.appendChild(p);
    }
    const log = erroRede ? String(erroRede) : (r.etapas || []).map((e) => (e.ok ? '✓ ' : '✗ ') + e.etapa + (e.detalhe ? '\n' + e.detalhe.trim() : '')).join('\n\n');
    if (log) {
      const bt = document.createElement('button');
      bt.type = 'button'; bt.className = 'btn peq link'; bt.textContent = ok ? 'Ver detalhes' : 'Ver erro';
      const pre = document.createElement('pre'); pre.hidden = true; pre.textContent = log;
      bt.addEventListener('click', () => { pre.hidden = !pre.hidden; });
      div.querySelector('.res-cab').appendChild(bt);
      div.appendChild(pre);
      if (!ok) div.title = log.slice(0, 600);
    }
  }
  async function clonar() {
    const r = gerar();
    if (!r) return;
    const link = $('link').value.trim();
    if (!/^https:\/\/\S+$/i.test(link)) { toast('Informe um link de clone https válido.'); return; }
    ocupado = true; estadoBotoes();
    $('listaClone').innerHTML = '';
    const pasta = pastaEfetiva(), push = $('push').checked, pman = def().pman && $('pman').checked;
    const linhas = r.itens.map(linhaResultado);
    let okCount = 0;
    for (let i = 0; i < r.itens.length; i++) {
      const it = r.itens[i], div = linhas[i];
      div.querySelector('.msg').textContent = 'clonando ' + it.base + '…';
      try {
        const res = await chamarAgente('/clonar', {
          jira: r.jira, pastaBase: pasta, link, sigla: it.sigla, branchBase: it.base, branch: it.branch, push, pman,
        });
        preencherResultado(div, res);
        if (res.ok) okCount++;
      } catch (e) {
        preencherResultado(div, null, e.message);
      }
    }
    ocupado = false; estadoBotoes();
    toast(okCount === r.itens.length ? 'Clone + Checkout concluído.' : (r.itens.length - okCount) + ' versão(ões) com erro. Veja os detalhes.');
  }

  // ---------- limpeza ----------
  let itensLimpeza = [];
  function listarLimpeza() {
    ocupado = true; estadoBotoes();
    $('btnListarLimpeza').textContent = 'Listando…';
    chamarAgente('/limpeza/listar', { pastaBase: pastaEfetiva() }).then((r) => {
      itensLimpeza = r.itens || [];
      renderLimpeza();
    }, (e) => toast('Erro ao listar: ' + e.message)).then(() => {
      ocupado = false; estadoBotoes();
      $('btnListarLimpeza').textContent = 'Listar pastas';
    });
  }
  function renderLimpeza() {
    const box = $('listaLimpeza');
    box.innerHTML = '';
    $('boxLimpeza').hidden = false;
    if (!itensLimpeza.length) {
      box.innerHTML = '<p class="dica">Nenhum clone encontrado em pastas de demanda dentro de ' + escapar(pastaEfetiva()) + '.</p>';
      $('btnApagar').disabled = true;
      return;
    }
    itensLimpeza.forEach((it, i) => {
      const l = document.createElement('label');
      l.className = 'limp ' + (it.pendente ? 'pend' : 'ok');
      const c = document.createElement('input');
      c.type = 'checkbox'; c.dataset.i = i; c.checked = !it.pendente;
      c.addEventListener('change', estadoLimpeza);
      const txt = document.createElement('div');
      const cam = document.createElement('span'); cam.className = 'cam'; cam.textContent = it.demanda + '\\' + it.versao + '\\' + it.repo;
      const flag = document.createElement('span'); flag.className = 'flag ' + (it.pendente ? 'pend' : 'ok'); flag.textContent = it.pendente ? 'Pendente' : 'Sem pendências';
      flag.style.marginLeft = '8px';
      const det = document.createElement('span'); det.className = 'det';
      det.textContent = 'Branch: ' + (it.branch || '?') + (it.pendente ? ' · ' + it.detalhe : '');
      txt.append(cam, flag, det);
      l.append(c, txt);
      box.appendChild(l);
    });
    estadoLimpeza();
  }
  const checksLimpeza = () => Array.from($('listaLimpeza').querySelectorAll('input[type=checkbox]'));
  function estadoLimpeza() {
    const cs = checksLimpeza();
    const n = cs.filter((c) => c.checked).length;
    $('btnApagar').disabled = !n;
    $('btnApagar').textContent = n ? 'Apagar selecionadas (' + n + ')' : 'Apagar selecionadas';
    $('marcarTudo').checked = cs.length > 0 && n === cs.length;
    $('marcarTudo').indeterminate = n > 0 && n < cs.length;
  }
  function apagar() {
    const sel = checksLimpeza().filter((c) => c.checked).map((c) => itensLimpeza[+c.dataset.i]);
    if (!sel.length) return;
    const pend = sel.filter((s) => s.pendente).length;
    let msg = 'Apagar ' + sel.length + ' pasta(s) de clone? Esta ação não pode ser desfeita.';
    if (pend) msg += '\n\nATENÇÃO: ' + pend + ' delas tem alterações ou commits que NÃO foram enviados e serão perdidos.';
    if (!confirm(msg)) return;
    ocupado = true; estadoBotoes(); $('btnApagar').disabled = true;
    chamarAgente('/limpeza/apagar', { pastaBase: pastaEfetiva(), caminhos: sel.map((s) => s.caminho) }).then((r) => {
      const erros = (r.resultados || []).filter((x) => !x.ok);
      toast(erros.length ? erros.length + ' pasta(s) não puderam ser apagadas: ' + erros[0].erro : 'Pastas apagadas.');
    }, (e) => toast('Erro: ' + e.message)).then(() => { ocupado = false; listarLimpeza(); });
  }

  // ---------- utilitários ----------
  function escapar(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('on'), 3200);
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
  $('copiarTodas').addEventListener('click', () => copiar(geradas.map((b) => b.branch).join('\n'), 'Todas as branches copiadas!'));
  $('tipoRotina').addEventListener('change', () => {
    renderChecks();
    persistir((c) => { c.tipoRotina = tipoAtual(); });
    aplicarTipo();
    $('boxLimpeza').hidden = true;
  });
  $('descricao').addEventListener('input', renderDescricao);
  $('jira').addEventListener('input', atualizarPrevia);
  $('link').addEventListener('input', atualizarPrevia);
  $('pasta').addEventListener('input', atualizarPrevia);
  $('pasta').addEventListener('change', salvarTela);
  ['push', 'pman', 'tarefa'].forEach((id) => $(id).addEventListener('change', salvarTela));
  let supAnterior = '';
  $('verSup').addEventListener('focus', () => { supAnterior = normVersao($('verSup').value) || ''; });
  $('verSup').addEventListener('input', () => {
    // Delphi: a release é sugerida 2 versões acima do support, enquanto não for alterada à mão
    const sup = normVersao($('verSup').value);
    const relAtual = normVersao($('verRel').value);
    if (sup && tipoAtual() === 'delphi' && (!relAtual || relAtual === somarVersao(supAnterior, 2))) {
      $('verRel').value = somarVersao(sup, 2);
    }
    if (sup) supAnterior = sup;
    renderCamposVersao();
  });
  $('verRel').addEventListener('input', renderCamposVersao);
  ['verSup', 'verRel'].forEach((id) => $(id).addEventListener('change', () => {
    const n = normVersao($(id).value); if (n) { $(id).value = n; salvarTela(); renderCamposVersao(); }
  }));
  $('btnClonar').addEventListener('click', clonar);
  $('btnAutorizar').addEventListener('click', autorizar);
  $('btnIniciarAgente').addEventListener('click', iniciarAgente);
  $('btnVerificarAgente').addEventListener('click', verificarAgente);
  $('btnListarLimpeza').addEventListener('click', listarLimpeza);
  $('btnApagar').addEventListener('click', apagar);
  $('marcarTudo').addEventListener('change', (e) => { checksLimpeza().forEach((c) => { c.checked = e.target.checked; }); estadoLimpeza(); });
  $('btnArqCriar').addEventListener('click', criarArquivo);
  $('btnArqAbrir').addEventListener('click', abrirArquivo);
  $('btnArqReconectar').addEventListener('click', () => garantirArquivo());
  $('btnArqDesvincular').addEventListener('click', desvincular);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (arq && arqOk) sincronizar().catch(() => {});
    if (!ocupado) verificarAgente();
  });

  renderChecks();
  aplicarConfig();
  renderDescricao();
  iniciarArquivo();
  verificarAgente();
})();
