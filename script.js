/* ===========================
   CBCN QUIZ — MULTI-PACK BUILD
   =========================== */

/* ---- PACKS CONFIG ----
   Add new packs here. The key names MUST be valid JS identifiers (no leading numbers).
   The file paths are relative to index.html. The label is what users see in Settings.
*/
const PACKS = {
  set26: { file: "cbcn_26oct2025.json?v=1", label: "Oct 26, 2025" },
  set27: { file: "cbcn_27oct2025.json?v=1", label: "Oct 27, 2025" },
  // Example to add more later:
  // set28: { file: "cbcn_28oct2025.json?v=1", label: "Oct 28, 2025" },
};

const LS_ACTIVE = "cbcn_activePacks_v1";   // stores selected pack keys

/* ---- STORAGE KEYS ---- */
const STORAGE = {
  settings:   "cbcn_settings_v1",
  history:    "cbcn_history_v1",
  session:    "cbcn_session_v1",
  bookmarks:  "cbcn_bookmarks_v1",
};

/* ---- STATE ---- */
const state = {
  // bank
  all: [],           // full list (from the selected packs)
  filtered: [],      // after filters

  // session navigation
  order: [],
  idx: 0,

  // stats
  correct: 0,
  incorrect: 0,
  streak: 0,

  // user prefs
  settings: { shuffle:true, persist:true, dark:true },

  // persistence
  history: [],
  bookmarks: [],

  // active packs
  activePacks: [],   // array of pack keys, e.g. ["set26","set27"]
};

/* ---- SHORTCUTS ---- */
const $  = (id) => document.getElementById(id);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const setStatus = (msg) => $("loadStatus").textContent = msg || "";

/* ---- SMALL HELPERS ---- */
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]] } return a; }
function save(k,v){ localStorage.setItem(k, JSON.stringify(v)); }
function load(k, fb){ try{ return JSON.parse(localStorage.getItem(k)) ?? fb } catch { return fb } }
function debounce(fn,ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }

/* Safe binder — prevents crashes if an element is missing */
function onEl(id, evt, handler){
  const el = document.getElementById(id);
  if(!el){ console.warn("Missing element:", id); return; }
  el.addEventListener(evt, handler);
}

/* ===========================
   INIT
   =========================== */
init();

async function init(){
  // 1) Load user settings/history/bookmarks
  state.settings  = load(STORAGE.settings, state.settings);
  state.history   = load(STORAGE.history,  []);
  state.bookmarks = load(STORAGE.bookmarks, []);
  document.documentElement.classList.toggle("light", !state.settings.dark);

  // 2) Build nav tabs
  $$(".tabs button").forEach(b=>{
    b.addEventListener("click", ()=>{
      $$(".tabs button").forEach(x=>x.classList.remove("active"));
      b.classList.add("active");
      const view = b.dataset.view;
      $$(".view").forEach(v=>v.classList.remove("active"));
      $("view-"+view).classList.add("active");
      if(view==="history") renderHistory();
      if(view==="bank")    renderBank();
      if(view==="settings") hydrateSettings();
    });
  });

  // 3) Settings events
  onEl("optShuffle","change",(e)=>{ state.settings.shuffle=e.target.checked; persistSettings(); });
  onEl("optPersist","change",(e)=>{ state.settings.persist=e.target.checked; persistSettings(); });
  onEl("optDarkSettings","change",(e)=>{
    state.settings.dark = e.target.checked; persistSettings();
    document.documentElement.classList.toggle("light", !state.settings.dark);
  });
  onEl("clearBookmarksBtn","click", clearBookmarks);

  // 4) Quiz toolbar events
  onEl("reshuffleBtn","click", reshuffle);
  onEl("resetBtn","click", resetSession);
  onEl("filterDomain","change", applyFilters);
  const ft = $("filterTags");
  if(ft) ft.addEventListener("input", debounce(applyFilters,300));
  onEl("filterBookmarkedQuiz","change", applyFilters);

  // 5) Quiz buttons
  onEl("submitBtn","click", onSubmit);
  onEl("revealBtn","click", onReveal);
  onEl("nextBtn","click", nextQ);
  onEl("bookmarkBtn","click", toggleBookmark);

  // 6) Bank view
  onEl("filterBookmarkedBank","change", renderBank);

  // 7) History view
  onEl("exportBtn","click", exportCSV);
  onEl("clearHistoryBtn","click", clearHistory);

  // 8) Pack controls in Settings
  buildPackControls();
  onEl("applyPacksBtn","click", rebuildFromActive);

  // 9) Load packs + build bank
  await rebuildFromActive();

  // 10) First paint
  updateStats();
  renderQ();
  renderBookmarks();
}

