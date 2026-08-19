/* ============================================================
   admin.js — 관리자 화면(admin.html) 로직
   ============================================================ */
const S = window.RecipeStore;
let DATA = S.emptyData();
let currentId = null; // 편집 중인 레시피 id (null=신규)
let listQuery = "";

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

init();

async function init() {
  DATA = await S.loadForAdmin();
  setupAuth();
  renderSiteFields();
  renderCategoryOptions();
  renderCategoryManager();
  renderList();
  newRecipe();
  bindToolbar();
  bindEditor();
}

/* ---------- 비밀번호 잠금 ---------- */
const UNLOCK_KEY = "recipeNote.unlocked";
const LOCK_ENABLED = true; // 잠금은 파일(recipes.json)에 비밀번호가 있을 때만 표시됨
function setupAuth() {
  updatePwState();
  const hash = DATA.site.adminHash;
  const unlocked = hash && sessionStorage.getItem(UNLOCK_KEY) === hash;
  if (LOCK_ENABLED && hash && !unlocked) showLock();

  $("#lockReset").addEventListener("click", () => {
    if (!confirm("이 브라우저에 저장된 잠금/편집 정보를 초기화합니다.\n(배포된 recipes.json 파일에 비밀번호가 설정돼 있으면 그 잠금은 파일에서 다시 적용됩니다) 계속할까요?")) return;
    localStorage.removeItem(S.STORE_KEY);
    sessionStorage.removeItem(UNLOCK_KEY);
    location.reload();
  });

  const form = $("#lockForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const val = $("#lockInput").value;
    const h = await S.sha256(val);
    if (h === DATA.site.adminHash) {
      sessionStorage.setItem(UNLOCK_KEY, h);
      hideLock();
    } else {
      $("#lockError").hidden = false;
      $("#lockInput").value = "";
      $("#lockInput").focus();
    }
  });
}
function showLock() { $("#lockScreen").hidden = false; document.body.classList.add("locked"); $("#lockInput").focus(); }
function hideLock() { $("#lockScreen").hidden = true; document.body.classList.remove("locked"); $("#lockError").hidden = true; }

function updatePwState() {
  const el = $("#pwState");
  if (el) el.innerHTML = DATA.site.adminHash
    ? "🔒 현재 <b>비밀번호가 설정됨</b>. 변경하려면 새 비밀번호 입력, 해제하려면 비우고 적용."
    : "🔓 현재 <b>잠금 없음</b> (누구나 관리자 화면 사용 가능). 비밀번호를 입력해 잠글 수 있습니다.";
}

async function setPassword() {
  const val = $("#pwInput").value;
  if (!val) {
    if (!confirm("비밀번호를 해제할까요? (누구나 관리자 화면을 사용할 수 있게 됩니다)")) return;
    delete DATA.site.adminHash;
    sessionStorage.removeItem(UNLOCK_KEY);
    persist(); updatePwState(); toast("잠금을 해제했습니다");
    return;
  }
  const h = await S.sha256(val);
  DATA.site.adminHash = h;
  sessionStorage.setItem(UNLOCK_KEY, h); // 지금 세션은 잠기지 않도록
  $("#pwInput").value = "";
  persist(); updatePwState();
  toast("비밀번호를 설정했습니다 · 내보내기 후 배포하세요");
}

