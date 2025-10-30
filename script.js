// =======================
// CBCN QUIZ — MULTI-PACK
// =======================

// ---- MULTI-PACK CONFIG ----
const PACKS = {
  "26oct2025": { file: "cbcn_26oct2025.json", label: "26oct2025" },
  "27oct2025": { file: "cbcn_27oct2025.json", label: "27oct2025" }
};


const LS_ACTIVE = "cbcn_activePacks_v1"; // stores selected packs in localStorage

// ---- STORAGE KEYS ----
const STORAGE = {
  settings: "cbcn_settings_v1",
  history: "cbcn_history_v1",
  session: "cbcn_session_v1",
  bookmarks: "cbcn_bookmarks_v1",
};

// ---- STATE ----
const state = {
  all: [],          // all questions currently active (combined from selected packs)
  order: [],        // index order into state.filtered
  idx: 0,           // current index in order[]
  correct: 0,
  incorrect: 0,
  streak: 0,
  filtered: [],     // after domain/tags filters
  settings: { shuffle:true, persist:true, dark:true },
  history: [],
  bookmarks: []
};
const $ = (id) => document.getElementById(id);
// Safe binder — prevents crashes if an element is missing
function onEl(id, evt, handler) {
  const el = document.getElementById(id);
  if (!el) { console.warn("Missing element:", id); return; }
  el.addEventListener(evt, handler);
}


// ---- UTIL HELPERS ----
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function save(k,v){localStorage.setItem(k, JSON.stringify(v))}
function load(k, fallback){ try{ return JSON.parse(localStorage.getItem(k)) ?? fallback } catch { return fallback } }
function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }


// ---- SHOW DETAILS (domain + tags after answering) ----
function showDetails(q){
  const tags = q.tags || [];
  const hasDomain = !!q.domain;
  const hasTags = tags.length > 0;

  // Domain line only (no inline tag list here)
  $("meta").textContent = hasDomain ? q.domain : "";
  $("meta").classList.toggle("hidden", !hasDomain && !hasTags);

  // Tag chips
  const badges = $("badges");
  badges.innerHTML = "";
  tags.forEach(t => {
    const span = document.createElement("span");
    span.className = "tag";
    span.textContent = t;
    badges.appendChild(span);
  });
  badges.classList.toggle("hidden", !hasTags);
}



// ---- PACK SELECTION (all ON by default) ----
function defaultActivePacks(){ return Object.keys(PACKS); }
function loadActivePacks(){
  try {
    const v = JSON.parse(localStorage.getItem(LS_ACTIVE));
    const valid = Array.isArray(v) ? v.filter(id => PACKS[id]) : [];
    return valid.length ? valid : defaultActivePacks();
  } catch { return defaultActivePacks(); }
}
function saveActivePacks(ids){ localStorage.setItem(LS_ACTIVE, JSON.stringify(ids)); }

// cache of loaded question arrays per pack
const PACK_DATA = new Map(); // id -> array

async function fetchPack(id){
  const meta = PACKS[id];
  if(!meta) throw new Error(`Unknown pack: ${id}`);
  const res = await fetch(`${meta.file}?v=${Date.now()}`, { cache:"no-store" });
  if(!res.ok) throw new Error(`Failed to load ${meta.file}`);
  const data = await res.json();
  PACK_DATA.set(id, Array.isArray(data) ? data : []);
}

async function loadAllPacks(){
  const ids = Object.keys(PACKS);
  await Promise.all(ids.map(id => fetchPack(id).catch(e => {
    console.error("Pack failed", id, e);
    PACK_DATA.set(id, []);
  })));
}

function assembleFrom(ids){
  const out = [];
  ids.forEach(id => {
    const arr = PACK_DATA.get(id);
    if(Array.isArray(arr)) out.push(...arr);
  });
  return out;
}

// ---- PACK CONTROLS UI ----
// Place <div id="packControls"></div> in your HTML where you want this to render.
function renderPackControls(active){
  const el = $("packControls"); if(!el) return;
  el.innerHTML = `
    <div style="display:flex;gap:1rem;flex-wrap:wrap;align-items:center;">
      <strong>Packs:</strong>
      ${Object.entries(PACKS).map(([id,meta])=>`
        <label style="display:inline-flex;gap:.4rem;align-items:center;cursor:pointer;">
          <input type="checkbox" data-pack="${id}" ${active.includes(id)?"checked":""}/>
          <span>${meta.label}</span>
        </label>
      `).join("")}
      <button id="applyPacksBtn" type="button">Apply</button>
      <span id="packSummary" class="sm" style="opacity:.8"></span>
    </div>
  `;
  $("applyPacksBtn").addEventListener("click", onApplyPacks);
  updatePackSummary(active);
}

function getCheckedPackIds(){
  return Array.from(document.querySelectorAll('#packControls input[type="checkbox"][data-pack]'))
    .filter(cb => cb.checked)
    .map(cb => cb.getAttribute("data-pack"));
}

function onApplyPacks(){
  const ids = getCheckedPackIds();
  if(!ids.length){ alert("Select at least one pack."); return; }
  saveActivePacks(ids);
  rebuildFromActive();
}

function updatePackSummary(active){
  const el = $("packSummary"); if(!el) return;
  const total = assembleFrom(active).length;
  el.textContent = `Active: ${active.join(", ")} • ${total} questions`;
}

// ---- INIT ----
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
async function init(){
  // Load settings/history/bookmarks
  state.settings = load(STORAGE.settings, state.settings);
  state.history  = load(STORAGE.history,  []);
  state.bookmarks= load(STORAGE.bookmarks,[]);

  // ✅ Apply dark or light theme right away
  document.documentElement.classList.toggle("light", !state.settings.dark);

  if(state.settings.dark) document.documentElement.classList.remove("light"); else document.documentElement.classList.add("light");

  // Wire nav tabs (unchanged)
  document.querySelectorAll(".tabs button").forEach(b=>{
    b.addEventListener("click", ()=>{
      document.querySelectorAll(".tabs button").forEach(x=>x.classList.remove("active"));
      b.classList.add("active");
      const view = b.dataset.view;
      document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
      $("view-"+view).classList.add("active");
      if(view==="history") renderHistory();
      if(view==="bank") renderBank();
      if(view==="settings") hydrateSettings();
    });
  });

  // Load ALL packs once
  await loadAllPacks();

  // Build controls + assemble active pool (all packs ON by default or per saved selection)
  const active = loadActivePacks();
  renderPackControls(active);

  // Build the working bank from selected packs
  state.all = assembleFrom(active);
  state.filtered = state.all.slice();

  // Build domain filter
  $("filterDomain").innerHTML = `<option>All</option>`;
  const domains = Array.from(new Set(state.all.map(q=>q.domain).filter(Boolean))).sort();
  domains.forEach(d=>{
    const opt = document.createElement("option");
    opt.value = d; opt.textContent = d; $("filterDomain").appendChild(opt);
  });

  // Order
  state.order = [...Array(state.filtered.length).keys()];
  if(state.settings.shuffle) shuffle(state.order);

// ---- EVENTS (safe bindings) ----
onEl("submitBtn", "click", onSubmit);
onEl("revealBtn", "click", onReveal);
onEl("nextBtn", "click", nextQ);
onEl("bookmarkBtn", "click", toggleBookmark);

onEl("resetBtn", "click", resetSession);
onEl("reshuffleBtn", "click", reshuffle);
onEl("filterDomain", "change", applyFilters);
(function(){
  const ft = document.getElementById("filterTags");
  if (ft) ft.addEventListener("input", debounce(applyFilters, 300));
})();

onEl("exportBtn", "click", exportCSV);
onEl("clearHistoryBtn", "click", clearHistory);
onEl("clearBookmarksBtn", "click", clearBookmarks);

// Settings toggles (in Settings view)
onEl("optShuffle", "change", e => {
  state.settings.shuffle = e.target.checked;
  persistSettings();
});
onEl("optPersist", "change", e => {
  state.settings.persist = e.target.checked;
  persistSettings();
});
onEl("optDarkSettings", "change", e => {
  state.settings.dark = e.target.checked;
  persistSettings();
  document.documentElement.classList.toggle("light", !state.settings.dark);
});





  updateStats();
  renderQ();
  renderBookmarks();
}

// ---- REBUILD WHEN PACK SELECTION CHANGES ----
function rebuildFromActive(){
  const active = loadActivePacks();

  // Rebuild state from selected packs
  state.all = assembleFrom(active);
  state.filtered = state.all.slice();

  // refresh domain dropdown
  if ($("filterDomain")) {
    $("filterDomain").innerHTML = `<option>All</option>`;
    const domains = Array.from(new Set(state.all.map(q=>q.domain).filter(Boolean))).sort();
    domains.forEach(d=>{
      const opt = document.createElement("option");
      opt.value = d; opt.textContent = d; $("filterDomain").appendChild(opt);
    });
  }

  // reset order/index (stats counters persist; session reset button still available)
  state.order = [...Array(state.filtered.length).keys()];
  if(state.settings.shuffle) shuffle(state.order);
  state.idx = 0;

  updatePackSummary(active);
  updateStats();
  renderQ();
  renderBank();
}

