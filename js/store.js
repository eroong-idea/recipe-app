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
 *  - 이 브라우저에 작업본(localStorage)이 있으면 그것을 우선 표시.
 *    → 작성자는 관리자에서 '저장'만 하면 (내보내기·배포 전에도) 미리보기에 바로 반영됨.
 *    (뷰어 페이지는 localStorage에 쓰지 않으므로, 편집을 한 적 없는 방문자는 작업본이 없음)
 *  - 작업본이 없으면 배포된 data/recipes.json 을 표시 (방문자 = 게시된 내용).
 */
async function loadForViewer() {
  const local = loadLocal();
  if (local && Array.isArray(local.recipes) && local.recipes.length > 0) return normalize(local);
  const file = await loadFile();
  if (file && Array.isArray(file.recipes) && file.recipes.length > 0) return normalize(file);
  if (file) return normalize(file);   // 파일은 있으나 비어있음 → 카테고리/사이트설정 유지
  if (local) return normalize(local);
  return emptyData();
}

/** 관리자용: 로컬 우선(작업 중 편집 보존), 없으면 파일.
 *  단, 비밀번호 잠금(adminHash)은 "배포된 파일"을 기준으로 삼는다.
 *  → 파일에 비밀번호가 없으면 로컬에 남은 stale 값 때문에 갇히지 않는다. */
async function loadForAdmin() {
  const local = loadLocal();
  const file = await loadFile();
  if (local) {
    const data = normalize(local);
    // 잠금은 오직 "배포된 파일"에 비밀번호가 있을 때만. 파일에 없거나 파일을 못 읽으면 잠그지 않음.
    if (file && file.site && file.site.adminHash) data.site.adminHash = file.site.adminHash;
    else delete data.site.adminHash;
    return data;
  }
  if (file) { const d = normalize(file); saveLocal(d); return d; }
  return emptyData();
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