/* ---------- 저장 ---------- */
function persist() { S.saveLocal(DATA); }
function touchUpdated() {
  const d = new Date();
  DATA.site.updated = `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
  $("#siteUpdated").value = DATA.site.updated;
}

/* ---------- 사이트 설정 ---------- */
function renderSiteFields() {
  $("#siteTitle").value = DATA.site.title || "";
  $("#siteSubtitle").value = DATA.site.subtitle || "";
  $("#siteUpdated").value = DATA.site.updated || "";
}

/* ---------- 카테고리 ---------- */
function renderCategoryOptions() {
  const sel = $("#fCategory");
  sel.innerHTML = DATA.categories.map((c) =>
    `<option value="${c.id}">${c.emoji || ""} ${esc(c.name)}</option>`).join("");
}

function renderCategoryManager() {
  const box = $("#catList");
  box.innerHTML = DATA.categories.map((c, i) => `
    <div class="cat-row" data-i="${i}">
      <input class="cat-emoji" value="${esc(c.emoji || "")}" maxlength="3" aria-label="이모지">
      <input class="cat-name" value="${esc(c.name)}" aria-label="카테고리명">
      <button class="btn btn-ghost btn-sm cat-del" title="삭제">🗑</button>
    </div>`).join("") || `<p class="muted">카테고리가 없습니다. 아래에서 추가하세요.</p>`;

  $$(".cat-row", box).forEach((row) => {
    const i = +row.dataset.i;
    row.querySelector(".cat-emoji").addEventListener("input", (e) => { DATA.categories[i].emoji = e.target.value; persist(); refreshCatUsage(); });
    row.querySelector(".cat-name").addEventListener("input", (e) => { DATA.categories[i].name = e.target.value; persist(); refreshCatUsage(); });
    row.querySelector(".cat-del").addEventListener("click", () => removeCategory(i));
  });
}

function refreshCatUsage() { renderCategoryOptions(); if (currentId) $("#fCategory").value = DATA.recipes.find(r=>r.id===currentId)?.categoryId || ""; renderList(); }

function addCategory() {
  const id = "c" + Date.now().toString(36);
  DATA.categories.push({ id, emoji: "🍴", name: "새 카테고리" });
  persist(); renderCategoryManager(); renderCategoryOptions();
}

function removeCategory(i) {
  const cat = DATA.categories[i];
  const used = DATA.recipes.filter((r) => r.categoryId === cat.id).length;
  if (used && !confirm(`'${cat.name}' 카테고리를 사용하는 레시피가 ${used}개 있습니다.\n삭제하면 해당 레시피의 카테고리가 비워집니다. 계속할까요?`)) return;
  DATA.recipes.forEach((r) => { if (r.categoryId === cat.id) r.categoryId = ""; });
  DATA.categories.splice(i, 1);
  persist(); renderCategoryManager(); renderCategoryOptions(); renderList();
}

/* ---------- 레시피 목록 ---------- */
function renderList() {
  const q = listQuery.trim().toLowerCase();
  const items = DATA.recipes.filter((r) => !q || (r.title || "").toLowerCase().includes(q));
  $("#listCount").textContent = DATA.recipes.length;
  const box = $("#recipeList");
  if (!items.length) {
    box.innerHTML = `<p class="muted" style="padding:14px">${DATA.recipes.length ? "검색 결과 없음" : "레시피가 없습니다.\n'+ 새 레시피'로 시작하세요."}</p>`;
    return;
  }
  box.innerHTML = items.map((r) => {
    const cat = DATA.categories.find((c) => c.id === r.categoryId);
    const thumb = r.image ? `<img src="${esc(r.image)}" alt="">` : `<span>${cat?.emoji || "🍽️"}</span>`;
    return `<button class="li ${r.id === currentId ? "active" : ""}" data-id="${r.id}">
      <span class="li-thumb">${thumb}</span>
      <span class="li-text">
        <span class="li-title">${esc(r.title || "(제목 없음)")}</span>
        <span class="li-sub">${cat ? esc(cat.name) : "미분류"}</span>
      </span>
    </button>`;
  }).join("");
  $$(".li", box).forEach((el) => el.addEventListener("click", () => editRecipe(el.dataset.id)));
}

/* ---------- 편집기 ---------- */
function blankRecipe() {
  return { id: null, title: "", categoryId: DATA.categories[0]?.id || "", tags: [], description: "",
    cookTime: "", cookMethod: "", servings: "1인분", image: "",
    ingredients: [{ name: "", amount: "" }], steps: [""], products: [{ name: "", link: "" }] };
}
let draft = blankRecipe();

function newRecipe() {
  currentId = null;
  draft = blankRecipe();
  fillEditor(draft);
  $("#editorTitle").textContent = "새 레시피";
  $("#btnDelete").style.display = "none";
  renderList();
}

function editRecipe(id) {
  const r = DATA.recipes.find((x) => x.id === id);
  if (!r) return;
  currentId = id;
  draft = JSON.parse(JSON.stringify(r));
  if (!draft.ingredients.length) draft.ingredients = [{ name: "", amount: "" }];
  if (!draft.steps.length) draft.steps = [""];
  if (!draft.products.length) draft.products = [{ name: "", link: "" }];
  fillEditor(draft);
  $("#editorTitle").textContent = "레시피 수정";
  $("#btnDelete").style.display = "inline-flex";
  renderList();
  $(".editor").scrollTop = 0;
}

function fillEditor(r) {
  $("#fTitle").value = r.title || "";
  renderCategoryOptions();
  $("#fCategory").value = r.categoryId || "";
  $("#fTags").value = (r.tags || []).join(", ");
  $("#fDesc").value = r.description || "";
  $("#fTime").value = r.cookTime || "";
  $("#fMethod").value = r.cookMethod || "";
  $("#fServings").value = r.servings || "";
  renderImage(r.image);
  renderIngredients();
  renderSteps();
  renderProducts();
}

function renderImage(src) {
  const box = $("#imgPreview");
  if (src) {
    box.innerHTML = `<img src="${esc(src)}" alt="미리보기"><button type="button" class="img-remove" id="imgRemove">✕ 이미지 제거</button>`;
    box.classList.add("has");
    $("#imgRemove").addEventListener("click", () => { draft.image = ""; renderImage(""); });
  } else {
    box.innerHTML = `<label class="img-drop" for="fImage"><span class="big">🖼️</span><span>클릭해서 사진 추가</span><small>JPG/PNG · 자동 압축됨</small></label>`;
    box.classList.remove("has");
  }
}

/* 동적 행: 재료 */
function renderIngredients() {
  const box = $("#ingList");
  box.innerHTML = draft.ingredients.map((it, i) => `
    <div class="row2" data-i="${i}">
      <input class="ing-name" placeholder="재료명 (예: 흰쌀밥)" value="${esc(it.name)}">
      <input class="ing-amt" placeholder="분량 (예: 110g)" value="${esc(it.amount)}">
      <button type="button" class="row-del" title="삭제">✕</button>
    </div>`).join("");
  $$(".row2", box).forEach((row) => {
    const i = +row.dataset.i;
    row.querySelector(".ing-name").addEventListener("input", (e) => draft.ingredients[i].name = e.target.value);
    row.querySelector(".ing-amt").addEventListener("input", (e) => draft.ingredients[i].amount = e.target.value);
    row.querySelector(".row-del").addEventListener("click", () => { draft.ingredients.splice(i, 1); if (!draft.ingredients.length) draft.ingredients.push({ name: "", amount: "" }); renderIngredients(); });
  });
}

/* 동적 행: 조리법 */
function renderSteps() {
  const box = $("#stepList");
  box.innerHTML = draft.steps.map((s, i) => `
    <div class="row-step" data-i="${i}">
      <span class="step-num">${i + 1}</span>
      <textarea class="step-text" rows="2" placeholder="조리 단계를 입력하세요">${esc(s)}</textarea>
      <button type="button" class="row-del" title="삭제">✕</button>
    </div>`).join("");
  $$(".row-step", box).forEach((row) => {
    const i = +row.dataset.i;
    const ta = row.querySelector(".step-text");
    ta.addEventListener("input", (e) => { draft.steps[i] = e.target.value; autoGrow(ta); });
    autoGrow(ta);
    row.querySelector(".row-del").addEventListener("click", () => { draft.steps.splice(i, 1); if (!draft.steps.length) draft.steps.push(""); renderSteps(); });
  });
}

/* 동적 행: 사용 제품 */
function renderProducts() {
  const box = $("#prodList");
  box.innerHTML = draft.products.map((p, i) => `
    <div class="row2" data-i="${i}">
      <input class="prod-name" placeholder="제품명" value="${esc(p.name)}">
      <input class="prod-link" placeholder="링크(선택) https://" value="${esc(p.link || "")}">
      <button type="button" class="row-del" title="삭제">✕</button>
    </div>`).join("");
  $$(".row2", box).forEach((row) => {
    const i = +row.dataset.i;
    row.querySelector(".prod-name").addEventListener("input", (e) => draft.products[i].name = e.target.value);
    row.querySelector(".prod-link").addEventListener("input", (e) => draft.products[i].link = e.target.value);
    row.querySelector(".row-del").addEventListener("click", () => { draft.products.splice(i, 1); if (!draft.products.length) draft.products.push({ name: "", link: "" }); renderProducts(); });
  });
}

function autoGrow(ta) { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; }

/* ---------- 저장/삭제 ---------- */
function collectDraft() {
  draft.title = $("#fTitle").value.trim();
  draft.categoryId = $("#fCategory").value;
  draft.tags = $("#fTags").value.split(",").map((t) => t.trim()).filter(Boolean);
  draft.description = $("#fDesc").value.trim();
  draft.cookTime = $("#fTime").value.trim();
  draft.cookMethod = $("#fMethod").value.trim();
  draft.servings = $("#fServings").value.trim();
  draft.ingredients = draft.ingredients.filter((i) => i.name.trim() || i.amount.trim());
  draft.steps = draft.steps.map((s) => s.trim()).filter(Boolean);
  draft.products = draft.products.filter((p) => p.name.trim());
}

function saveRecipe() {
  collectDraft();
  if (!draft.title) { toast("메뉴 이름을 입력하세요"); $("#fTitle").focus(); return; }
  touchUpdated();
  if (currentId) {
    const idx = DATA.recipes.findIndex((r) => r.id === currentId);
    draft.id = currentId;
    DATA.recipes[idx] = JSON.parse(JSON.stringify(draft));
  } else {
    draft.id = S.uid();
    DATA.recipes.unshift(JSON.parse(JSON.stringify(draft)));
    currentId = draft.id;
    $("#editorTitle").textContent = "레시피 수정";
    $("#btnDelete").style.display = "inline-flex";
  }
  persist();
  renderList();
  toast("저장했습니다 ✓  (공유하려면 '내보내기' 후 배포)");
}

function deleteRecipe() {
  if (!currentId) return;
  const r = DATA.recipes.find((x) => x.id === currentId);
  if (!confirm(`'${r?.title || "이 레시피"}'를 삭제할까요?`)) return;
  DATA.recipes = DATA.recipes.filter((x) => x.id !== currentId);
  persist();
  newRecipe();
  toast("삭제했습니다");
}

/* ---------- 이미지 업로드 (압축) ---------- */
function handleImageFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1100;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        const ratio = Math.min(MAX / width, MAX / height);
        width = Math.round(width * ratio); height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      draft.image = canvas.toDataURL("image/jpeg", 0.82);
      renderImage(draft.image);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

/* ---------- 툴바: 내보내기/가져오기/초기화 ---------- */
function exportData() {
  collectDraftIfEditing();
  S.downloadJSON(DATA, "recipes.json");
  toast("recipes.json 다운로드 → data 폴더에 넣고 배포하세요");
}
function collectDraftIfEditing() {
  // 편집 중 미저장분이 있으면 반영하지 않고, 저장된 데이터만 내보냄(안전)
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      DATA = S.normalize(parsed);
      persist();
      renderSiteFields(); renderCategoryManager(); renderCategoryOptions(); renderList(); newRecipe();
      toast("가져오기 완료 ✓");
    } catch (err) { toast("올바른 JSON 파일이 아닙니다"); }
  };
  reader.readAsText(file);
}

function resetAll() {
  if (!confirm("브라우저에 저장된 모든 편집 내용을 지웁니다.\n(내보낸 recipes.json 파일은 영향받지 않습니다) 계속할까요?")) return;
  localStorage.removeItem(S.STORE_KEY);
  location.reload();
}

/* ---------- 이벤트 바인딩 ---------- */
function bindToolbar() {
  $("#btnExport").addEventListener("click", exportData);
  $("#btnImport").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", (e) => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ""; });
  $("#btnReset").addEventListener("click", resetAll);

  // 사이트 설정
  $("#siteTitle").addEventListener("input", (e) => { DATA.site.title = e.target.value; persist(); });
  $("#siteSubtitle").addEventListener("input", (e) => { DATA.site.subtitle = e.target.value; persist(); });
  $("#siteUpdated").addEventListener("input", (e) => { DATA.site.updated = e.target.value; persist(); });

  // 카테고리 매니저
  $("#btnAddCat").addEventListener("click", addCategory);

  // 비밀번호
  $("#btnSetPw").addEventListener("click", setPassword);

  // 설정 패널 토글
  $("#btnSettings").addEventListener("click", () => $("#settingsPanel").classList.toggle("open"));
  $("#settingsClose").addEventListener("click", () => $("#settingsPanel").classList.remove("open"));
}

function bindEditor() {
  $("#btnNew").addEventListener("click", newRecipe);
  $("#btnSave").addEventListener("click", saveRecipe);
  $("#btnDelete").addEventListener("click", deleteRecipe);
  $("#listSearch").addEventListener("input", (e) => { listQuery = e.target.value; renderList(); });

  $("#btnAddIng").addEventListener("click", () => { draft.ingredients.push({ name: "", amount: "" }); renderIngredients(); });
  $("#btnAddStep").addEventListener("click", () => { draft.steps.push(""); renderSteps(); });
  $("#btnAddProd").addEventListener("click", () => { draft.products.push({ name: "", link: "" }); renderProducts(); });

  $("#fImage").addEventListener("change", (e) => { if (e.target.files[0]) handleImageFile(e.target.files[0]); e.target.value = ""; });

  // 이미지 드래그&드롭
  const box = $("#imgPreview");
  ["dragover", "dragenter"].forEach((ev) => box.addEventListener(ev, (e) => { e.preventDefault(); box.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((ev) => box.addEventListener(ev, (e) => { e.preventDefault(); box.classList.remove("drag"); }));
  box.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) handleImageFile(f); });

  // Ctrl+S 저장
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); saveRecipe(); }
  });
}

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg) {
  let t = $("#toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}
