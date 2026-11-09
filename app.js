(() => {
  "use strict";
  const ORIGINAL = window.ALUGO_ORIGINAL;
  const KEY = "alugo-mapa-acessos-v1";
  const clone = o => JSON.parse(JSON.stringify(o));
  const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  let state = carregar();
  let editada = state !== null;
  if (!state) state = clone(ORIGINAL);
  let editSub = "pessoas";
  let timeSel = null;
  let pessoaSel = null; // { pid, tid } — name clicked in the map
  let selecionarDepois = null; // person to highlight after the map renders (after adding someone)

  function carregar() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      return valido(s) ? s : null;
    } catch { return null; }
  }
  function valido(s) {
    return s && Array.isArray(s.pessoas) && Array.isArray(s.times) && Array.isArray(s.modulos) && s.niveis && Array.isArray(s.acoes);
  }
  function salvar() {
    editada = true;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage blocked: edits live until reload */ }
    document.getElementById("banner").hidden = !editada;
  }

  /* ---------- derived data ---------- */
  const NIVEIS = ORIGINAL.legendaNiveis;
  const PAPEIS = ORIGINAL.papeis;
  const pessoa = id => state.pessoas.find(p => p.id === id);
  const time = id => state.times.find(t => t.id === id);
  const modulo = id => state.modulos.find(m => m.id === id);
  const pasta = id => state.pastas.find(p => p.id === id);
  const lidera = pid => state.times.filter(t => t.lider === pid);
  const membros = tid => state.pessoas.filter(p => p.time === tid && time(tid)?.lider !== p.id);
  const nomeCurto = p => p ? p.nome : "";

  function papelNoTime(p, t) {
    if (t.lider === p.id) return "lider";
    return p.papel === "membro" ? "membro" : p.papel;
  }
  /** Nível final de uma pessoa num módulo (maior entre os times em que está ou que lidera). */
  function nivelPessoa(p, modId) {
    if (p.papel === "coordenador" || p.papel === "diretor" || p.papel === "admin") return state.niveis[p.papel]?.[modId] ?? 0;
    let n = 0;
    const times = [time(p.time), ...lidera(p.id)].filter(Boolean);
    for (const t of times) {
      if (!t.modulos.includes(modId) && !(modId === "acessos")) continue;
      const papel = papelNoTime(p, t);
      n = Math.max(n, state.niveis[papel]?.[modId] ?? 0);
    }
    return n;
  }
  const chip = n => `<span class="lv lv-${n}">${esc(NIVEIS[n].curto)}</span>`;
  const cell = n => `<td class="c-${n}">${chip(n)}</td>`;
  const legendaCompacta = () => `<div class="legend-mini" aria-label="Cores dos níveis">${NIVEIS.map((n, i) => chip(i)).join("")}</div>`;
  /** Como a pessoa aparece: papel e times. */
  function papelTexto(p) {
    const leads = lidera(p.id);
    const nomes = ts => ts.map(t => t.curto || t.nome).join(" e ");
    if (p.papel === "coordenador" || p.papel === "diretor" || p.papel === "admin") {
      const pp = PAPEIS.find(x => x.id === p.papel)?.nome || p.papel;
      return leads.length ? `${pp} · ${nomes(leads)}` : pp;
    }
    if (leads.length) {
      const t = time(p.time);
      const extra = t && !leads.includes(t) ? `; membro de ${t.curto || t.nome}` : "";
      return `Líder de ${nomes(leads)}${extra}`;
    }
    const t = time(p.time);
    return t ? `Membro de ${t.curto || t.nome}` : "Sem time";
  }

  /* ---------- tabs ---------- */
  const TABS = ["mapa", "permissoes", "validacao", "editar"];
  function tabAtual() {
    const h = location.hash.replace("#", "");
    return TABS.includes(h) ? h : "mapa";
  }
  function mostrar() {
    const t = tabAtual();
    TABS.forEach(id => {
      document.getElementById("tab-" + id).hidden = id !== t;
      document.querySelector(`.tabs a[data-tab="${id}"]`).setAttribute("aria-selected", id === t ? "true" : "false");
    });
    document.getElementById("banner").hidden = !editada;
    ({ mapa: renderMapa, permissoes: renderPermissoes, validacao: renderValidacao, editar: renderEditar })[t]();
  }
  window.addEventListener("hashchange", mostrar);

  /* ---------- Mapa ---------- */
  function renderMapa() {
    const el = document.getElementById("tab-mapa");
    const areas = state.pastas.map(pa => {
      const ts = state.times.filter(t => t.pasta === pa.id);
      if (!ts.length) return "";
      return `<div class="pasta"><div class="lbl">${esc(pa.nome)}</div>${ts.map(teamCard).join("")}</div>`;
    }).join("");
    const mods = state.modulos.map(m => {
      const usam = state.times.filter(t => t.modulos.includes(m.id));
      const tags = m.todos ? `<span>Todos os times</span>` : usam.length ? usam.map(t => `<span>${esc(t.curto || t.nome)}</span>`).join("") : `<span class="none">${esc(m.semTime || "Só admin")}</span>`;
      return `<div class="mod" data-mod="${esc(m.id)}"><b>${esc(m.nome)}</b><span class="scr">${esc(m.telas)}</span><div class="chips">${tags}</div></div>`;
    }).join("");
    const outros = ORIGINAL.outrosPaineis.map(o => `<div class="box ext"><b>${esc(o.nome)}</b><span>${esc(o.quem)}</span></div>`).join("");
    const ints = ORIGINAL.integracoes.map(o => `<div class="box int"><b>${esc(o.nome)}</b><span>${esc(o.uso)}</span></div>`).join("");
    el.innerHTML = `
      <div class="intro"><h1>Áreas da empresa e o que o ERP controla</h1>
      <p>À esquerda, as pastas, os times e quem trabalha em cada um. No meio, os módulos do painel do operador. À direita, os outros painéis e os serviços de fora. Clique no nome de um time para ver os módulos que ele usa, ou no nome de uma pessoa (líder ou membro) para ver o nível dela em cada módulo, nas cores abaixo.</p></div>
      ${legendaCompacta()}
      <div class="board" id="board"><svg id="links" aria-hidden="true"></svg>
        <div class="lane"><div class="lane-title">Áreas da empresa</div>${areas}</div>
        <div class="lane"><div class="lane-title">O que o ERP controla</div>
          <div class="erp"><div class="erp-head"><b>Painel do Operador</b><span>O admin acessa tudo</span></div>
          <div class="mods">${mods}</div>
          <div class="base"><b>Base única:</b> banco de dados, funções no servidor e login com sessão. Todos os painéis usam essa mesma base.</div></div></div>
        <div class="lane"><div class="lane-title">Outros painéis</div>${outros}<div class="lane-title" style="margin-top:8px">Serviços de fora</div>${ints}</div>
      </div>
      <p class="muted">Ligações e nomes conforme ${esc(state.fonte)}.</p>`;
    timeSel = null;
    pessoaSel = null;
    el.querySelectorAll(".team-head").forEach(b => b.addEventListener("click", () => selecionarTime(b.closest(".team").dataset.team)));
    el.querySelectorAll(".pname").forEach(b => b.addEventListener("click", () => selecionarPessoa(b.dataset.p, b.closest(".team").dataset.team)));
    if (selecionarDepois) {
      const s = selecionarDepois; selecionarDepois = null;
      selecionarPessoa(s.pid, s.tid);
      el.querySelector(`.team[data-team="${s.tid}"]`)?.scrollIntoView({ block: "center" });
    }
  }
  function teamCard(t) {
    const l = pessoa(t.lider);
    const nome = p => `<button type="button" class="pname" data-p="${esc(p.id)}" aria-pressed="false">${esc(p.nome)}${p.pendente ? " <i>(a confirmar)</i>" : ""}</button>`;
    const ms = membros(t.id);
    const lider = l ? `<span class="lead-name">${nome(l)}<small>${l.papel === "coordenador" ? "coordenador" : "líder"}</small></span>` : t.semLider ? "" : `<span class="lead-name"><i>líder a definir</i></span>`;
    const gente = ms.length ? `<span class="members">${ms.map(nome).join("")}</span>` : l ? "" : `<span class="members empty">Sem membros</span>`;
    const qtd = t.modulos.length ? `<span>${t.modulos.length} ${t.modulos.length === 1 ? "módulo" : "módulos"}</span>` : "";
    return `<div class="team" data-team="${esc(t.id)}"><button class="team-head" type="button"><b>${esc(t.nome)}</b>${qtd}</button>${lider}${gente}${t.painel ? `<span class="goes">${esc(t.painel)}</span>` : ""}<div class="pdetail" hidden></div></div>`;
  }
  function limparPessoa(board) {
    pessoaSel = null;
    board.classList.remove("selp");
    board.querySelectorAll(".pname").forEach(b => b.setAttribute("aria-pressed", "false"));
    board.querySelectorAll(".pdetail").forEach(d => { d.hidden = true; d.innerHTML = ""; });
    board.querySelectorAll(".mod").forEach(m => { delete m.dataset.lv; m.querySelector(".plv")?.remove(); });
  }
  function limparTime(board) {
    timeSel = null;
    board.classList.remove("sel");
    board.querySelectorAll(".team").forEach(el => el.classList.remove("on"));
    board.querySelectorAll(".mod").forEach(m => m.classList.remove("on"));
  }
  function selecionarPessoa(pid, tid) {
    const board = document.getElementById("board");
    const mesmo = pessoaSel && pessoaSel.pid === pid && pessoaSel.tid === tid;
    limparTime(board);
    limparPessoa(board);
    const p = pessoa(pid);
    if (mesmo || !p) { desenharLinhas(); return; }
    pessoaSel = { pid, tid };
    const card = board.querySelector(`.team[data-team="${tid}"]`);
    card.querySelector(`.pname[data-p="${pid}"]`)?.setAttribute("aria-pressed", "true");
    board.classList.add("selp");
    const lista = state.modulos.map(m => ({ m, n: m.todos ? null : nivelPessoa(p, m.id) }));
    board.querySelectorAll(".mod").forEach(el => {
      const it = lista.find(x => x.m.id === el.dataset.mod);
      if (!it) return;
      const n = it.n ?? 1;
      el.dataset.lv = n;
      el.insertAdjacentHTML("afterbegin", `<span class="plv">${it.n === null ? `<span class="lv lv-1">Todos veem</span>` : chip(n)}</span>`);
    });
    const com = lista.filter(x => x.n > 0);
    const sem = lista.filter(x => x.n === 0);
    const todos = lista.filter(x => x.n === null);
    const det = card.querySelector(".pdetail");
    det.innerHTML = `
      <div class="pd-head"><b>${esc(p.nome)}</b><span>${esc(papelTexto(p))}</span></div>
      ${com.length ? `<ul class="pd-list">${com.map(x => `<li><span>${esc(x.m.nome)}</span>${chip(x.n)}</li>`).join("")}</ul>` : `<p class="pd-sem">Sem acesso a nenhum módulo do painel do operador.</p>`}
      ${sem.length ? `<p class="pd-sem"><span class="lv lv-0">Sem acesso</span> ${sem.map(x => esc(x.m.curto || x.m.nome)).join(", ")}</p>` : ""}
      ${todos.length ? `<p class="pd-sem">${todos.map(x => esc(x.m.nome)).join(", ")}: liberado para todos.</p>` : ""}`;
    det.hidden = false;
    desenharLinhas();
  }
  function selecionarTime(id) {
    const board = document.getElementById("board");
    limparPessoa(board);
    timeSel = timeSel === id ? null : id;
    board.querySelectorAll(".team").forEach(el => el.classList.toggle("on", el.dataset.team === timeSel));
    board.classList.toggle("sel", !!timeSel);
    const mods = timeSel ? time(timeSel).modulos : [];
    board.querySelectorAll(".mod").forEach(m => m.classList.toggle("on", mods.includes(m.dataset.mod)));
    desenharLinhas();
  }
  function desenharLinhas() {
    const svg = document.getElementById("links");
    if (!svg) return;
    svg.innerHTML = "";
    if ((!timeSel && !pessoaSel) || getComputedStyle(svg).display === "none") return;
    const board = document.getElementById("board");
    const b = board.getBoundingClientRect();
    let x1, y1, alvos;
    if (pessoaSel) {
      const card = board.querySelector(`.team[data-team="${pessoaSel.tid}"]`);
      const btn = card?.querySelector(`.pname[data-p="${pessoaSel.pid}"]`);
      const p = pessoa(pessoaSel.pid);
      if (!card || !btn || !p) return;
      const c = card.getBoundingClientRect(), r = btn.getBoundingClientRect();
      x1 = c.right - b.left; y1 = r.top + r.height / 2 - b.top;
      alvos = state.modulos.filter(m => !m.todos).map(m => ({ id: m.id, n: nivelPessoa(p, m.id) })).filter(a => a.n > 0);
    } else {
      const t = board.querySelector(`.team[data-team="${timeSel}"]`).getBoundingClientRect();
      x1 = t.right - b.left; y1 = t.top + t.height / 2 - b.top;
      alvos = time(timeSel).modulos.map(id => ({ id, n: 0 }));
    }
    alvos.forEach(({ id, n }) => {
      const node = board.querySelector(`.mod[data-mod="${id}"]`);
      if (!node) return;
      const m = node.getBoundingClientRect();
      const x2 = m.left - b.left - 2, y2 = m.top + Math.min(22, m.height / 2) - b.top;
      const dx = Math.max(40, (x2 - x1) / 2);
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`);
      if (n) p.setAttribute("class", `lvp-${n}`);
      svg.appendChild(p);
    });
  }
  window.addEventListener("resize", desenharLinhas);

  /* ---------- Permissões ---------- */
  function renderPermissoes() {
    const el = document.getElementById("tab-permissoes");
    const legenda = NIVEIS.map((n, i) => `<div class="item">${chip(i)}<span>${esc(n.descricao)}</span></div>`).join("");
    const colMods = state.modulos.filter(m => !m.todos);
    const head = colMods.map(m => `<th scope="col">${esc(m.curto || m.nome)}</th>`).join("");
    const papeisRows = PAPEIS.map(pp => `<tr><th scope="row">${esc(pp.nome)}<small>${esc(pp.escopo)}</small></th>${colMods.map(m => cell(state.niveis[pp.id]?.[m.id] ?? 0)).join("")}</tr>`).join("");

    const pessoasRows = state.times.map(t => {
      const gente = [pessoa(t.lider), ...membros(t.id)].filter(Boolean).filter(p => p.time === t.id || t.lider === p.id);
      const uniq = [...new Set(gente)];
      if (!uniq.length) return "";
      return `<tr class="grp"><th colspan="${colMods.length + 1}">${esc(t.nome)}</th></tr>` + uniq.map(p => {
        const papel = t.lider === p.id ? (p.papel === "coordenador" ? "Coordenador" : "Líder") : PAPEIS.find(x => x.id === p.papel)?.nome || "Membro";
        return `<tr><th scope="row">${esc(p.nome)}<small>${esc(papel)}</small></th>${colMods.map(m => cell(nivelPessoa(p, m.id))).join("")}</tr>`;
      }).join("");
    }).join("");

    const acoes = state.acoes.map(a => `<tr><th scope="row">${esc(a.acao)}<small>${esc(modulo(a.modulo)?.nome || a.modulo)}</small></th><td>${esc(a.quem)}</td><td>${a.hoje ? esc(a.hoje) : `<span class="muted">—</span>`}</td></tr>`).join("");

    el.innerHTML = `
      <div class="intro"><h1>Nível de permissão</h1>
      <p>O time decide quais módulos a pessoa usa. O papel decide o que ela pode fazer dentro deles: só ver, operar o dia a dia, gerenciar (excluir, cancelar e aprovar) ou tudo. Algumas ações sensíveis têm regra própria, listada no fim.</p></div>
      <div class="legend">${legenda}</div>
      <h2>Por papel</h2>
      <p class="muted">Vale só nos módulos que o time da pessoa usa. Coordenador e diretor veem o resumo dos times, sem o detalhe de cada pessoa.</p>
      <div class="table-wrap"><table class="matrix"><thead><tr><th scope="col">Papel</th>${head}</tr></thead><tbody>${papeisRows}</tbody></table></div>
      <h2>Por pessoa</h2>
      <p class="muted">Resultado da regra acima para cada pessoa, no time em que ela está no desenho.</p>
      <div class="table-wrap"><table class="matrix"><thead><tr><th scope="col">Pessoa</th>${head}</tr></thead><tbody>${pessoasRows}</tbody></table></div>
      <h2>Ações sensíveis</h2>
      <p class="muted">Essas ações têm dono definido, independente do nível no módulo. A coluna "Hoje" mostra o que o sistema faz agora.</p>
      <div class="table-wrap"><table><thead><tr><th scope="col">Ação</th><th scope="col">Quem pode (proposta)</th><th scope="col">Hoje no sistema</th></tr></thead><tbody>${acoes}</tbody></table></div>`;
  }

  /* ---------- Validação ---------- */
  function validar() {
    const itens = [];
    const S = state.sistema;
    const setorLabel = s => ORIGINAL.setores[s] || (s ? s : "sem setor");
    const flagLabel = f => ORIGINAL.flagNome[f] || f;
    for (const p of state.pessoas) {
      const sys = S[p.id];
      const t = time(p.time);
      if (!sys) { itens.push({ p, sev: "bad", txt: "Não existe no sistema como operador ativo." }); continue; }
      const leads = lidera(p.id);
      for (const lt of leads) {
        if (lt.setorSistema && sys.lider !== lt.setorSistema) itens.push({ p, sev: "bad", txt: `No desenho lidera ${lt.nome}, mas no sistema não é líder desse time.` });
      }
      if (sys.lider && !leads.some(lt => lt.setorSistema === sys.lider)) itens.push({ p, sev: "bad", txt: `No sistema é líder de ${setorLabel(sys.lider)}, mas no desenho não.` });
      if (leads.length && sys.setor === "gerencia") itens.push({ p, sev: "info", txt: "Líder com setor “gerência” no cadastro, e não no time que lidera." });
      if (!leads.length && t) {
        const esperado = t.setorSistema || "";
        if ((sys.setor || "") !== esperado) itens.push({ p, sev: "bad", txt: `No desenho está em ${t.nome}; no cadastro o setor é ${setorLabel(sys.setor)}.` });
      }
      const meusTimes = new Set([p.time, ...leads.map(x => x.id)]);
      const fora = sys.flags.filter(f => ORIGINAL.flagTime[f] && !meusTimes.has(ORIGINAL.flagTime[f]));
      if (fora.length) itens.push({ p, sev: "warn", txt: `Cargo de outro time marcado: ${fora.map(flagLabel).join(", ")}. Hoje isso serve só para liberar tela.` });
      if (!leads.length && t && ORIGINAL.flagsDoTime[t.id] && !sys.flags.some(f => ORIGINAL.flagsDoTime[t.id].includes(f))) itens.push({ p, sev: "warn", txt: `Não tem o cargo do próprio time (${ORIGINAL.flagsDoTime[t.id].map(flagLabel).join(" ou ")}).` });
      if (p.pendente) itens.push({ p, sev: "warn", txt: "Riscado no organograma, mas ativo no sistema. Falta confirmar se continua na empresa." });
    }
    for (const id of Object.keys(S)) {
      if (!pessoa(id)) itens.push({ p: { id, nome: S[id].nome }, sev: "bad", txt: "Está ativo no sistema, mas não aparece no desenho." });
    }
    return itens;
  }
  function renderValidacao() {
    const el = document.getElementById("tab-validacao");
    const itens = validar();
    const porPessoa = new Map();
    itens.forEach(i => { if (!porPessoa.has(i.p.id)) porPessoa.set(i.p.id, []); porPessoa.get(i.p.id).push(i); });
    const nBad = itens.filter(i => i.sev === "bad").length;
    const nWarn = itens.filter(i => i.sev === "warn").length;
    const ok = state.pessoas.filter(p => !porPessoa.has(p.id)).length;
    const sevNome = { bad: "Divergência", warn: "Atenção", info: "Informação" };
    const rows = state.times.map(t => {
      const gente = [...new Set([pessoa(t.lider), ...state.pessoas.filter(p => p.time === t.id)].filter(Boolean))];
      if (!gente.length) return "";
      return `<tr class="grp"><th colspan="4">${esc(t.nome)}</th></tr>` + gente.map(p => {
        const sys = state.sistema[p.id];
        const sysTxt = sys ? `${esc(ORIGINAL.setores[sys.setor] || "sem setor")}${sys.lider ? ` · líder de ${esc(ORIGINAL.setores[sys.lider] || sys.lider)}` : ""}<small>${esc(sys.flags.map(f => ORIGINAL.flagNome[f] || f).join(", ") || "sem cargo")}</small>` : "—";
        const its = porPessoa.get(p.id) || [];
        const st = its.length ? its.map(i => `<div><span class="sev ${i.sev}">${sevNome[i.sev]}</span> ${esc(i.txt)}</div>`).join("") : `<span class="sev ok">Confere</span>`;
        return `<tr><th scope="row">${esc(p.nome)}<small>${esc(sys?.nome || "")}</small></th><td>${sysTxt}</td><td>${sys ? sys.telas + " telas" + (sys.avulsas ? `<small>${sys.avulsas} avulsas</small>` : "") : "—"}</td><td>${st}</td></tr>`;
      }).join("");
    }).join("");
    const orfas = itens.filter(i => !state.pessoas.find(p => p.id === i.p.id));
    const orfasHtml = orfas.length ? `<h2>Fora do desenho</h2><ul class="notes">${orfas.map(i => `<li><b>${esc(i.p.nome)}</b>: ${esc(i.txt)}</li>`).join("")}</ul>` : "";
    el.innerHTML = `
      <div class="intro"><h1>Validação: desenho × sistema</h1>
      <p>Compara o time e o papel de cada pessoa no desenho com o cadastro de operadores no sistema (setor, líder de time e cargos marcados). Dados do sistema de ${esc(state.dataSistema)}. Se você editar o desenho, a validação recalcula na hora.</p></div>
      <div class="stats"><div class="stat"><b>${Object.keys(state.sistema).length}</b><span>Ativos no sistema</span></div><div class="stat"><b>${ok}</b><span>Conferem</span></div><div class="stat"><b>${nBad}</b><span>Divergências</span></div><div class="stat"><b>${nWarn}</b><span>Pontos de atenção</span></div></div>
      <ul class="notes">${ORIGINAL.notasValidacao.map(n => `<li>${esc(n)}</li>`).join("")}</ul>
      ${orfasHtml}
      <div class="table-wrap"><table><thead><tr><th scope="col">Pessoa</th><th scope="col">No sistema</th><th scope="col">Telas hoje</th><th scope="col">Resultado</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  /* ---------- Editar ---------- */
  function renderEditar() {
    const el = document.getElementById("tab-editar");
    const subs = [["pessoas", "Pessoas"], ["times", "Times"], ["niveis", "Níveis por papel"], ["acoes", "Ações sensíveis"]];
    el.innerHTML = `
      <div class="intro"><h1>Editar o desenho</h1>
      <p>As mudanças aparecem na hora no Mapa, em Permissões e em Validação. Elas ficam salvas só neste navegador e não mudam nada no ERP. Para compartilhar ou aplicar no sistema, exporte o arquivo e envie.</p></div>
      <div class="toolbar"><span class="left">${editada ? "Versão editada neste navegador." : "Versão original."}</span>
        <div class="row-btns"><label class="btn small ghost" for="importar">Importar arquivo</label><input type="file" id="importar" accept="application/json,.json" hidden>
        <button type="button" class="btn small" data-action="exportar">Exportar arquivo</button>
        ${editada ? `<button type="button" class="btn small ghost" data-action="restaurar">Voltar ao original</button>` : ""}</div></div>
      <div class="edit-nav">${subs.map(([id, n]) => `<button type="button" data-sub="${id}" aria-pressed="${editSub === id}">${n}</button>`).join("")}</div>
      <div id="edit-body"></div>`;
    el.querySelectorAll("[data-sub]").forEach(b => b.addEventListener("click", () => { editSub = b.dataset.sub; renderEditar(); }));
    el.querySelector("#importar").addEventListener("change", importar);
    const body = el.querySelector("#edit-body");
    ({ pessoas: editPessoas, times: editTimes, niveis: editNiveis, acoes: editAcoes })[editSub](body);
  }
  const optsTimes = sel => state.times.map(t => `<option value="${esc(t.id)}"${t.id === sel ? " selected" : ""}>${esc(t.nome)}</option>`).join("");
  const optsPapel = sel => PAPEIS.filter(p => p.id !== "lider").map(p => `<option value="${p.id}"${p.id === sel ? " selected" : ""}>${esc(p.nome)}</option>`).join("");

  function editPessoas(body) {
    const rows = state.pessoas.slice().sort((a, b) => a.nome.localeCompare(b.nome)).map(p => {
      const leads = lidera(p.id).map(t => t.nome).join(", ");
      return `<tr data-id="${esc(p.id)}">
        <td><input type="text" id="nome-${esc(p.id)}" data-f="nome" value="${esc(p.nome)}" aria-label="Nome"></td>
        <td><select id="time-${esc(p.id)}" data-f="time" aria-label="Time">${optsTimes(p.time)}</select></td>
        <td><select id="papel-${esc(p.id)}" data-f="papel" aria-label="Papel">${optsPapel(p.papel)}</select>${leads ? `<small>Líder de ${esc(leads)}</small>` : ""}</td>
        <td><label class="checks"><input type="checkbox" data-f="pendente"${p.pendente ? " checked" : ""}> a confirmar</label></td>
        <td><button type="button" class="iconbtn" data-del="${esc(p.id)}">Remover</button></td></tr>`;
    }).join("");
    body.innerHTML = `
      <div class="addrow"><input type="text" id="nova-pessoa" placeholder="Nome da pessoa" aria-label="Nome da nova pessoa"><select id="nova-pessoa-time" aria-label="Time da nova pessoa">${optsTimes(state.times[0]?.id)}</select><button type="button" class="btn small" id="add-pessoa">Adicionar pessoa</button></div>
      <p class="muted">Líder se define na aba Times. Aqui fica o time principal e o papel de cada pessoa.</p>
      <div class="table-wrap"><table><thead><tr><th>Nome</th><th>Time</th><th>Papel</th><th>Situação</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
    body.querySelectorAll("tr[data-id]").forEach(tr => {
      const p = pessoa(tr.dataset.id);
      tr.querySelectorAll("[data-f]").forEach(inp => inp.addEventListener("change", () => {
        const f = inp.dataset.f;
        p[f] = inp.type === "checkbox" ? inp.checked : inp.value.trim();
        salvar(); renderEditar();
      }));
    });
    body.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => {
      const id = b.dataset.del;
      state.pessoas = state.pessoas.filter(p => p.id !== id);
      state.times.forEach(t => { if (t.lider === id) t.lider = null; });
      salvar(); renderEditar();
    }));
    body.querySelector("#add-pessoa").addEventListener("click", () => {
      const nome = body.querySelector("#nova-pessoa").value.trim();
      if (!nome) { body.querySelector("#nova-pessoa").focus(); return; }
      state.pessoas.push({ id: "novo-" + Date.now(), nome, time: body.querySelector("#nova-pessoa-time").value, papel: "membro" });
      salvar(); renderEditar();
    });
  }

  function editTimes(body) {
    const optsPasta = sel => state.pastas.map(p => `<option value="${esc(p.id)}"${p.id === sel ? " selected" : ""}>${esc(p.nome)}</option>`).join("");
    const cards = state.times.map(t => {
      const cand = state.pessoas.slice().sort((a, b) => a.nome.localeCompare(b.nome));
      const optsLider = `<option value="">A definir</option>` + cand.map(p => `<option value="${esc(p.id)}"${p.id === t.lider ? " selected" : ""}>${esc(p.nome)}</option>`).join("");
      const mods = state.modulos.filter(m => !m.todos).map(m => `<label><input type="checkbox" data-mod="${esc(m.id)}"${t.modulos.includes(m.id) ? " checked" : ""}> ${esc(m.nome)}</label>`).join("");
      return `<tr data-id="${esc(t.id)}">
        <td><input type="text" data-f="nome" value="${esc(t.nome)}" aria-label="Nome do time"><small>${membros(t.id).length} membros</small></td>
        <td><select data-f="pasta" aria-label="Pasta">${optsPasta(t.pasta)}</select></td>
        <td><select data-f="lider" aria-label="Líder">${optsLider}</select></td>
        <td><div class="checks">${mods}</div></td>
        <td><button type="button" class="iconbtn" data-del="${esc(t.id)}">Remover</button></td></tr>`;
    }).join("");
    body.innerHTML = `
      <p class="muted">Os módulos marcados são os que o time usa. Eles definem as ligações no mapa e onde o nível do papel vale.</p>
      <div class="table-wrap"><table><thead><tr><th>Time</th><th>Pasta</th><th>Líder</th><th>Módulos que usa</th><th></th></tr></thead><tbody>${cards}</tbody></table></div>
      <div class="addrow"><input type="text" id="novo-time" placeholder="Nome do time" aria-label="Nome do novo time"><select id="novo-time-pasta" aria-label="Pasta do novo time">${optsPasta(state.pastas[0]?.id)}</select><button type="button" class="btn small" id="add-time">Adicionar time</button></div>
      <div class="addrow"><input type="text" id="nova-pasta" placeholder="Nome da pasta" aria-label="Nome da nova pasta"><button type="button" class="btn small ghost" id="add-pasta">Adicionar pasta</button></div>`;
    body.querySelectorAll("tr[data-id]").forEach(tr => {
      const t = time(tr.dataset.id);
      tr.querySelectorAll("[data-f]").forEach(inp => inp.addEventListener("change", () => {
        const f = inp.dataset.f;
        t[f] = f === "lider" ? (inp.value || null) : inp.value.trim();
        salvar(); renderEditar();
      }));
      tr.querySelectorAll("[data-mod]").forEach(cb => cb.addEventListener("change", () => {
        const m = cb.dataset.mod;
        t.modulos = cb.checked ? [...new Set([...t.modulos, m])] : t.modulos.filter(x => x !== m);
        salvar();
      }));
    });
    body.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => {
      const id = b.dataset.del;
      if (state.pessoas.some(p => p.time === id)) { b.textContent = "Mova as pessoas antes"; return; }
      state.times = state.times.filter(t => t.id !== id);
      salvar(); renderEditar();
    }));
    body.querySelector("#add-time").addEventListener("click", () => {
      const nome = body.querySelector("#novo-time").value.trim();
      if (!nome) { body.querySelector("#novo-time").focus(); return; }
      state.times.push({ id: "time-" + Date.now(), nome, pasta: body.querySelector("#novo-time-pasta").value, lider: null, modulos: [], setorSistema: "" });
      salvar(); renderEditar();
    });
    body.querySelector("#add-pasta").addEventListener("click", () => {
      const nome = body.querySelector("#nova-pasta").value.trim();
      if (!nome) { body.querySelector("#nova-pasta").focus(); return; }
      state.pastas.push({ id: "pasta-" + Date.now(), nome });
      salvar(); renderEditar();
    });
  }

  function editNiveis(body) {
    const colMods = state.modulos.filter(m => !m.todos);
    const opts = sel => NIVEIS.map((n, i) => `<option value="${i}"${i === sel ? " selected" : ""}>${esc(n.curto)}</option>`).join("");
    const rows = PAPEIS.map(pp => `<tr><th scope="row">${esc(pp.nome)}</th>${colMods.map(m => { const n = state.niveis[pp.id]?.[m.id] ?? 0; return `<td class="c-${n}"><select class="sel-lv sel-lv-${n}" data-papel="${pp.id}" data-mod="${esc(m.id)}" aria-label="${esc(pp.nome)} em ${esc(m.nome)}">${opts(n)}</select></td>`; }).join("")}</tr>`).join("");
    body.innerHTML = `
      <p class="muted">O nível de cada papel em cada módulo. Para membro e líder, ele só vale nos módulos que o time usa.</p>
      <div class="legend">${NIVEIS.map((n, i) => `<div class="item">${chip(i)}<span>${esc(n.descricao)}</span></div>`).join("")}</div>
      <div class="table-wrap"><table class="matrix"><thead><tr><th>Papel</th>${colMods.map(m => `<th>${esc(m.curto || m.nome)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`;
    body.querySelectorAll("select[data-papel]").forEach(s => s.addEventListener("change", () => {
      state.niveis[s.dataset.papel] = state.niveis[s.dataset.papel] || {};
      const n = Number(s.value);
      state.niveis[s.dataset.papel][s.dataset.mod] = n;
      s.className = `sel-lv sel-lv-${n}`;
      s.parentElement.className = `c-${n}`;
      salvar();
    }));
  }

  function editAcoes(body) {
    const optsMod = sel => state.modulos.map(m => `<option value="${esc(m.id)}"${m.id === sel ? " selected" : ""}>${esc(m.nome)}</option>`).join("");
    const rows = state.acoes.map((a, i) => `<tr data-i="${i}">
      <td><input type="text" class="wide" data-f="acao" value="${esc(a.acao)}" aria-label="Ação"></td>
      <td><select data-f="modulo" aria-label="Módulo">${optsMod(a.modulo)}</select></td>
      <td><input type="text" class="wide" data-f="quem" value="${esc(a.quem)}" aria-label="Quem pode"></td>
      <td><button type="button" class="iconbtn" data-del="${i}">Remover</button></td></tr>`).join("");
    body.innerHTML = `
      <p class="muted">Quem pode fazer cada ação sensível. A coluna "Hoje no sistema" vem do levantamento do código e não é editada aqui.</p>
      <div class="table-wrap"><table><thead><tr><th>Ação</th><th>Módulo</th><th>Quem pode</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="addrow"><input type="text" id="nova-acao" class="wide" placeholder="Nova ação, por exemplo: estornar pagamento" aria-label="Nova ação"><button type="button" class="btn small" id="add-acao">Adicionar ação</button></div>`;
    body.querySelectorAll("tr[data-i]").forEach(tr => {
      const a = state.acoes[Number(tr.dataset.i)];
      tr.querySelectorAll("[data-f]").forEach(inp => inp.addEventListener("change", () => { a[inp.dataset.f] = inp.value.trim(); salvar(); }));
    });
    body.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => { state.acoes.splice(Number(b.dataset.del), 1); salvar(); renderEditar(); }));
    body.querySelector("#add-acao").addEventListener("click", () => {
      const acao = body.querySelector("#nova-acao").value.trim();
      if (!acao) { body.querySelector("#nova-acao").focus(); return; }
      state.acoes.push({ acao, modulo: state.modulos[0].id, quem: "A definir", hoje: "" });
      salvar(); renderEditar();
    });
  }

  /* ---------- export / import / reset ---------- */
  function exportar() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `mapa-acessos-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function importar(ev) {
    const f = ev.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const s = JSON.parse(r.result);
        if (!valido(s)) throw new Error("formato");
        state = s; salvar(); mostrar();
      } catch {
        const left = document.querySelector(".toolbar .left");
        if (left) left.textContent = "Esse arquivo não é um mapa de acessos exportado daqui.";
      }
    };
    r.readAsText(f);
  }
  document.addEventListener("click", e => {
    const a = e.target.closest("[data-action]");
    if (!a) return;
    const act = a.dataset.action;
    if (act === "exportar") exportar();
    if (act === "restaurar") document.getElementById("confirm").hidden = false;
    if (act === "cancelar") document.getElementById("confirm").hidden = true;
    if (act === "confirmar-restaurar") {
      try { localStorage.removeItem(KEY); } catch { /* ignore */ }
      state = clone(ORIGINAL); editada = false;
      document.getElementById("confirm").hidden = true;
      mostrar();
    }
    if (act === "nova-pessoa") abrirNovaPessoa();
    if (act === "fechar-pessoa") document.getElementById("dlg-pessoa").hidden = true;
  });
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    document.getElementById("confirm").hidden = true;
    document.getElementById("dlg-pessoa").hidden = true;
  });

  /* ---------- add person (top bar) ---------- */
  const formPessoa = document.getElementById("form-pessoa");
  function abrirNovaPessoa() {
    const timeInicial = pessoaSel?.tid || timeSel || state.times[0]?.id;
    formPessoa.reset();
    formPessoa.elements.time.innerHTML = optsTimes(timeInicial);
    formPessoa.elements.papel.innerHTML = optsPapel("membro");
    document.getElementById("dlg-pessoa").hidden = false;
    formPessoa.elements.nome.focus();
  }
  formPessoa.addEventListener("submit", e => {
    e.preventDefault();
    const f = formPessoa.elements;
    const nome = f.nome.value.trim();
    if (!nome) { f.nome.focus(); return; }
    const id = "novo-" + Date.now();
    const tid = f.time.value;
    state.pessoas.push({ id, nome, time: tid, papel: f.papel.value });
    if (f.lider.checked) { const t = time(tid); if (t) t.lider = id; }
    salvar();
    document.getElementById("dlg-pessoa").hidden = true;
    selecionarDepois = { pid: id, tid };
    if (tabAtual() === "mapa") mostrar();
    else location.hash = "#mapa";
  });
  document.getElementById("dlg-pessoa").addEventListener("click", e => { if (e.target.id === "dlg-pessoa") e.currentTarget.hidden = true; });

  mostrar();
  if (document.fonts?.ready) document.fonts.ready.then(desenharLinhas);
})();
