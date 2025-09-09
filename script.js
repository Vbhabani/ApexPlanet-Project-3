// script.js — QuizVerse (final, feature-complete)
// Features: 20 Qs, select + confirm, immediate reveal, +2/-2 scoring,
// scoreboard beside timer, localStorage leaderboard, feedback, confetti.

// ---------- Utilities ----------
const $ = (id) => document.getElementById(id);
const el = (sel) => document.querySelector(sel);
const decodeHTML = (html) => {
  const t = document.createElement("textarea");
  t.innerHTML = html;
  return t.value;
};
const nowISO = () => new Date().toISOString();

// ---------- Theme toggle (safe) ----------
document.addEventListener("click", (e) => {
  if (e.target && e.target.id === "theme-toggle") {
    document.body.classList.toggle("dark-mode");
  }
});

// ---------- QUIZ: run only on quiz page ----------
(function initQuiz() {
  // Required DOM nodes (safe lookups)
  const nameInput = $("player-name");
  const saveNameBtn = $("save-name");
  const mainQuizSection = document.querySelector(".main-quiz-section");
  const startBtn = $("start-quiz");
  const quizContent = document.querySelector(".quiz-content");
  const usernameDisplay = $("username-display");
  const timerEl = $("timer");
  const questionTextEl = $("question-text");
  const optionsList = $("options-list");
  const prevBtn = $("prev-btn");
  const nextBtn = $("next-btn");
  const submitBtn = $("submit-btn");
  const resultSection = $("result-section");
  const finalScoreEl = $("final-score");
  const confettiCanvas = $("confetti-canvas");

  // bail out if not on quiz page
  if (!nameInput || !saveNameBtn || !startBtn || !questionTextEl) return;

  // State
  const TOTAL_QUESTIONS = 20;
  let playerName = "";
  let questions = []; // {question, options[], correct}
  let current = 0;
  let answers = {}; // index -> selected option (string)
  let locked = {}; // index -> true/false (after confirm)
  let score = 0;
  const CORRECT_POINTS = 2;
  const WRONG_POINTS = -2;
  let timeLeft = 15 * 60; // seconds
  let timerId = null;

  // Scoreboard element next to timer (create if missing)
  let scoreboardEl = document.createElement("div");
  scoreboardEl.id = "live-scoreboard";
  scoreboardEl.style.marginLeft = "12px";
  scoreboardEl.style.fontWeight = "700";
  scoreboardEl.innerText = "Score: 0";
  if (timerEl && !timerEl.parentNode.querySelector("#live-scoreboard")) {
    timerEl.parentNode.appendChild(scoreboardEl);
  }

  // ---------- Name save / reveal main quiz start area ----------
  saveNameBtn.addEventListener("click", () => {
    const v = (nameInput.value || "").trim();
    if (!v) return alert("Please enter your name to continue!");
    playerName = v;
    usernameDisplay.textContent = `Player: ${playerName}`;
    nameInput.disabled = true;
    saveNameBtn.disabled = true;
    if (mainQuizSection) mainQuizSection.classList.remove("hidden");
    mainQuizSection.scrollIntoView({ behavior: "smooth" });
  });

  // ---------- Start button: fetch questions & start timer ----------
  startBtn.addEventListener("click", async () => {
    startBtn.disabled = true;
    if (startBtn.parentElement) startBtn.parentElement.classList.add("hidden");
    if (quizContent) quizContent.classList.remove("hidden");

    await loadQuestions(TOTAL_QUESTIONS);
    renderCurrent();
    startTimer();
  });

  // ---------- Fetch questions ----------
  async function loadQuestions(amount) {
    try {
      const res = await fetch(
        `https://opentdb.com/api.php?amount=${amount}&type=multiple`
      );
      const payload = await res.json();
      questions = payload.results.map((q) => {
        const correct = decodeHTML(q.correct_answer);
        const incorrect = q.incorrect_answers.map(decodeHTML);
        // insert correct into random slot
        const opts = [...incorrect];
        opts.splice(Math.floor(Math.random() * 4), 0, correct);
        return {
          question: decodeHTML(q.question),
          options: opts,
          correct,
        };
      });
      // init state maps
      answers = {};
      locked = {};
      current = 0;
      score = 0;
      updateLiveScore();
    } catch (err) {
      console.error("Failed to load questions:", err);
      alert("Could not load questions. Check your connection and refresh.");
    }
  }

  // ---------- Render question ----------
  function renderCurrent() {
    if (!questions.length) {
      questionTextEl.textContent = "No questions loaded.";
      optionsList.innerHTML = "";
      return;
    }
    const q = questions[current];
    questionTextEl.innerText = `Q${current + 1}. ${q.question}`;

    // Build options
    optionsList.innerHTML = "";
    q.options.forEach((optText, idx) => {
      const li = document.createElement("li");
      li.className = "option-item";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "option-btn";
      btn.style.width = "100%";
      btn.style.padding = "12px";
      btn.style.borderRadius = "8px";
      btn.style.border = "none";
      btn.style.marginBottom = "8px";
      btn.style.cursor = "pointer";
      btn.style.textAlign = "left";
      btn.innerText = optText;

      // If already locked (confirmed), style correct/incorrect
      if (locked[current]) {
        btn.disabled = true;
        if (optText === q.correct) {
          btn.style.background = "#2ecc71"; // green
          btn.style.color = "#000";
        } else if (optText === answers[current]) {
          btn.style.background = "#e74c3c"; // red
          btn.style.color = "#fff";
        } else {
          btn.style.background = "#444";
          btn.style.color = "#fff";
        }
      } else {
        // not locked: click selects (but not final until confirm)
        btn.addEventListener("click", () => {
          // mark selection in UI
          answers[current] = optText;
          // remove selected from other siblings
          Array.from(optionsList.querySelectorAll(".option-btn")).forEach(
            (b) => {
              b.style.outline = "none";
              b.style.boxShadow = "none";
            }
          );
          btn.style.boxShadow = "0 0 0 3px rgba(10,132,255,0.15)";
          // show confirm button (dynamic)
          showConfirmButton();
        });
      }

      li.appendChild(btn);
      optionsList.appendChild(li);
    });

    // Prev/Next enable/disable
    if (prevBtn) prevBtn.disabled = current === 0;
    if (nextBtn) nextBtn.disabled = current === questions.length - 1;
    // hide confirm if already locked
    if (locked[current]) removeConfirmButton();
  }

  // ---------- Confirm (Final Decision) button logic ----------
  function showConfirmButton() {
    // if button exists, do nothing
    if (document.getElementById("confirm-btn")) return;
    const confirmBtn = document.createElement("button");
    confirmBtn.id = "confirm-btn";
    confirmBtn.innerText = "✅ Final Decision";
    confirmBtn.style.display = "block";
    confirmBtn.style.margin = "12px auto";
    confirmBtn.style.padding = "10px 18px";
    confirmBtn.style.borderRadius = "8px";
    confirmBtn.style.fontWeight = "700";
    confirmBtn.style.cursor = "pointer";
    confirmBtn.addEventListener("click", () => {
      // If no answer selected, alert
      if (!answers.hasOwnProperty(current)) {
        alert("Please choose an option before confirming.");
        return;
      }
      // lock the answer and reveal correct/incorrect
      locked[current] = true;
      revealAndScore(current);
      // remove button
      removeConfirmButton();
      // auto-enable next (if available)
    });
    // inject after optionsList
    optionsList.parentNode.insertBefore(confirmBtn, optionsList.nextSibling);
  }

  function removeConfirmButton() {
    const c = document.getElementById("confirm-btn");
    if (c) c.remove();
  }

  // reveal correct/incorrect and update score
  function revealAndScore(index) {
    const q = questions[index];
    const selected = answers[index];
    // highlight options appropriately
    Array.from(optionsList.querySelectorAll(".option-btn")).forEach((b) => {
      const txt = b.innerText;
      b.disabled = true;
      if (txt === q.correct) {
        b.style.background = "#2ecc71"; // green
        b.style.color = "#000";
      } else if (txt === selected && txt !== q.correct) {
        b.style.background = "#e74c3c"; // red
        b.style.color = "#fff";
      } else {
        b.style.background = "#444";
        b.style.color = "#fff";
      }
    });

    // scoring: only apply once per question
    // if we already computed (e.g. user revisited), don't double score
    if (typeof q._scored === "undefined") {
      if (selected === q.correct) score += CORRECT_POINTS;
      else score += WRONG_POINTS;
      q._scored = true;
      updateLiveScore();
    }
  }

  function updateLiveScore() {
    if (scoreboardEl)
      scoreboardEl.innerText = `Score: ${score >= 0 ? score : score}`; // allow negative
  }

  // ---------- Navigation ----------
  if (nextBtn)
    nextBtn.addEventListener("click", () => {
      if (current < questions.length - 1) {
        current++;
        renderCurrent();
      }
    });
  if (prevBtn)
    prevBtn.addEventListener("click", () => {
      if (current > 0) {
        current--;
        renderCurrent();
      }
    });

  // ---------- Submit / finish ----------
  submitBtn.addEventListener("click", () => {
    if (!confirm("Submit quiz now? You won't be able to change answers."))
      return;
    finishQuiz(false);
  });

  function finishQuiz(timedOut = false) {
    stopTimer();
    // ensure any unanswered questions are counted as zero (or negative?) — spec said only update on confirm,
    // so we won't penalize unattempted questions; only locked ones affected score.
    // Show result
    if (quizContent) quizContent.classList.add("hidden");
    if (mainQuizSection) mainQuizSection.classList.add("hidden");

    if (finalScoreEl) {
      finalScoreEl.innerText = timedOut
        ? `⏰ Time's up! ${playerName}, your score: ${score}`
        : `🎉 ${playerName}, your final score: ${score}`;
    }
    if (resultSection) resultSection.classList.remove("hidden");

    // save to leaderboard
    saveToLeaderboard(playerName, score);
    renderLeaderboard();

    // feedback
    showFeedback(score);

    // confetti
    runConfetti(5);
  }

  // ---------- Timer ----------
  function startTimer() {
    updateTimerDisplay();
    if (timerId) clearInterval(timerId);
    timerId = setInterval(() => {
      timeLeft--;
      updateTimerDisplay();
      if (timeLeft <= 0) {
        clearInterval(timerId);
        finishQuiz(true);
      }
    }, 1000);
  }
  function stopTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }
  function updateTimerDisplay() {
    const m = Math.floor(timeLeft / 60)
      .toString()
      .padStart(2, "0");
    const s = (timeLeft % 60).toString().padStart(2, "0");
    if (timerEl) timerEl.innerText = `${m}:${s}`;
  }

  // ---------- Leaderboard (localStorage) ----------
  function saveToLeaderboard(name, score) {
    try {
      const raw = localStorage.getItem("quizverse_leaderboard") || "[]";
      const lb = JSON.parse(raw);
      lb.unshift({ name, score, date: nowISO() });
      // keep latest 50
      const truncated = lb.slice(0, 50);
      localStorage.setItem("quizverse_leaderboard", JSON.stringify(truncated));
    } catch (err) {
      console.error("Leaderboard save failed:", err);
    }
  }

  function renderLeaderboard() {
    // build a list under resultSection
    if (!resultSection) return;
    // remove old leaderboard if any
    const existing = resultSection.querySelector(".leaderboard");
    if (existing) existing.remove();

    const container = document.createElement("div");
    container.className = "leaderboard";
    container.style.marginTop = "18px";
    container.style.textAlign = "left";
    container.style.maxWidth = "700px";
    container.style.margin = "18px auto";
    container.style.background = "rgba(255,255,255,0.03)";
    container.style.padding = "12px";
    container.style.borderRadius = "8px";

    const title = document.createElement("h3");
    title.innerText = "Recent leaderboard";
    container.appendChild(title);

    let lb = [];
    try {
      lb = JSON.parse(localStorage.getItem("quizverse_leaderboard") || "[]");
    } catch (err) {
      lb = [];
    }

    if (!lb.length) {
      const p = document.createElement("p");
      p.innerText = "No leaderboard data yet. Be the first!";
      container.appendChild(p);
    } else {
      const ul = document.createElement("ol");
      ul.style.paddingLeft = "20px";
      ul.style.margin = "8px 0";
      // show top 10 recent (already ordered by unshift)
      lb.slice(0, 10).forEach((row) => {
        const li = document.createElement("li");
        li.style.marginBottom = "6px";
        const d = new Date(row.date);
        li.innerText = `${row.name} — ${row.score} pts (${d.toLocaleString()})`;
        ul.appendChild(li);
      });
      container.appendChild(ul);
    }
    resultSection.appendChild(container);
  }

  // ---------- Feedback ----------
  function showFeedback(scoreVal) {
    if (!resultSection) return;
    const fbExisting = resultSection.querySelector(".feedback");
    if (fbExisting) fbExisting.remove();
    const fb = document.createElement("div");
    fb.className = "feedback";
    fb.style.marginTop = "12px";
    fb.style.fontStyle = "italic";
    fb.style.maxWidth = "700px";
    fb.style.margin = "12px auto";
    let message = "";
    if (scoreVal >= TOTAL_QUESTIONS * CORRECT_POINTS * 0.75) {
      message =
        "Stellar performance — you're crushing it. Keep practicing to stay sharp!";
    } else if (scoreVal >= TOTAL_QUESTIONS * CORRECT_POINTS * 0.5) {
      message =
        "Nice job — solid knowledge. A little polish and you'll be top-tier.";
    } else if (scoreVal >= 0) {
      message =
        "Good effort — identify weak areas and revise. Consistency beats cramming.";
    } else {
      message =
        "Tough round — learn from it. Focus on fundamentals and try again with a plan.";
    }
    fb.innerText = message;
    resultSection.appendChild(fb);
  }

  // ---------- Confetti (canvas) ----------
  function runConfetti(passes = 5) {
    if (!confettiCanvas) return;
    const canvas = confettiCanvas;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext("2d");
    const pieces = [];
    const count = passes * 40;
    for (let i = 0; i < count; i++) {
      pieces.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        r: Math.random() * 6 + 4,
        vx: (Math.random() - 0.5) * 4,
        vy: Math.random() * 3 + 2,
        color: `hsl(${Math.random() * 360}, 80%, 60%)`,
        rot: Math.random() * Math.PI,
      });
    }
    let t = 0;
    function frame() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += 0.1;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6);
        ctx.restore();
      });
      t++;
      if (t < 200) requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    frame();
  }

  // ---------- Init: maybe auto reveal if name already present ----------
  (function autostartIfName() {
    const n = ((nameInput && nameInput.value) || "").trim();
    if (n) {
      usernameDisplay.textContent = `Player: ${n}`;
      mainQuizSection.classList.remove("hidden");
    }
  })();
})(); // end initQuiz

document.getElementById("start-quiz").addEventListener("click", function () {
  // Hide start section
  document.querySelector(".start-section").classList.add("hidden");

  // Show quiz content with animation
  const quizContent = document.querySelector(".quiz-content");
  quizContent.classList.remove("hidden");
  quizContent.classList.add("fade-in");

  // Smooth scroll to quiz section
  quizContent.scrollIntoView({ behavior: "smooth", block: "start" });

  // Start quiz
  startQuiz();
});
document.getElementById("retake-quiz").addEventListener("click", function () {
  // Hide results section
  document.getElementById("quiz-result").classList.add("hidden");

  // Show name input section again
  document.querySelector(".start-section").classList.remove("hidden");

  // Reset quiz variables
  score = 0;
  currentQuestionIndex = 0;
  clearInterval(timerInterval);

  // Optionally clear the name field
  document.getElementById("username").value = "";

  // Scroll to the top for name entry
  document
    .querySelector(".start-section")
    .scrollIntoView({ behavior: "smooth" });
});