/* ===========================
   PACKS / BUILD
   =========================== */
function defaultActivePacks(){
  // if none saved, default to ALL packs present
  const saved = load(LS_ACTIVE, null);
  if(Array.isArray(saved) && saved.length) return saved;
  const allKeys = Object.keys(PACKS);
  save(LS_ACTIVE, allKeys);
  return allKeys;
}

function buildPackControls(){
  const wrap = $("packControls");
  if(!wrap) return;
  wrap.innerHTML = "";

  state.activePacks = defaultActivePacks();

  for(const [key, cfg] of Object.entries(PACKS)){
    const id = "pack_"+key;
    const checked = state.activePacks.includes(key) ? "checked" : "";
    const label = cfg.label || key;
    const item = document.createElement("label");
    item.innerHTML = `<input type="checkbox" id="${id}" ${checked}> ${label}`;
    wrap.appendChild(item);
  }
}

async function rebuildFromActive(){
  // collect chosen packs from checkboxes
  const chosen = [];
  for(const key of Object.keys(PACKS)){
    const cb = $("pack_"+key);
    if(cb && cb.checked) chosen.push(key);
  }
  state.activePacks = chosen.length ? chosen : defaultActivePacks();
  save(LS_ACTIVE, state.activePacks);

  setStatus("Loading question packs…");

  // load all packs in parallel
  const files = state.activePacks.map(k => PACKS[k].file);
  const results = await Promise.all(files.map(f => fetch(f, {cache:"no-store"}).then(r=>r.json())));
  // flatten
  state.all = results.flat();

  // build domain filter
  const sel = $("filterDomain");
  if(sel){
    sel.innerHTML = "<option>All</option>";
    const domains = Array.from(new Set(state.all.map(q=>q.domain).filter(Boolean))).sort();
    domains.forEach(d=>{
      const opt = document.createElement("option");
      opt.value=d; opt.textContent=d; sel.appendChild(opt);
    });
  }

  // apply filters and restart session
  state.filtered = state.all.slice();
  state.order = [...Array(state.filtered.length).keys()];
  if(state.settings.shuffle) shuffle(state.order);
  state.idx = 0;
  state.correct = state.incorrect = state.streak = 0;

  updateStats();
  renderQ();
  renderBank();
  setStatus(`Active: ${state.activePacks.join(", ")} • ${state.all.length} questions`);
}

/* ===========================
   FILTERS
   =========================== */
function applyFilters(){
  const dom = $("filterDomain")?.value || "All";
  const tagsStr = ($("filterTags")?.value || "").trim().toLowerCase();
  const tagList = tagsStr ? tagsStr.split(",").map(s=>s.trim()).filter(Boolean) : [];
  const onlyBookmarked = $("filterBookmarkedQuiz")?.checked;

  state.filtered = state.all.filter(q=>{
    const domOk = dom==="All" || q.domain===dom;
    const tagOk = !tagList.length || (q.tags||[]).some(t => tagList.some(tt => t.toLowerCase().includes(tt)));
    const bmOk  = !onlyBookmarked || state.bookmarks.includes(q.id);
    return domOk && tagOk && bmOk;
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

/* ===========================
   RENDER — QUIZ
   =========================== */
function getCurrent(){ return state.filtered[state.order[state.idx]]; }

function renderQ(){
  const q = getCurrent();
  if(!q){
    $("stem").textContent = "No questions match the current filters.";
    $("choices").innerHTML = "";
    $("feedback").classList.add("hidden");
    $("nextBtn").classList.add("hidden");
    return;
  }

  $("counter").textContent = `${state.idx+1} / ${state.order.length}`;
  $("stem").textContent = q.stem;

  // build choices
  const holder = $("choices");
  holder.innerHTML = "";
  q.choices.forEach((c,i)=>{
    const label = document.createElement("label");
    label.innerHTML = `<input type="radio" name="choice" value="${i}"> ${c}`;
    holder.appendChild(label);
  });

  // reset panels/buttons
  $("feedback").classList.add("hidden");
  $("meta").classList.add("hidden");
  $("badges").classList.add("hidden");
  $("whyWrong").innerHTML = "";
  $("rationale").textContent = "";
  $("submitBtn").classList.remove("hidden");
  $("revealBtn").classList.remove("hidden");
  $("nextBtn").classList.add("hidden");

  // bookmark button state
  $("bookmarkBtn").textContent = isBookmarked(q) ? "★ Bookmarked" : "★ Bookmark";
}

function selectedIndex(){
  const r = document.querySelector('input[name="choice"]:checked');
  return r ? parseInt(r.value,10) : null;
}

function onSubmit(){
  const q = getCurrent();
  const sel = selectedIndex();
  if(sel==null){ alert("Pick an answer first 🙂"); return; }

  const isRight = sel === q.answerIndex;
  state.correct += isRight ? 1 : 0;
  state.incorrect += isRight ? 0 : 1;
  state.streak = isRight ? state.streak+1 : 0;

  showFeedback(isRight, q, sel);

  if(state.settings.persist){
    state.history.push({
      id:q.id, stem:q.stem, choices:q.choices,
      selected:sel, correctIndex:q.answerIndex, correct:isRight,
      rationale:q.rationale||"", time:new Date().toISOString()
    });
    save(STORAGE.history, state.history);
  }

  updateStats();
}

function onReveal(){
  const q = getCurrent();
  showFeedback(null, q, null, true);
}

function showFeedback(isRight, q, sel, revealOnly=false){
  $("feedback").classList.remove("hidden");
  const b = $("resultBadge");
  if(revealOnly){
    b.className = "badge";
    b.textContent = `Answer: ${String.fromCharCode(65 + q.answerIndex)}`;
  }else{
    b.className = "badge " + (isRight ? "ok" : "no");
    b.textContent = isRight ? "Correct" : `Incorrect — Correct: ${String.fromCharCode(65+q.answerIndex)}`;
  }

  $("rationale").textContent = q.rationale || "—";
  renderWhyWrong(q);

  // show meta & tags AFTER rationale
  showDetailsQ(q);

  $("submitBtn").classList.add("hidden");
  $("nextBtn").classList.remove("hidden");
}

function renderWhyWrong(q){
  const ul = $("whyWrong"); ul.innerHTML = "";
  if(q.wrongAnswerNotes){
    // keep choice order — print the “why wrong” for each distractor in the same order
    q.choices.forEach((opt, idx)=>{
      if(idx === q.answerIndex) return;
      const note = q.wrongAnswerNotes[opt];
      const li=document.createElement("li");
      li.textContent = note ? `${opt.split(" ").slice(0,4).join(" ")}: ${note}` : opt;
      ul.appendChild(li);
    });
  }
}

/* show domain text + tag chips inside the feedback card */
function showDetailsQ(q){
  const meta = $("meta");
  const tags = (q.tags||[]);

  meta.textContent = [q.domain].filter(Boolean).join(" — ");
  meta.classList.remove("hidden");

  const badges = $("badges");
  badges.innerHTML = "";
  tags.forEach(t=>{
    const span = document.createElement("span");
    span.className="tag"; span.textContent=t;
    badges.appendChild(span);
  });
  badges.classList.remove("hidden");
}

function nextQ(){
  if(state.idx < state.order.length-1){
    state.idx++; renderQ();
  }else{
    $("stem").textContent = "All questions completed 🎉";
    $("choices").innerHTML = "";
    $("submitBtn").classList.add("hidden");
    $("revealBtn").classList.add("hidden");
    $("nextBtn").classList.add("hidden");
  }
}

/* ===========================
   STATS & BOOKMARKS
   =========================== */
function updateStats(){
  $("statCorrect").textContent  = state.correct;
  $("statIncorrect").textContent= state.incorrect;
  $("statStreak").textContent   = state.streak;
  $("statBank").textContent     = state.filtered.length || state.all.length;
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
  if(!div) return;
  if(!state.bookmarks.length){ div.textContent="None yet."; return; }
  div.innerHTML = state.bookmarks.map(id=>`<div class="sm">${id}</div>`).join("");
}

function clearBookmarks(){
  if(!confirm("Clear all bookmarks?")) return;
  state.bookmarks=[]; save(STORAGE.bookmarks, state.bookmarks);
  renderBookmarks();
  // if filtering by bookmarks, re-apply
  if($("filterBookmarkedQuiz")?.checked) applyFilters();
  renderBank();
}

/* ===========================
   BANK & HISTORY
   =========================== */
function renderBank(){
  const wrap = $("bankList"); if(!wrap) return;
  const onlyBm = $("filterBookmarkedBank")?.checked;

  const list = (onlyBm ? state.all.filter(q=>state.bookmarks.includes(q.id)) : state.all);

  if(!list.length){
    wrap.innerHTML = `<div class="muted">No questions to show.</div>`;
    return;
  }

  wrap.innerHTML = list.map(q=>{
    const tags = (q.tags||[]).map(t=>`<span class="tag">${t}</span>`).join(" ");
    const answer = q.choices?.[q.answerIndex] ?? "";
    const rat = q.rationale ? `<div class="muted sm" style="margin-top:6px">${q.rationale}</div>` : "";
    return `
      <div class="card">
        <div class="muted sm">${q.id || ""}</div>
        <div class="stem">${q.stem}</div>
        <div><b>Answer:</b> ${answer}</div>
        ${rat}
        <div class="muted sm" style="margin-top:8px">${q.domain || ""}</div>
        <div style="margin-top:6px">${tags}</div>
      </div>
    `;
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
    return `<div class="item card">
      <div class="muted sm">#${state.history.length - i} • ${new Date(r.time).toLocaleString()} • ${r.id || ""}</div>
      <div class="stem">${r.stem}</div>
      <div>${badge} &nbsp; Your answer: <b>${picked}</b> • Correct: <b>${letter}</b></div>
      ${r.rationale ? `<div class="muted sm" style="margin-top:6px">${r.rationale}</div>` : ""}
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
  state.history=[]; save(STORAGE.history, state.history);
  renderHistory();
}

/* ===========================
   SETTINGS
   =========================== */
function hydrateSettings(){
  // checkboxes reflect current settings
  if($("optShuffle"))       $("optShuffle").checked = !!state.settings.shuffle;
  if($("optPersist"))       $("optPersist").checked = !!state.settings.persist;
  if($("optDarkSettings"))  $("optDarkSettings").checked = !!state.settings.dark;

  // pack checkboxes reflect active packs
  state.activePacks = load(LS_ACTIVE, defaultActivePacks());
  for(const key of Object.keys(PACKS)){
    const cb = $("pack_"+key);
    if(cb) cb.checked = state.activePacks.includes(key);
  }
}

function persistSettings(){ save(STORAGE.settings, state.settings); }
