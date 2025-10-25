// Change this if your JSON file has a different name
const BANK_URL = "cbcn_master_50_tagged.json"; // put the JSON file in repo root

const state = {
  questions: [],
  order: [],
  idx: 0,
  selected: null,
  correct: 0
};

const el = (id) => document.getElementById(id);

function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}

async function init(){
  try{
    const res = await fetch(BANK_URL, {cache:"no-store"});
    if(!res.ok) throw new Error("Could not load question bank");
    const data = await res.json();
    state.questions = data;
    state.order = shuffle([...Array(data.length).keys()]);
    el("loader").classList.add("hidden");
    el("quiz").classList.remove("hidden");
    render();
  }catch(e){
    el("loader").textContent = "Error loading questions. Make sure the JSON file is in the repo root.";
    console.error(e);
  }
}

function render(){
  state.selected = null;
  el("feedback").classList.add("hidden");
  el("nextBtn").classList.add("hidden");
  el("submitBtn").classList.remove("hidden");

  const q = state.questions[state.order[state.idx]];
  el("qnum").textContent = `Question ${state.idx+1} of ${state.questions.length}`;
  el("stem").textContent = q.stem;

  const choices = el("choices");
  choices.innerHTML = "";
  q.choices.forEach((c, i) => {
    const id = `opt${i}`;
    const wrap = document.createElement("label");
    wrap.innerHTML = `<input type="radio" name="choice" value="${i}" id="${id}"> ${c}`;
    choices.appendChild(wrap);
  });
}

function getSelected(){
  const found = document.querySelector('input[name="choice"]:checked');
  return found ? parseInt(found.value,10) : null;
}

function submit(){
  const q = state.questions[state.order[state.idx]];
  const sel = getSelected();
  if(sel === null){ alert("Pick an answer first 🙂"); return; }
  state.selected = sel;

  // show feedback
  const correct = q.answerIndex;
  const isRight = sel === correct;
  if(isRight) state.correct++;

  el("feedback").classList.remove("hidden");
  el("correct").textContent = isRight ? "Correct" : `Incorrect — Correct: ${String.fromCharCode(65+correct)}`;
  el("rationale").textContent = q.rationale || "—";

  // show why the other options are wrong
  const ul = el("whyWrong");
  ul.innerHTML = "";
  if(q.wrongAnswerNotes){
    Object.entries(q.wrongAnswerNotes).forEach(([opt, note]) => {
      const li = document.createElement("li");
      li.textContent = `${opt}: ${note}`;
      ul.appendChild(li);
    });
  }

  // toggle buttons
  el("submitBtn").classList.add("hidden");
  el("nextBtn").classList.remove("hidden");

  // update stats
  el("stats").textContent = `${state.correct}/${state.idx+1} correct`;
}

function reveal(){
  const q = state.questions[state.order[state.idx]];
  el("feedback").classList.remove("hidden");
  el("correct").textContent = `Answer: ${String.fromCharCode(65 + q.answerIndex)}`;
  el("rationale").textContent = q.rationale || "—";

  const ul = el("whyWrong");
  ul.innerHTML = "";
  if (q.wrongAnswerNotes) {
    Object.entries(q.wrongAnswerNotes).forEach(([opt, note]) => {
      const li = document.createElement("li");
      li.textContent = `${opt}: ${note}`;
      ul.appendChild(li);
    });
  }
}


function nextQ(){
  if(state.idx < state.questions.length - 1){
    state.idx++;
    render();
    el("stats").textContent = `${state.correct}/${state.idx} correct`;
  }else{
    el("stem").textContent = "All questions completed 🎉";
    el("choices").innerHTML = "";
    el("submitBtn").classList.add("hidden");
    el("revealBtn").classList.add("hidden");
    el("nextBtn").classList.add("hidden");
  }
}

el("submitBtn").addEventListener("click", submit);
el("revealBtn").addEventListener("click", reveal);
el("nextBtn").addEventListener("click", nextQ);

init();