// ---- RENDER QUESTION ----
function renderQ(){
  const q = getCurrent();

  if (!q) {
    $("stem").textContent = "No questions match the current filters.";
    $("choices").innerHTML = "";
    $("meta").classList.add("hidden");
    $("badges").classList.add("hidden");
    $("meta").textContent = "";
    $("badges").innerHTML = "";
    $("feedback").classList.add("hidden");
    $("submitBtn").classList.add("hidden");
    $("nextBtn").classList.add("hidden");
    return;
  }

  $("counter").textContent = `${state.idx + 1} / ${state.order.length}`;
  $("stem").textContent = q.stem;

  // Hide/clear details until user submits/reveals
  $("meta").classList.add("hidden");
  $("badges").classList.add("hidden");
  $("meta").textContent = "";
  $("badges").innerHTML = "";

  const choices = $("choices");
  choices.innerHTML = "";
  (q.choices || []).forEach((c, i) => {
    const label = document.createElement("label");
    label.innerHTML = `<input type="radio" name="choice" value="${i}"> ${c}`;
    choices.appendChild(label);
  });

  $("feedback").classList.add("hidden");
  $("nextBtn").classList.add("hidden");
  $("submitBtn").classList.remove("hidden");
  $("bookmarkBtn").textContent = isBookmarked(q) ? "★ Bookmarked" : "★ Bookmark";
}



// ---- ACTIONS ----
function getCurrent(){ return state.filtered[state.order[state.idx]]; }
function selectedIndex(){
  const r = document.querySelector('input[name="choice"]:checked');
  return r ? parseInt(r.value,10) : null;
}

function onSubmit(){
  const q = getCurrent();
  const sel = selectedIndex();
  if(sel==null) { alert("Pick an answer first 🙂"); return; }

  const correct = q.answerIndex;
  const isRight = sel===correct;

  state.correct += isRight ? 1 : 0;
  state.incorrect += isRight ? 0 : 1;
  state.streak = isRight ? state.streak+1 : 0;

  showFeedback(isRight, q);

  // Save history
  if(state.settings.persist){
    state.history.push({
      id: q.id, stem: q.stem, choices: q.choices,
      selected: sel, correctIndex: correct, correct: isRight,
      rationale: q.rationale||"", time: new Date().toISOString()
    });
    save(STORAGE.history, state.history);
  }

  updateStats();
}

function showFeedback(ok, q){
  $("feedback").classList.remove("hidden");
  $("resultBadge").className = "badge " + (ok ? "ok":"no");
  $("resultBadge").textContent = ok ? "Correct" : `Incorrect — Correct: ${String.fromCharCode(65+q.answerIndex)}`;
  $("rationale").textContent = q.rationale || "—";
  renderWhyWrong(q);

  // 👇 now domain + chips render after the rationale + whyWrong
  showDetails(q);

  $("submitBtn").classList.add("hidden");
  $("nextBtn").classList.remove("hidden");
}

function onReveal(){
  const q = getCurrent();
  $("feedback").classList.remove("hidden");
  $("resultBadge").className = "badge";
  $("resultBadge").textContent = `Answer: ${String.fromCharCode(65 + q.answerIndex)}`;
  $("rationale").textContent = q.rationale || "—";
  renderWhyWrong(q);

  // 👇 same here
  showDetails(q);
}

function renderWhyWrong(q){
  const ul = $("whyWrong"); ul.innerHTML = "";
  if(q.wrongAnswerNotes){
    Object.entries(q.wrongAnswerNotes).forEach(([k,v])=>{
      const li=document.createElement("li"); li.textContent=`${k}: ${v}`; ul.appendChild(li);
    });
  }
}

function nextQ(){
  if(state.idx < state.order.length - 1){
    state.idx++; renderQ();
  }else{
    $("stem").textContent = "All questions completed 🎉";
    $("choices").innerHTML = "";
    $("submitBtn").classList.add("hidden");
    $("revealBtn").classList.add("hidden");
    $("nextBtn").classList.add("hidden");
  }
}

// ---- FILTERS ----
function applyFilters(){
  const dom = $("filterDomain").value;
  const tagsStr = $("filterTags").value.trim().toLowerCase();
  const tagList = tagsStr ? tagsStr.split(",").map(s=>s.trim()).filter(Boolean) : [];

  state.filtered = state.all.filter(q=>{
    const domOk = dom==="All" || q.domain===dom;
    const tagOk = !tagList.length || (q.tags||[]).some(t => tagList.some(tt => t.toLowerCase().includes(tt)));
    return domOk && tagOk;
  });

  state.order = [...Array(state.filtered.length).keys()];
  if(state.settings.shuffle) shuffle(state.order);
  state.idx = 0;
  updateStats();
  renderQ();
}

