// Painel da Vó: baixa dados.enc.json, descriptografa com a senha (AES-256-GCM / PBKDF2)
// e desenha os gráficos em SVG. Use ?demo para ver com dados de exemplo.
(function () {
  const $ = (id) => document.getElementById(id);
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const CHAVE_LOCAL = 'painel-vo-senha';
  const NOMES_HUMOR = { 1: 'Muito mal', 2: 'Triste', 3: 'Mais ou menos', 4: 'Bem', 5: 'Muito bem' };

  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtDia = (d) => { const [, m, dd] = d.split('-'); return `${dd}/${m}`; };
  const fmtQuando = (q) => { const [d, h] = q.split(' '); return `${fmtDia(d)} ${h || ''}`.trim(); };

  async function descriptografar(pac, senha) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveKey']);
    const chave = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: b64(pac.salt), iterations: pac.it, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['decrypt'],
    );
    const claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(pac.iv) }, chave, b64(pac.ct));
    return JSON.parse(new TextDecoder().decode(claro));
  }

  // ---------------- gráficos SVG ----------------
  function barras(el, itens, { max, meta, corMeta } = {}) {
    if (!itens.length) { el.innerHTML = '<p class="vazio">Ainda sem registros.</p>'; return; }
    const W = 640; const H = 180; const pad = { e: 28, d: 8, t: 10, b: 24 };
    const m = max || Math.max(1, ...itens.map((i) => i.valor), meta || 0);
    const bw = (W - pad.e - pad.d) / itens.length;
    const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / m);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
    [0, 0.5, 1].forEach((f) => { const v = Math.round(m * f); s += `<line x1="${pad.e}" x2="${W - pad.d}" y1="${y(v)}" y2="${y(v)}" stroke="${css('--grade')}"/><text x="${pad.e - 6}" y="${y(v) + 4}" font-size="10" text-anchor="end" fill="${css('--sutil')}">${v}</text>`; });
    itens.forEach((it, i) => {
      const x = pad.e + i * bw + bw * 0.15;
      const h = Math.max(0, (H - pad.t - pad.b) * (it.valor / m));
      s += `<rect x="${x}" y="${y(it.valor)}" width="${bw * 0.7}" height="${h}" rx="3" fill="${it.cor || css('--destaque')}"><title>${esc(it.titulo || `${it.rotulo}: ${it.valor}`)}</title></rect>`;
      if (it.ponto) s += `<circle cx="${x + bw * 0.35}" cy="${H - pad.b + 8}" r="3" fill="${css('--linha2')}"><title>tomou o remédio de dormir</title></circle>`;
      if (itens.length <= 31 && i % Math.ceil(itens.length / 8) === 0) s += `<text x="${x + bw * 0.35}" y="${H - 2}" font-size="10" text-anchor="middle" fill="${css('--sutil')}">${esc(it.rotulo)}</text>`;
    });
    if (meta) s += `<line x1="${pad.e}" x2="${W - pad.d}" y1="${y(meta)}" y2="${y(meta)}" stroke="${corMeta || css('--aviso')}" stroke-dasharray="5 4"/><text x="${W - pad.d}" y="${y(meta) - 4}" font-size="10" text-anchor="end" fill="${corMeta || css('--aviso')}">meta ${meta}</text>`;
    el.innerHTML = s + '</svg>';
  }

  function linhas(el, series, refs = []) {
    const todos = series.flatMap((s) => s.pontos);
    if (!todos.length) { el.innerHTML = '<p class="vazio">Ainda sem medições.</p>'; return; }
    const W = 640; const H = 200; const pad = { e: 34, d: 10, t: 12, b: 24 };
    const vals = todos.map((p) => p.y).concat(refs.map((r) => r.y));
    const lo = Math.floor(Math.min(...vals) * 0.9); const hi = Math.ceil(Math.max(...vals) * 1.05);
    const n = Math.max(...series.map((s) => s.pontos.length));
    const x = (i) => pad.e + (n <= 1 ? (W - pad.e - pad.d) / 2 : i * (W - pad.e - pad.d) / (n - 1));
    const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - (v - lo) / (hi - lo || 1));
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
    [lo, Math.round((lo + hi) / 2), hi].forEach((v) => { s += `<line x1="${pad.e}" x2="${W - pad.d}" y1="${y(v)}" y2="${y(v)}" stroke="${css('--grade')}"/><text x="${pad.e - 6}" y="${y(v) + 4}" font-size="10" text-anchor="end" fill="${css('--sutil')}">${v}</text>`; });
    refs.forEach((r) => { s += `<line x1="${pad.e}" x2="${W - pad.d}" y1="${y(r.y)}" y2="${y(r.y)}" stroke="${css('--alerta')}" stroke-dasharray="5 4" opacity="0.7"/><text x="${W - pad.d}" y="${y(r.y) - 4}" font-size="10" text-anchor="end" fill="${css('--alerta')}">${esc(r.rotulo)}</text>`; });
    series.forEach((se) => {
      const pts = se.pontos.map((p, i) => `${x(i)},${y(p.y)}`).join(' ');
      if (se.pontos.length > 1) s += `<polyline points="${pts}" fill="none" stroke="${se.cor}" stroke-width="2.5" stroke-linejoin="round"/>`;
      se.pontos.forEach((p, i) => { s += `<circle cx="${x(i)}" cy="${y(p.y)}" r="3.5" fill="${se.cor}"><title>${esc(`${se.nome} ${p.y} — ${p.rotulo}`)}</title></circle>`; });
    });
    const pts0 = series[0].pontos;
    [0, Math.floor(pts0.length / 2), pts0.length - 1].filter((v, i, a) => a.indexOf(v) === i && pts0[v]).forEach((i) => {
      s += `<text x="${x(i)}" y="${H - 4}" font-size="10" text-anchor="middle" fill="${css('--sutil')}">${esc(pts0[i].rotulo.split(' ')[0])}</text>`;
    });
    el.innerHTML = s + '</svg>';
  }

  // ---------------- montagem ----------------
  function ultimosDias(n, hoje) {
    const out = []; const d = new Date(`${hoje}T12:00:00Z`);
    for (let i = n - 1; i >= 0; i--) { const x = new Date(d); x.setUTCDate(d.getUTCDate() - i); out.push(x.toISOString().slice(0, 10)); }
    return out;
  }

  function desenhar(dados) {
    const hoje = dados.dias.length ? dados.dias[dados.dias.length - 1].dia : new Date().toISOString().slice(0, 10);
    const porDia = Object.fromEntries(dados.dias.map((d) => [d.dia, d]));
    const total = dados.dosesPorDia;
    $('atualizado').textContent = `Atualizado em ${new Date(dados.geradoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`;

    // KPIs (7 dias)
    const sete = ultimosDias(7, hoje).map((d) => porDia[d]).filter(Boolean);
    const media = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
    const adesao = media(sete.map((d) => Math.min(1, d.doses / total)));
    const agua = media(sete.map((d) => d.agua));
    const humores = sete.filter((d) => d.humor).map((d) => d.humor.nota);
    const hm = media(humores);
    const ultP = dados.pressao[dados.pressao.length - 1];
    const urg = dados.sintomas.filter((s) => s.urgente).length;
    const kpi = (rotulo, valor, det, classe = '') => `<div class="kpi ${classe}"><div class="rotulo">${rotulo}</div><div class="valor">${valor}</div><div class="det">${det}</div></div>`;
    $('resumo').innerHTML = [
      kpi('Remédios (7 dias)', adesao == null ? '—' : `${Math.round(adesao * 100)}%`, 'dos horários registrados', adesao != null && adesao < 0.8 ? 'ruim' : 'bom'),
      kpi('Água (média)', agua == null ? '—' : `${agua.toFixed(1)}`, `copos/dia · meta ${dados.metaAgua}`, agua != null && agua < dados.metaAgua * 0.6 ? 'ruim' : 'bom'),
      kpi('Humor (média)', hm == null ? '—' : NOMES_HUMOR[Math.round(hm)], hm == null ? 'sem respostas' : `${hm.toFixed(1)} de 5`, hm != null && hm < 3 ? 'ruim' : 'bom'),
      kpi('Última pressão', ultP ? `${ultP.s}/${ultP.d}` : '—', ultP ? fmtQuando(ultP.quando) : 'sem medições', ultP && (ultP.s >= 140 || ultP.d >= 90) ? 'ruim' : ''),
      kpi('Alertas', String(urg), 'sintomas urgentes no período', urg ? 'ruim' : 'bom'),
    ].join('');

    // Mapa de humor (12 semanas, linhas = dias da semana)
    const cores = { 1: css('--h1'), 2: css('--h2'), 3: css('--h3'), 4: css('--h4'), 5: css('--h5') };
    const dias84 = ultimosDias(84, hoje);
    const inicio = new Date(`${dias84[0]}T12:00:00Z`).getUTCDay();
    let mapa = '';
    ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'].forEach((n) => { mapa += `<div class="rot">${n}</div>`; });
    for (let i = 0; i < inicio; i++) mapa += '<div></div>';
    dias84.forEach((d) => {
      const h = porDia[d] && porDia[d].humor;
      const t = h ? `${fmtDia(d)}: ${NOMES_HUMOR[h.nota]}${h.texto ? ` — "${h.texto}"` : ''}` : `${fmtDia(d)}: sem resposta`;
      mapa += `<div class="cel" style="${h ? `background:${cores[h.nota]}` : ''}" title="${esc(t)}"></div>`;
    });
    $('mapa-humor').innerHTML = mapa;
    $('legenda-humor').innerHTML = [5, 4, 3, 2, 1].map((n) => `<span><i style="background:${cores[n]}"></i>${NOMES_HUMOR[n]}</span>`).join('') + `<span><i style="background:${css('--vazio')}"></i>Sem resposta</span>`;

    // Remédios e água (30 dias)
    const d30 = ultimosDias(30, hoje);
    barras($('graf-remedios'), d30.map((d) => {
      const x = porDia[d] || { doses: 0, dormir: 0 };
      const ok = x.doses >= total;
      return { rotulo: fmtDia(d), valor: x.doses, ponto: x.dormir, cor: ok ? css('--destaque') : x.doses ? css('--aviso') : css('--vazio'), titulo: `${fmtDia(d)}: ${x.doses} de ${total} horários${x.dormir ? ' + remédio de dormir' : ''}` };
    }), { max: total, meta: total, corMeta: css('--destaque') });
    $('esquecidos').innerHTML = dados.esquecidos.length
      ? dados.esquecidos.map((e) => `<li><span>${esc(e.texto)}</span><span class="selo alerta">${e.vezes}x</span></li>`).join('')
      : '<li><span class="sutil">Nenhum esquecimento registrado.</span></li>';
    barras($('graf-agua'), d30.map((d) => {
      const c = (porDia[d] || {}).agua || 0;
      return { rotulo: fmtDia(d), valor: c, cor: c >= dados.metaAgua ? css('--destaque') : css('--linha2') };
    }), { meta: dados.metaAgua });

    // Pressão e glicose
    const p = dados.pressao.slice(-40);
    linhas($('graf-pressao'), [
      { nome: 'máxima', cor: css('--linha'), pontos: p.map((x) => ({ y: x.s, rotulo: fmtQuando(x.quando) })) },
      { nome: 'mínima', cor: css('--linha2'), pontos: p.map((x) => ({ y: x.d, rotulo: fmtQuando(x.quando) })) },
    ], p.length ? [{ y: 140, rotulo: '140' }, { y: 90, rotulo: '90' }] : []);
    const g = dados.glicose.slice(-40);
    linhas($('graf-glicose'), [{ nome: 'glicose', cor: css('--linha'), pontos: g.map((x) => ({ y: x.valor, rotulo: fmtQuando(x.quando) })) }], g.length ? [{ y: 70, rotulo: '70' }, { y: 180, rotulo: '180' }] : []);

    // Listas
    const sono = ultimosDias(14, hoje).reverse().map((d) => porDia[d] && porDia[d].sono ? `<li><span>${esc(porDia[d].sono)}</span><span class="quando">${fmtDia(d)}</span></li>` : '').join('');
    $('sono').innerHTML = sono || '<li><span class="sutil">Sem relatos de sono.</span></li>';
    $('sintomas').innerHTML = dados.sintomas.length
      ? dados.sintomas.slice(0, 30).map((s) => `<li><span class="${s.urgente ? 'urgente' : ''}">${esc(s.descricao)}</span><span class="quando">${fmtQuando(s.quando)}</span></li>`).join('')
      : '<li><span class="sutil">Nenhum sintoma relatado.</span></li>';
    $('observacoes').innerHTML = dados.observacoes.length
      ? dados.observacoes.slice(0, 40).map((o) => `<li><span><span class="selo">${esc(o.tipo)}</span> ${esc(o.texto)}</span><span class="quando">${fmtQuando(o.quando)}</span></li>`).join('')
      : '<li><span class="sutil">Sem observações.</span></li>';

    $('tela-senha').hidden = true;
    $('painel').hidden = false;
    $('sair').hidden = false;
  }

  // ---------------- dados de exemplo (?demo) ----------------
  function demo() {
    const hoje = new Date().toISOString().slice(0, 10);
    const r = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    const dias = ultimosDias(90, hoje).map((d) => ({
      dia: d, doses: Math.random() < 0.7 ? 6 : r(3, 5), dormir: Math.random() < 0.9 ? 1 : 0, agua: r(3, 9),
      humor: Math.random() < 0.8 ? { nota: r(2, 5), texto: ['tô bem graças a deus', 'mais ou menos', 'aperreada', 'feliz'][r(0, 3)] } : null,
      sono: ['bem', 'mal / acordei de madrugada', 'que nem uma pedra', 'pouco'][r(0, 3)], esquecimentos: [], atrasoMedio: r(0, 40),
    }));
    return {
      geradoEm: new Date().toISOString(), nome: 'Vó', metaAgua: 8, dosesPorDia: 6, dias,
      pressao: dias.filter((_, i) => i % 3 === 0).map((d) => ({ quando: `${d.dia} 09:00`, s: r(115, 150), d: r(70, 95) })),
      glicose: dias.filter((_, i) => i % 5 === 0).map((d) => ({ quando: `${d.dia} 07:30`, valor: r(85, 160) })),
      sintomas: [{ quando: `${hoje} 15:20`, descricao: 'tontura ao levantar', urgente: 0 }, { quando: `${hoje} 10:02`, descricao: 'dor no peito', urgente: 1 }],
      observacoes: [{ quando: `${hoje} 15:05`, tipo: 'outro', texto: 'foi à missa, comeu pouco' }, { quando: `${hoje} 08:40`, tipo: 'esquecimento', texto: 'remédio 10:00: Magnésio' }],
      esquecidos: [{ texto: 'remédio 10:00: Magnésio', vezes: 6 }, { texto: 'remédio 16:00: Magnésio', vezes: 3 }],
    };
  }

  // ---------------- fluxo ----------------
  async function abrir(senha, lembrar) {
    $('erro').hidden = true;
    try {
      const resp = await fetch(`dados.enc.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!resp.ok) throw new Error('sem-dados');
      const dados = await descriptografar(await resp.json(), senha);
      try { if (lembrar) localStorage.setItem(CHAVE_LOCAL, senha); } catch (e) { /* sem storage */ }
      desenhar(dados);
    } catch (e) {
      $('erro').textContent = e.message === 'sem-dados'
        ? 'Ainda não há dados publicados. Eles aparecem depois da primeira conversa da vó com a Alexa.'
        : 'Senha incorreta.';
      $('erro').hidden = false;
    }
  }

  $('form-senha').addEventListener('submit', (ev) => { ev.preventDefault(); abrir($('senha').value, $('lembrar').checked); });
  $('sair').addEventListener('click', () => { try { localStorage.removeItem(CHAVE_LOCAL); } catch (e) { /* */ } location.reload(); });

  if (new URLSearchParams(location.search).has('demo')) { desenhar(demo()); $('atualizado').textContent += ' · DADOS DE EXEMPLO'; return; }
  let salva = null;
  try { salva = localStorage.getItem(CHAVE_LOCAL); } catch (e) { /* */ }
  if (salva) abrir(salva, true);
})();
