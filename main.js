const state = {
  data: null,
  filtros: { q: "", categoria: "", tipo: "" }
};

const els = {
  q: document.getElementById("q"),
  categoria: document.getElementById("categoria"),
  tipo: document.getElementById("tipo"),
  grid: document.getElementById("grid"),
  metaVersao: document.getElementById("metaVersao")
};

async function boot() {
  const res = await fetch("reasons.json", { cache: "no-store" });
  state.data = await res.json();
  els.metaVersao.textContent = "Versão: " + (state.data.versao || "—");

  // categorias dinâmicas
  const cats = [...new Set(state.data.motivos.map(m => m.categoria))].sort();
  for (const c of cats) {
    const opt = document.createElement("option");
    opt.value = c; opt.textContent = "Categoria: " + c;
    els.categoria.appendChild(opt);
  }

  bind();
  render();
}

function bind() {
  els.q.addEventListener("input", e => { state.filtros.q = e.target.value.toLowerCase().trim(); render(); });
  els.categoria.addEventListener("change", e => { state.filtros.categoria = e.target.value; render(); });
  els.tipo.addEventListener("change", e => { state.filtros.tipo = e.target.value; render(); });
}

function render() {
  const { motivos } = state.data;
  const { q, categoria, tipo } = state.filtros;

  const lista = motivos.filter(m => {
    if (categoria && m.categoria !== categoria) return false;
    if (tipo && !(m.applies_to || []).includes(tipo)) return false;

    if (q) {
      const hay = [
        m.code,
        m.categoria,
        ...(m.applies_to || []),
        m.label?.["pt-BR"] || "",
        m.mensagens?.push?.["pt-BR"] || "",
        m.mensagens?.ci?.["pt-BR"] || "",
        (m.legal_basis?.["pt-BR"] || ""),
        ...(m.references || [])
      ].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (lista.length === 0) {
    els.grid.innerHTML = `<div class="muted">Nenhum motivo encontrado.</div>`;
    return;
  }

  // Agrupa por categoria
  const grupos = {};
  lista.forEach(m => {
    if (!grupos[m.categoria]) grupos[m.categoria] = [];
    grupos[m.categoria].push(m);
  });

  els.grid.innerHTML = Object.entries(grupos)
    .map(([cat, motivos], idx) => `
      <details class="accordion-cat" data-idx="${idx}" style="margin-bottom:24px;border-radius:8px;box-shadow:0 2px 8px #0001;background:#fff;">
        <summary style="padding:16px 18px;cursor:pointer;font-size:1.15rem;font-weight:600;color:#003399;outline:none;display:flex;align-items:center;">
          ${esc(cat)} <span style="color:#6b7280;font-size:.95rem;font-weight:400;margin-left:8px;">(${motivos.length})</span>
        </summary>
        <div style="padding:16px;display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));">
          ${motivos.map(m => card(m)).join("")}
        </div>
      </details>
    `)
    .join("");

  // Accordion: só um aberto por vez
  const accordions = els.grid.querySelectorAll('.accordion-cat');
  accordions.forEach(acc => {
    acc.addEventListener('click', function(e) {
      // Só agir se o click for no summary
      if (e.target.tagName.toLowerCase() === 'summary') {
        setTimeout(() => {
          if (acc.open) {
            accordions.forEach(other => {
              if (other !== acc) other.open = false;
            });
          }
        }, 0);
      }
    });
  });
}

function esc(s) { return (s||"").replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

function card(m) {
  const label = m.label?.["pt-BR"] || m.code;
  const push = m.mensagens?.push?.["pt-BR"] || "";
  const ci = m.mensagens?.ci?.["pt-BR"] || "";
  const legal = m.legal_basis?.["pt-BR"] || "";
  const refs = (m.references || []).join("; ");
  const tipos = (m.applies_to || []).join(", ");
  return `
    <div class="card">
      <div><span class="tag">${esc(m.categoria)}</span></div>
      <div class="code">${esc(m.code)}</div>
      <h3 style="margin:4px 0 2px">${esc(label)}</h3>
      <div class="muted">Aplica a: ${esc(tipos || "—")}</div>

      <details>
        <summary>Detalhes</summary>
        <div style="margin-top:8px">
          <p><strong>Mensagem (push):</strong> ${esc(push)}</p>
          <p><strong>Mensagem (CI):</strong> ${esc(ci)}</p>
          <p><strong>Base legal (nível médio):</strong> ${esc(legal)}</p>
          <p><strong>Referências (nível baixo):</strong> ${esc(refs)}</p>
        </div>
      </details>
    </div>
  `;
}

boot();