function reshuffle(){
  if(!state.filtered.length) return;
  state.order = [...Array(state.filtered.length).keys()];
  shuffle(state.order);
  state.idx = 0;
  renderQ();
}

function resetSession(){
  if(!confirm("Reset current session stats and position?")) return;
  state.correct=0; state.incorrect=0; state.streak=0; state.idx=0;
  updateStats(); renderQ();
}

// ---- STATS/BOOKMARKS ----
function updateStats(){
  $("statCorrect").textContent = state.correct;
  $("statIncorrect").textContent = state.incorrect;
  $("statStreak").textContent = state.streak;
  $("statBank").textContent = state.filtered.length || state.all.length;
}

function isBookmarked(q){ return state.bookmarks.includes(q.id); }
function toggleBookmark(){
  const q = getCurrent(); if(!q) return;
  const i = state.bookmarks.indexOf(q.id);
  if(i>=0) state.bookmarks.splice(i,1); else state.bookmarks.push(q.id);
  save(STORAGE.bookmarks, state.bookmarks);
  $("bookmarkBtn").textContent = isBookmarked(q) ? "★ Bookmarked" : "★ Bookmark";
  renderBookmarks();
}
function renderBookmarks(){
  const div = $("bookmarkList");
  if(!state.bookmarks.length){ div.textContent = "None yet."; return; }
  div.innerHTML = state.bookmarks.map(id=>`<div class="sm">${id}</div>`).join("");
}
function clearBookmarks(){
  if(!confirm("Clear all bookmarks?")) return;
  state.bookmarks = []; save(STORAGE.bookmarks, state.bookmarks);
  renderBookmarks();
}

// ---- BANK/HISTORY RENDERS ----
function renderBank(){
  const wrap = $("bankList");
  wrap.innerHTML = state.all.map(q=>{
    const tags = (q.tags||[]).join(" • ");
    return `<div class="item">
      <div class="muted sm">${q.id || ""}</div>
      <div class="stem">${q.stem}</div>
      <div class="muted sm">${[q.domain, tags].filter(Boolean).join(" — ")}</div>
    </div>`;
  }).join("");
}

function renderHistory(){
  const list = $("historyList");
  const empty = $("historyEmpty");
  if(!state.history.length){ empty.style.display="block"; list.innerHTML=""; return; }
  empty.style.display="none";
  list.innerHTML = state.history.slice().reverse().map((r,i)=>{
    const letter = String.fromCharCode(65 + r.correctIndex);
    const picked = r.selected!=null ? String.fromCharCode(65 + r.selected) : "—";
    const badge = r.correct ? `<span class="badge ok">Correct</span>` : `<span class="badge no">Incorrect</span>`;
    return `<div class="item">
      <div class="muted sm">#${state.history.length - i} • ${new Date(r.time).toLocaleString()} • ${r.id || ""}</div>
      <div class="stem">${r.stem}</div>
      <div>${badge} &nbsp; Your answer: <b>${picked}</b> • Correct: <b>${letter}</b></div>
      ${r.rationale ? `<div class="muted" style="margin-top:6px">${r.rationale}</div>` : ""}
    </div>`;
  }).join("");
}

function exportCSV(){
  if(!state.history.length) return;
  const header = ["id","time","stem","selected","correctIndex","correct"];
  const lines = [header.join(",")];
  state.history.forEach(r=>{
    const row = [
      (r.id||"").replace(/,/g," "),
      r.time,
      `"${(r.stem||"").replace(/"/g,'""')}"`,
      r.selected,
      r.correctIndex,
      r.correct
    ].join(",");
    lines.push(row);
  });
  const blob = new Blob([lines.join("\n")], {type:"text/csv"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href=url; a.download="cbcn_history.csv"; a.click();
  URL.revokeObjectURL(url);
}
function clearHistory(){
  if(!confirm("Clear saved answer history?")) return;
  state.history=[]; save(STORAGE.history, state.history); renderHistory();
}

// ---- SETTINGS ----
function hydrateSettings(){
  const sh = document.getElementById("optShuffle");
  const pe = document.getElementById("optPersist");
  const dk = document.getElementById("optDarkSettings");

  if (sh) sh.checked = !!state.settings.shuffle;
  if (pe) pe.checked = !!state.settings.persist;
  if (dk) dk.checked = !!state.settings.dark;
}

function persistSettings(){ save(STORAGE.settings, state.settings); }










