// Gerador de branches - Winthor
(function () {
  const $ = (id) => document.getElementById(id);

  // Calendário de versões (códigos numéricos, ex: 370 = 37.0).
  // Referência: março/2026 = Sup 370, Mas 380, Rel 390, Dev 400.
  // A Release só é gerada nos meses de virada (março e setembro).
  function versoesDoMes(data) {
    const ano = data.getFullYear();
    const mes = data.getMonth() + 1;
    const base = 370 + (ano - 2026) * 20;
    let v;

    if (ano === 2026 && mes === 10) {
      v = { sup: 370, mas: 380, rel: 390, dev: 400 };
    } else if (ano === 2026 && mes === 11) {
      // Após descontinuar a 370
      v = { sup: 380, mas: 390, rel: null, dev: 400 };
    } else if (mes >= 3 && mes <= 10) {
      v = { sup: base, mas: base + 10, rel: base + 20, dev: base + 30 };
    } else if (mes >= 11) {
      v = { sup: base + 10, mas: base + 20, rel: null, dev: base + 30 };
    } else {
      // Janeiro e fevereiro
      v = { sup: base - 10, mas: base, rel: null, dev: base + 10 };
    }

    if (mes !== 3 && mes !== 9) v.rel = null;
    return v;
  }

  function preencherManuais(v) {
    $('verSup').value = v.sup;
    $('verMas').value = v.mas;
    $('verRel').value = v.rel ?? '';
    $('verDev').value = v.dev;
  }

  function mostrarInfo(v) {
    const p = [`Suporte ${v.sup}`, `Master ${v.mas}`];
    if (v.rel) p.push(`Release ${v.rel}`);
    p.push(`Develop ${v.dev}`);
    $('infoVersoes').textContent = 'Versões do calendário deste mês: ' + p.join(' · ');
  }

  function versoesAtuais() {
    if (!$('manual').checked) return versoesDoMes(new Date());
    const n = (id) => { const s = $(id).value.trim(); return s === '' ? null : String(parseInt(s, 10)); };
    return { sup: n('verSup'), mas: n('verMas'), rel: n('verRel'), dev: n('verDev') };
  }

  function montar(jira, tipo, escopo, v) {
    const alvos = [
      ['Suporte', 'suporte', 'SUP', v.sup],
      ['Master', 'master', 'MAS', v.mas],
      ['Release', 'release', 'REL', v.rel],
      ['Develop', 'develop', 'DEV', v.dev],
    ].filter((a) => a[3]);

    return alvos.map(([nome, minus, sigla, ver]) => {
      ver = String(ver);
      if (escopo === 'db') {
        return { alvo: `${nome} (${ver})`, nome: `${tipo}/${minus}-${jira}` };
      }
      return { alvo: `${nome} (${sigla.charAt(0) + sigla.slice(1).toLowerCase()} ${ver.slice(0, 2)})`, nome: `${tipo}/${jira}-${sigla}${ver}` };
    });
  }

  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('on'), 1800);
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

  let geradas = [];

  function gerar(ev) {
    ev.preventDefault();
    const erro = $('erro');
    erro.hidden = true;

    const jira = $('jira').value.trim().toUpperCase().replace(/\s+/g, '');
    if (!jira) { erro.textContent = 'Informe a chave do Jira (ex: DDFINAN-37406).'; erro.hidden = false; return; }

    const v = versoesAtuais();
    if (!v.sup || !v.mas || !v.dev) {
      erro.textContent = 'Informe as versões de Suporte, Master e Develop.'; erro.hidden = false; return;
    }

    geradas = montar(jira, $('tipo').value, $('escopo').value, v);
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
    $('form').reset();
    $('boxManual').hidden = true;
    $('resultado').hidden = true;
    $('erro').hidden = true;
    preencherManuais(versoesDoMes(new Date()));
    $('jira').focus();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const v = versoesDoMes(new Date());
    preencherManuais(v);
    mostrarInfo(v);
    $('manual').addEventListener('change', (e) => {
      $('boxManual').hidden = !e.target.checked;
      if (!e.target.checked) preencherManuais(versoesDoMes(new Date()));
    });
    $('form').addEventListener('submit', gerar);
    $('limpar').addEventListener('click', limpar);
    $('copiarTodas').addEventListener('click', () => copiar(geradas.map((b) => b.nome).join('\n'), 'Todas as branches copiadas!'));
  });
})();
