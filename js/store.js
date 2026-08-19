/* ============================================================
   store.js — 데이터 로딩/저장 공용 모듈
   ------------------------------------------------------------
   우선순위:
   1) 관리자(admin.html)에서 편집 중인 내용은 localStorage에 저장됩니다.
   2) 뷰어(index.html)는 data/recipes.json 파일을 먼저 읽고,
      실패하면(파일이 없거나 로컬 file:// 제한) localStorage를 사용합니다.
   ============================================================ */
const STORE_KEY = "recipeNote.v1";
const DATA_URL = "data/recipes.json";

const emptyData = () => ({
  site: { title: "레시피 노트", subtitle: "나만의 메뉴 레시피 카탈로그", updated: "" },
  categories: [],
  recipes: [],
});

/** localStorage에서 읽기 (없으면 null) */
function loadLocal() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn("localStorage 읽기 실패", e);
    return null;
  }
}

/** localStorage에 저장 */
function saveLocal(data) {
  localStorage.setItem(STORE_KEY, JSON.stringify(data));
}

/** data/recipes.json 파일 읽기 */
async function loadFile() {
  try {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null; // file:// 환경 등에서 실패할 수 있음
  }
}

/** 뷰어용 데이터 선택 규칙:
 *  - 배포된 data/recipes.json 에 레시피가 있으면 그것을 보여줌(방문자 = 게시된 내용).
 *  - 아직 내보내기 전(파일이 비어 있음/없음)이라면 이 브라우저의 작업본(localStorage)을
 *    보여줘서 작성자가 로컬에서 바로 미리볼 수 있게 함.
 */
async function loadForViewer() {
  const file = await loadFile();
  if (file && Array.isArray(file.recipes) && file.recipes.length > 0) return normalize(file);
  const local = loadLocal();
  if (local && Array.isArray(local.recipes) && local.recipes.length > 0) return normalize(local);
  if (file) return normalize(file);   // 파일은 있으나 비어있음 → 카테고리/사이트설정 유지
  return emptyData();
}

/** 관리자용: 로컬 우선(작업 중), 없으면 파일에서 가져오기 */
async function loadForAdmin() {
  const local = loadLocal();
  if (local) return normalize(local);
  const file = await loadFile();
  if (file) { const d = normalize(file); saveLocal(d); return d; }
  const d = emptyData();
  return d;
}

/** 데이터 형태 보정 */
function normalize(d) {
  const data = Object.assign(emptyData(), d || {});
  data.site = Object.assign(emptyData().site, d.site || {});
  data.categories = Array.isArray(d.categories) ? d.categories : [];
  data.recipes = Array.isArray(d.recipes) ? d.recipes : [];
  data.recipes.forEach((r) => {
    r.tags = r.tags || [];
    r.ingredients = r.ingredients || [];
    r.steps = r.steps || [];
    r.products = r.products || [];
  });
  return data;
}

/** 고유 id 생성 */
function uid() {
  return "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** JSON 파일 다운로드 */
function downloadJSON(data, filename = "recipes.json") {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/** SHA-256 해시 (비밀번호 잠금용) — https/localhost에서 동작 */
async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

window.RecipeStore = {
  loadForViewer, loadForAdmin, saveLocal, loadLocal,
  uid, downloadJSON, emptyData, normalize, sha256, STORE_KEY,
};
