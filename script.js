// ---- CONFIG ----
const BANK_URL = "advanced_cbcn_questions.json?v=3";
const STORAGE = {
  settings: "cbcn_settings_v1",
  history:  "cbcn_history_v1",
  session:  "cbcn_session_v1",
  bookmarks:"cbcn_bookmarks_v1"
};

// ---- STATE ----
const state = {
  all: [],
  order: [],
  idx: 0,
  correct: 0,
  incorrect: 0,
  streak: 0,
  filtered: [],
  settings: { shuffle:true, persist:true, dark:true },
  history: [],
  bookmarks: []
};
const $ = (id) => document.getElementById(id);

// ---- UTIL ----
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function save(k,v){localStorage.setItem(k, JSON.stringify(v))}
function load(k, fallback){ try{ return JSON.parse(localStorage.getItem(k)) ?? fallback } catch { return fallback } }

// ---- INIT ----
init();
async function init(){
  // Load settings/history/bookmarks
  state.settings = load(STORAGE.settings, state.settings);
  state.history  = load(STORAGE.history,  []);
  state.bookmarks= load(STORAGE.bookmarks,[]);
  if(state.settings.dark) document.documentElement.classList.remove("light"); else document.documentElement.classList.add("light");

  // Wire nav tabs
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

  // Load bank
  const res = await fetch(BANK_URL, {cache:"no-store"});
  const data = await res.json();
  state.all = data;
  state.filtered = data.slice();

  // Build domain filter
  const domains = Array.from(new Set(state.all.map(q=>q.domain).filter(Boolean))).sort();
  domains.forEach(d=>{
    const opt = document.createElement("option");
    opt.value = d; opt.textContent = d; $("filterDomain").appendChild(opt);
  });

  // Order
  state.order = [...Array(state.filtered.length).keys()];
  if(state.settings.shuffle) shuffle(state.order);

  // Events
  $("submitBtn").addEventListener("click", onSubmit);
  $("revealBtn").addEventListener("click", onReveal);
  $("nextBtn").addEventListener("click", nextQ);
  $("bookmarkBtn").addEventListener("click", toggleBookmark);
  $("resetBtn").addEventListener("click", resetSession);
  $("reshuffleBtn").addEventListener("click", reshuffle);
  $("filterDomain").addEventListener("change", applyFilters);
  $("filterTags").addEventListener("input", debounce(applyFilters, 300));
  $("exportBtn").addEventListener("click", exportCSV);
  $("clearHistoryBtn").addEventListener("click", clearHistory);
  $("resetSessionBtn").addEventListener("click", resetSession);
  $("clearBookmarksBtn").addEventListener("click", clearBookmarks);

  // Settings toggles
  $("optShuffle").addEventListener("change", e=>{ state.settings.shuffle=e.target.checked; persistSettings(); });
  $("optPersist").addEventListener("change", e=>{ state.settings.persist=e.target.checked; persistSettings(); });
  $("optDark").addEventListener("change", e=>{
    state.settings.dark=e.target.checked; persistSettings();
    document.documentElement.classList.toggle("light", !state.settings.dark);
  });

  updateStats();
  renderQ();
  renderBookmarks();
}

// ---- RENDER QUESTION ----
function renderQ(){
  const q = getCurrent();
  if(!q){ $("stem").textContent = "No questions match the current filters."; $("choices").innerHTML=""; return; }

  $("counter").textContent = `${state.idx+1} / ${state.order.length}`;
  $("stem").textContent = q.stem;

  // meta line (domain + tags)
  const tags = (q.tags||[]).join(" • ");
  $("meta").textContent = [q.domain, tags].filter(Boolean).join(" — ");

  // topic badges
  const badges = $("badges"); badges.innerHTML = "";
  (q.tags||[]).slice(0,4).forEach(t=>{
    const span = document.createElement("span");
    span.className="tag"; span.textContent = t; badges.appendChild(span);
  });

  const choices = $("choices");
  choices.innerHTML = "";
  q.choices.forEach((c,i)=>{
    const label = document.createElement("label");
    label.innerHTML = `<input type="radio" name="choice" value="${i}"> ${c}`;
    choices.appendChild(label);
  });

  // reset panels/buttons
  $("feedback").classList.add("hidden");
  $("nextBtn").classList.add("hidden");
  $("submitBtn").classList.remove("hidden");

  // set bookmark button state
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

function onReveal(){
  const q = getCurrent();
  $("feedback").classList.remove("hidden");
  $("resultBadge").className = "badge";
  $("resultBadge").textContent = `Answer: ${String.fromCharCode(65 + q.answerIndex)}`;
  $("rationale").textContent = q.rationale || "—";
  renderWhyWrong(q);
}

function showFeedback(ok, q){
  $("feedback").classList.remove("hidden");
  $("resultBadge").className = "badge " + (ok ? "ok":"no");
  $("resultBadge").textContent = ok ? "Correct" : `Incorrect — Correct: ${String.fromCharCode(65+q.answerIndex)}`;
  $("rationale").textContent = q.rationale || "—";
  renderWhyWrong(q);
  $("submitBtn").classList.add("hidden");
  $("nextBtn").classList.remove("hidden");
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
  $("optShuffle").checked = !!state.settings.shuffle;
  $("optPersist").checked = !!state.settings.persist;
  $("optDark").checked    = !!state.settings.dark;
}
function persistSettings(){ save(STORAGE.settings, state.settings); }

// ---- HELPERS ----
function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }



