/* ============================================================
   app.js — 뷰어(index.html) 로직
   ============================================================ */
const S = window.RecipeStore;
let DATA = S.emptyData();
let activeCat = "all";
let query = "";

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

init();

async function init() {
  DATA = await S.loadForViewer();
  applySite();
  renderChips();
  render();
  bindEvents();
  buildModal();
}

function applySite() {
  const s = DATA.site || {};
  $("#brandTitle").textContent = s.title || "레시피 노트";
  $("#brandSub").textContent = s.subtitle || "";
  document.title = s.title || "레시피 노트";
  $("#footTitle").textContent = s.title || "레시피 노트";
  $("#footUpdated").textContent = s.updated ? "최종 업데이트 " + s.updated : "";
}

function catById(id) { return DATA.categories.find((c) => c.id === id); }

function renderChips() {
  const total = DATA.recipes.length;
  const chips = [`<button class="chip ${activeCat === "all" ? "active" : ""}" data-cat="all">📋 전체 <span class="count">${total}</span></button>`];
  DATA.categories.forEach((c) => {
    const n = DATA.recipes.filter((r) => r.categoryId === c.id).length;
    chips.push(`<button class="chip ${activeCat === c.id ? "active" : ""}" data-cat="${c.id}">${c.emoji || ""} ${esc(c.name)} <span class="count">${n}</span></button>`);
  });
  $("#chips").innerHTML = chips.join("");
}

function filtered() {
  const q = query.trim().toLowerCase();
  return DATA.recipes.filter((r) => {
    if (activeCat !== "all" && r.categoryId !== activeCat) return false;
    if (!q) return true;
    const hay = [r.title, r.description, (r.tags || []).join(" "),
      (r.ingredients || []).map((i) => i.name).join(" ")].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

function render() {
  const list = filtered();
  const grid = $("#grid");
  if (!DATA.recipes.length) {
    grid.innerHTML = emptyBlock("🍽️", "아직 등록된 레시피가 없어요",
      "관리자 화면에서 첫 레시피를 추가해 보세요.", true);
    return;
  }
  if (!list.length) {
    grid.innerHTML = emptyBlock("🔍", "검색 결과가 없어요", "다른 카테고리나 검색어로 찾아보세요.", false);
    return;
  }
  grid.innerHTML = list.map(cardHTML).join("");
  $$(".card", grid).forEach((el) => el.addEventListener("click", () => openDetail(el.dataset.id)));
}

function emptyBlock(icon, title, desc, showAdmin) {
  return `<div class="empty" style="grid-column:1/-1">
    <div class="big">${icon}</div><h3>${title}</h3><p>${desc}</p>
    ${showAdmin ? '<a class="btn btn-primary" href="admin.html">관리자 화면 열기 →</a>' : ""}
  </div>`;
}

function cardHTML(r) {
  const cat = catById(r.categoryId);
  const thumb = r.image
    ? `<img src="${esc(r.image)}" alt="${esc(r.title)}" loading="lazy">`
    : `<div class="ph">${cat?.emoji || "🍽️"}</div>`;
  const tags = (r.tags || []).slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`).join("");
  return `<article class="card" data-id="${r.id}">
    <div class="card-thumb">${thumb}${tags ? `<div class="card-tags">${tags}</div>` : ""}</div>
    <div class="card-body">
      ${cat ? `<div class="card-cat">${cat.emoji || ""} ${esc(cat.name)}</div>` : ""}
      <h3 class="card-title">${esc(r.title)}</h3>
      ${r.description ? `<p class="card-desc">${esc(r.description)}</p>` : ""}
      <div class="card-meta">
        ${r.cookTime ? `<span>⏱ ${esc(r.cookTime)}</span>` : ""}
        ${r.cookMethod ? `<span>🍳 ${esc(r.cookMethod)}</span>` : ""}
      </div>
    </div>
  </article>`;
}

/* ---------- Modal ---------- */
function buildModal() {
  if ($("#modalBackdrop")) return;
  const div = document.createElement("div");
  div.className = "modal-backdrop"; div.id = "modalBackdrop";
  div.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><div id="modalContent"></div></div>`;
  document.body.appendChild(div);
  div.addEventListener("click", (e) => { if (e.target === div) closeDetail(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDetail(); });
}

function openDetail(id) {
  const r = DATA.recipes.find((x) => x.id === id);
  if (!r) return;
  const cat = catById(r.categoryId);
  const hero = r.image
    ? `<img src="${esc(r.image)}" alt="${esc(r.title)}">`
    : `<div class="ph">${cat?.emoji || "🍽️"}</div>`;

  const meta = [];
  if (r.cookTime) meta.push(`<div class="meta-pill">⏱ 조리시간 <b>${esc(r.cookTime)}</b></div>`);
  if (r.cookMethod) meta.push(`<div class="meta-pill">🍳 조리방법 <b>${esc(r.cookMethod)}</b></div>`);
  if (r.servings) meta.push(`<div class="meta-pill">🍽️ 분량 <b>${esc(r.servings)}</b></div>`);

  const ing = (r.ingredients || []).filter((i) => i.name).map((i) =>
    `<li><span>${esc(i.name)}</span><span class="amt">${esc(i.amount || "")}</span></li>`).join("");
  const steps = (r.steps || []).filter(Boolean).map((s) =>
    `<li><span class="num"></span><span>${esc(s)}</span></li>`).join("");
  const prods = (r.products || []).filter((p) => p.name).map((p) => p.link
    ? `<a class="product-pill" href="${esc(p.link)}" target="_blank" rel="noopener">${esc(p.name)} <span>→</span></a>`
    : `<span class="product-pill">${esc(p.name)}</span>`).join("");

  $("#modalContent").innerHTML = `
    <div class="modal-hero">${hero}<button class="modal-close" aria-label="닫기">✕</button></div>
    <div class="modal-body">
      ${cat ? `<div class="modal-cat">${cat.emoji || ""} ${esc(cat.name)}${(r.tags || []).length ? " · " + r.tags.map(esc).join(" · ") : ""}</div>` : ""}
      <h2 class="modal-title">${esc(r.title)}</h2>
      ${r.description ? `<p class="modal-desc">${esc(r.description)}</p>` : ""}
      ${meta.length ? `<div class="modal-metarow">${meta.join("")}</div>` : ""}
      ${ing ? `<div class="divider"></div><h3 class="block-title">재료 ${r.servings ? `<span class="n">(${esc(r.servings)})</span>` : ""}</h3><ul class="ingredients">${ing}</ul>` : ""}
      ${steps ? `<div class="divider"></div><h3 class="block-title">조리법</h3><ol class="steps">${steps}</ol>` : ""}
      ${prods ? `<div class="divider"></div><h3 class="block-title">사용 제품</h3><div class="products">${prods}</div>` : ""}
    </div>`;
  $("#modalContent .modal-close").addEventListener("click", closeDetail);
  $("#modalBackdrop").classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeDetail() {
  const b = $("#modalBackdrop");
  if (b) b.classList.remove("open");
  document.body.style.overflow = "";
}

function bindEvents() {
  $("#chips").addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    activeCat = btn.dataset.cat;
    renderChips(); render();
  });
  $("#search").addEventListener("input", (e) => { query = e.target.value; render(); });
}
