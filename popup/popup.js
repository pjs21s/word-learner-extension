// Popup script - Main UI logic

// State
let currentWord = null;
let words = [];
let stats = null;
let searchQuery = '';

// Practice step state
let currentStepIndex = 0;
let stepResults = {};

// Step registry - add/remove/reorder steps here only
const PRACTICE_STEPS = [
  { id: 'recall', label: 'Recall',     render: renderRecallStep },
  { id: 'fill',   label: 'Fill Blank', render: renderFillStep   },
  { id: 'write',  label: 'Write',      render: renderWriteStep  },
];

// Living Achievement definitions - evolving tiers
const LIVING_ACHIEVEMENTS = {
  streak: {
    name: 'Streak Keeper',
    icon: '🔥',
    tiers: [
      { name: 'Spark', min: 3, color: '#f97316' },
      { name: 'Flame', min: 7, color: '#ef4444' },
      { name: 'Fire', min: 14, color: '#dc2626' },
      { name: 'Blaze', min: 30, color: '#3b82f6' },
      { name: 'Inferno', min: 100, color: '#8b5cf6' }
    ],
    getValue: (stats, words) => stats.currentStreak,
    format: (val) => `${val} day${val !== 1 ? 's' : ''}`
  },
  sentences: {
    name: 'Sentence Crafter',
    icon: '📝',
    tiers: [
      { name: 'Beginner', min: 1, color: '#78716c' },
      { name: 'Writer', min: 10, color: '#22c55e' },
      { name: 'Author', min: 50, color: '#3b82f6' },
      { name: 'Poet', min: 100, color: '#f59e0b' },
      { name: 'Master', min: 500, color: '#8b5cf6' }
    ],
    getValue: (stats, words) => stats.totalSentences,
    format: (val) => `${val} sentence${val !== 1 ? 's' : ''}`
  },
  words: {
    name: 'Word Collector',
    icon: '📚',
    tiers: [
      { name: 'Curious', min: 1, color: '#78716c' },
      { name: 'Reader', min: 10, color: '#22c55e' },
      { name: 'Scholar', min: 25, color: '#3b82f6' },
      { name: 'Librarian', min: 50, color: '#f59e0b' },
      { name: 'Sage', min: 100, color: '#8b5cf6' }
    ],
    getValue: (stats, words) => words.length,
    format: (val) => `${val} word${val !== 1 ? 's' : ''}`
  },
  perfect: {
    name: 'Perfectionist',
    icon: '⭐',
    tiers: [
      { name: 'Careful', min: 5, color: '#78716c' },
      { name: 'Precise', min: 15, color: '#22c55e' },
      { name: 'Excellent', min: 30, color: '#3b82f6' },
      { name: 'Flawless', min: 50, color: '#f59e0b' },
      { name: 'Legendary', min: 100, color: '#8b5cf6' }
    ],
    getValue: (stats, words) => stats.excellentCount || 0,
    format: (val) => `${val} excellent`
  }
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  setupEventListeners();
  await loadData();
  await checkAndDisplayAIStatus();
  renderAll();
});

// Tab navigation
function setupTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Update active tab
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Update active content
      const tabContents = document.querySelectorAll('.tab-content');
      tabContents.forEach(content => content.classList.remove('active'));
      document.getElementById(`${tab.dataset.tab}-tab`).classList.add('active');

      // Refresh data when switching tabs
      if (tab.dataset.tab === 'practice') {
        updatePracticeTab();
      } else if (tab.dataset.tab === 'stats') {
        renderStats();
      }
    });
  });
}

// Event listeners
function setupEventListeners() {
  // Settings button
  document.getElementById('settingsBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Search input
  const searchInput = document.getElementById('searchInput');
  const clearSearch = document.getElementById('clearSearch');

  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim().toLowerCase();
    clearSearch.style.display = searchQuery ? 'flex' : 'none';
    renderWords();
  });

  clearSearch.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    clearSearch.style.display = 'none';
    renderWords();
  });

  // Practice tab
  document.getElementById('startPractice').addEventListener('click', startPractice);
}

// Load data from storage
async function loadData() {
  words = await chrome.runtime.sendMessage({ action: 'getWords' });
  stats = await chrome.runtime.sendMessage({ action: 'getStats' });
}

// Render all sections
function renderAll() {
  renderWords();
  updatePracticeTab();
  renderStats();
}

// Render words list
function renderWords() {
  const wordsList = document.getElementById('words-list');
  const emptyState = document.getElementById('words-empty');
  const searchEmpty = document.getElementById('search-empty');
  const searchContainer = document.querySelector('.search-container');

  if (!words || words.length === 0) {
    wordsList.innerHTML = '';
    emptyState.style.display = 'flex';
    searchEmpty.style.display = 'none';
    searchContainer.style.display = 'none';
    return;
  }

  searchContainer.style.display = 'flex';
  emptyState.style.display = 'none';

  // Filter by search query (match word, base form, or meaning)
  let filteredWords = words;
  if (searchQuery) {
    filteredWords = words.filter(w =>
      w.word.toLowerCase().includes(searchQuery) ||
      (w.baseForm && w.baseForm.toLowerCase().includes(searchQuery)) ||
      (w.meaning && w.meaning.toLowerCase().includes(searchQuery))
    );
  }

  if (filteredWords.length === 0) {
    wordsList.innerHTML = '';
    searchEmpty.style.display = 'flex';
    return;
  }

  searchEmpty.style.display = 'none';

  // Sort by most recent first
  const sortedWords = [...filteredWords].sort((a, b) => b.createdAt - a.createdAt);

  wordsList.innerHTML = sortedWords.map(word => `
    <div class="word-card" data-id="${word.id}">
      <div class="word-card-header">
        <div class="word-title">
          <h3>${escapeHtml(word.word)}</h3>
          ${word.baseForm && word.baseForm !== word.word.toLowerCase() ? `
            <span class="base-form">→ ${escapeHtml(word.baseForm)}</span>
          ` : ''}
        </div>
        <div class="word-card-actions">
          <button class="generate-btn" title="Generate example sentence">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
            </svg>
          </button>
          <button class="delete delete-btn" title="Delete word">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
      ${word.meaning ? `
        <p class="word-meaning">${escapeHtml(word.meaning)}</p>
      ` : ''}
      ${word.context && word.context !== word.word ? `
        <p class="word-context">"${escapeHtml(truncate(word.context, 100))}"</p>
      ` : ''}
      ${word.exampleSentence ? `
        <div class="word-example">${escapeHtml(word.exampleSentence)}</div>
      ` : ''}
      <div class="word-meta">
        <span>Practiced: ${word.practiceCount} times</span>
      </div>
    </div>
  `).join('');

  // Add event listeners for word cards
  wordsList.querySelectorAll('.generate-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const card = e.target.closest('.word-card');
      const wordId = card.dataset.id;
      const word = words.find(w => w.id === wordId);
      if (word) {
        await generateExampleForWord(word, card);
      }
    });
  });

  wordsList.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const card = e.target.closest('.word-card');
      const wordId = card.dataset.id;
      await deleteWord(wordId);
    });
  });
}

// Generate example sentence for a word
async function generateExampleForWord(word, card) {
  const existingExample = card.querySelector('.word-example');
  const btn = card.querySelector('.generate-btn');

  // Show loading state
  btn.disabled = true;
  btn.innerHTML = '<span class="loading-spinner"></span>';

  if (existingExample) {
    existingExample.classList.add('loading');
    existingExample.textContent = 'Generating...';
  } else {
    const exampleDiv = document.createElement('div');
    exampleDiv.className = 'word-example loading';
    exampleDiv.textContent = 'Generating...';
    card.querySelector('.word-card-header').insertAdjacentElement('afterend', exampleDiv);
  }

  const response = await chrome.runtime.sendMessage({
    action: 'generateSentence',
    word: word.word
  });

  btn.disabled = false;
  btn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
    </svg>
  `;

  const exampleDiv = card.querySelector('.word-example');
  exampleDiv.classList.remove('loading');

  if (response.success) {
    exampleDiv.textContent = response.content;
    // Update local words array
    const wordIndex = words.findIndex(w => w.id === word.id);
    if (wordIndex !== -1) {
      words[wordIndex].exampleSentence = response.content;
    }
  } else {
    exampleDiv.textContent = response.error || 'Failed to generate example';
    exampleDiv.style.color = '#ef4444';
  }
}

// Delete a word
async function deleteWord(wordId) {
  await chrome.runtime.sendMessage({ action: 'deleteWord', id: wordId });
  words = words.filter(w => w.id !== wordId);
  renderWords();
  updatePracticeTab();
}

// Update practice tab
function updatePracticeTab() {
  const noWords = document.getElementById('practice-no-words');
  const ready = document.getElementById('practice-ready');
  const session = document.getElementById('practice-session');

  session.style.display = 'none';

  if (!words || words.length === 0) {
    noWords.style.display = 'flex';
    ready.style.display = 'none';
  } else {
    noWords.style.display = 'none';
    ready.style.display = 'flex';
    updateProgressRing();
  }
}

// Update progress ring
function updateProgressRing() {
  if (!stats) return;

  const circle = document.getElementById('progress-circle');
  const countEl = document.getElementById('progress-count');
  const goalEl = document.getElementById('progress-goal');

  const circumference = 2 * Math.PI * 36; // r = 36
  const progress = Math.min(stats.todaySentences / stats.dailyGoal, 1);
  const offset = circumference * (1 - progress);

  circle.style.strokeDashoffset = offset;
  countEl.textContent = stats.todaySentences;
  goalEl.textContent = stats.dailyGoal;
}

// Start practice session
async function startPractice() {
  currentWord = await chrome.runtime.sendMessage({ action: 'getRandomWord' });

  if (!currentWord) {
    document.getElementById('practice-session').style.display = 'none';
    document.getElementById('practice-setup').style.display = 'flex';
    return;
  }

  currentStepIndex = 0;
  stepResults = {};

  document.getElementById('practice-setup').style.display = 'none';
  document.getElementById('practice-session').style.display = 'flex';

  await renderCurrentStep();
}

// Render the current step
async function renderCurrentStep() {
  renderStepIndicator();
  await PRACTICE_STEPS[currentStepIndex].render(currentWord, stepResults);
}

// Render numbered step dots into #step-indicator
function renderStepIndicator() {
  const container = document.getElementById('step-indicator');
  const html = PRACTICE_STEPS.map((step, i) => {
    const isDone = i < currentStepIndex;
    const isActive = i === currentStepIndex;
    const dotClass = isDone ? 'step-dot done' : isActive ? 'step-dot active' : 'step-dot';
    const label = isDone ? '✓' : (i + 1);
    const line = i < PRACTICE_STEPS.length - 1 ? '<div class="step-line"></div>' : '';
    return `<div class="${dotClass}" title="${escapeHtml(step.label)}">${label}</div>${line}`;
  }).join('');
  container.innerHTML = html;
}

// Save step result, advance to next step or finish
async function advanceStep(result) {
  stepResults[PRACTICE_STEPS[currentStepIndex].id] = result;
  currentStepIndex++;
  if (currentStepIndex < PRACTICE_STEPS.length) {
    await renderCurrentStep();
  } else {
    await finishWord();
  }
}

// Skip to a fresh word at step 1
async function skipToNextWord() {
  await startPractice();
}

// Record practice and load next word (or return to setup if goal met)
async function finishWord() {
  const writeResult = stepResults.write;
  const rating = writeResult ? writeResult.rating : 'good';

  const practiceResult = await chrome.runtime.sendMessage({
    action: 'recordPractice',
    wordId: currentWord.id,
    rating: rating
  });

  if (practiceResult.stats) {
    stats = practiceResult.stats;
  }

  if (stats && stats.todaySentences >= stats.dailyGoal) {
    document.getElementById('practice-session').style.display = 'none';
    document.getElementById('practice-setup').style.display = 'flex';
    updateProgressRing();
    return;
  }

  await startPractice();
}

// ── Step render functions ──────────────────────────────────────────────────

function renderRecallStep(word, _stepResults) {
  const content = document.getElementById('step-content');
  content.innerHTML = `
    <div class="recall-step">
      <div class="recall-word-display">
        <div class="recall-word">${escapeHtml(word.word)}</div>
        ${word.baseForm && word.baseForm !== word.word.toLowerCase()
          ? `<div class="recall-base-form">(base: ${escapeHtml(word.baseForm)})</div>`
          : ''}
      </div>
      <button id="revealBtn" class="btn btn-secondary">Reveal Meaning</button>
      <div id="recall-reveal" class="recall-reveal" style="display: none;">
        ${word.meaning ? `
          <div class="recall-meaning">
            <div class="recall-meaning-label">Meaning</div>
            <p>${escapeHtml(word.meaning)}</p>
          </div>
        ` : ''}
        ${word.context && word.context !== word.word ? `
          <div class="recall-context">
            <div class="recall-context-label">Original context</div>
            <p>"${escapeHtml(truncate(word.context, 120))}"</p>
          </div>
        ` : ''}
        <div class="recall-rating-buttons">
          <button id="forgotBtn" class="btn btn-secondary">I forgot</button>
          <button id="rememberedBtn" class="btn btn-primary">I remembered</button>
        </div>
      </div>
      <button class="skip-link" id="skipLink">Skip word</button>
    </div>
  `;

  document.getElementById('revealBtn').addEventListener('click', () => {
    document.getElementById('recall-reveal').style.display = 'flex';
    document.getElementById('revealBtn').style.display = 'none';
  });

  document.getElementById('forgotBtn').addEventListener('click', () => advanceStep({ remembered: false }));
  document.getElementById('rememberedBtn').addEventListener('click', () => advanceStep({ remembered: true }));
  document.getElementById('skipLink').addEventListener('click', skipToNextWord);
}

async function renderFillStep(word, _stepResults) {
  const content = document.getElementById('step-content');

  let sentence = word.exampleSentence;

  if (!sentence) {
    content.innerHTML = `
      <div class="fill-step">
        <div class="fill-loading">Generating sentence… <span class="loading-spinner"></span></div>
      </div>
    `;

    const response = await chrome.runtime.sendMessage({ action: 'generateSentence', word: word.word });

    if (response.success) {
      sentence = response.content;
      word.exampleSentence = sentence;
    } else {
      // Skip this step on error
      await advanceStep({ correct: null, error: true });
      return;
    }
  }

  // Replace word/base form with blank (client-side)
  const targets = [word.word];
  if (word.baseForm && word.baseForm !== word.word.toLowerCase()) targets.push(word.baseForm);
  const wordRegex = new RegExp(`\\b(${targets.map(escapeRegex).join('|')})\\b`, 'gi');
  const sentenceWithBlank = sentence.replace(wordRegex, '___');

  // Build display sentence with styled blank span
  const displaySentence = escapeHtml(sentenceWithBlank).replace('___', '<span class="fill-blank">___</span>');

  content.innerHTML = `
    <div class="fill-step">
      <div class="fill-instruction">Fill in the blank:</div>
      <div class="fill-sentence">${displaySentence}</div>
      <div class="fill-input-row">
        <input type="text" id="fillInput" class="fill-input" placeholder="Type the word…"
               autocomplete="off" autocorrect="off" spellcheck="false">
        <button id="checkBtn" class="btn btn-primary">Check</button>
      </div>
      <div id="fill-result" class="fill-result" style="display: none;"></div>
      <button class="skip-link" id="skipLink">Skip word</button>
    </div>
  `;

  const input = document.getElementById('fillInput');
  input.focus();

  let checked = false;
  let isCorrect = false;

  const checkAnswer = async () => {
    if (checked) {
      await advanceStep({ correct: isCorrect, userAnswer: input.value.trim() });
      return;
    }

    const userAnswer = input.value.trim().toLowerCase();
    const correctAnswers = [word.word.toLowerCase()];
    if (word.baseForm) correctAnswers.push(word.baseForm.toLowerCase());
    isCorrect = correctAnswers.includes(userAnswer);
    checked = true;

    const resultEl = document.getElementById('fill-result');
    resultEl.style.display = 'block';
    resultEl.className = `fill-result ${isCorrect ? 'correct' : 'incorrect'}`;
    resultEl.textContent = isCorrect
      ? `Correct! The word is "${word.word}".`
      : `The answer was "${word.word}". You wrote "${input.value.trim()}".`;

    document.getElementById('checkBtn').textContent = 'Next →';
    input.disabled = true;
  };

  document.getElementById('checkBtn').addEventListener('click', checkAnswer);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') checkAnswer(); });
  document.getElementById('skipLink').addEventListener('click', skipToNextWord);
}

async function renderWriteStep(word, _stepResults) {
  const content = document.getElementById('step-content');

  content.innerHTML = `
    <div class="write-step">
      <div class="write-word-display">
        <label class="write-word-label">Write a sentence using:</label>
        <h2 class="write-word">${escapeHtml(word.word)}</h2>
        ${word.baseForm && word.baseForm !== word.word.toLowerCase()
          ? `<span class="write-base-form">(base: ${escapeHtml(word.baseForm)})</span>`
          : ''}
      </div>
      <div class="write-input">
        <textarea id="writeTextarea" placeholder="Type your sentence here…" rows="3"></textarea>
      </div>
      <div class="write-actions">
        <button id="writeHintBtn" class="btn btn-secondary btn-small">Show Hint</button>
        <button id="writeSubmitBtn" class="btn btn-primary">Submit</button>
      </div>
      <div id="write-hint" class="practice-hint" style="display: none;">
        <label>Example sentence:</label>
        <p id="write-example"></p>
      </div>
      <div id="write-feedback" class="practice-feedback" style="display: none;"></div>
      <button class="skip-link" id="skipLink">Skip word</button>
    </div>
  `;

  const textarea = document.getElementById('writeTextarea');
  textarea.focus();

  if (word.exampleSentence) {
    document.getElementById('write-example').textContent = word.exampleSentence;
  }

  document.getElementById('writeHintBtn').addEventListener('click', async () => {
    const hintDiv = document.getElementById('write-hint');
    const hintBtn = document.getElementById('writeHintBtn');
    const exampleEl = document.getElementById('write-example');

    hintBtn.style.display = 'none';

    if (word.exampleSentence) {
      exampleEl.textContent = word.exampleSentence;
      hintDiv.style.display = 'block';
    } else {
      exampleEl.textContent = 'Generating…';
      hintDiv.style.display = 'block';

      const response = await chrome.runtime.sendMessage({ action: 'generateSentence', word: word.word });
      if (response.success) {
        exampleEl.textContent = response.content;
        word.exampleSentence = response.content;
      } else {
        exampleEl.textContent = response.error || 'Failed to generate example';
      }
    }
  });

  const submitHandler = async () => {
    const userSentence = textarea.value.trim();
    if (!userSentence) return;

    const submitBtn = document.getElementById('writeSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="loading-spinner"></span> Evaluating…';

    const response = await chrome.runtime.sendMessage({
      action: 'evaluateSentence',
      userSentence,
      word: word.word
    });

    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit';

    const evaluation = (response.success && response.evaluation)
      ? response.evaluation
      : { isCorrect: false, rating: 'needs_improvement', feedback: response.error || 'Failed to evaluate. Please try again.', suggestion: null };

    const ratingConfig = {
      excellent:         { icon: '🌟', text: 'Excellent!' },
      good:              { icon: '👍', text: 'Good job!' },
      needs_improvement: { icon: '💡', text: 'Keep practicing!' }
    };
    const cfg = ratingConfig[evaluation.rating] || ratingConfig.needs_improvement;

    const feedbackDiv = document.getElementById('write-feedback');
    feedbackDiv.innerHTML = `
      <div class="feedback-header">
        <span class="feedback-icon">${cfg.icon}</span>
        <span class="feedback-rating ${evaluation.rating}">${cfg.text}</span>
      </div>
      <p class="feedback-text">${escapeHtml(evaluation.feedback)}</p>
      ${evaluation.suggestion ? `<p class="feedback-suggestion">${escapeHtml(evaluation.suggestion)}</p>` : ''}
      <button id="nextWordBtn" class="btn btn-primary" style="width: 100%; margin-top: 8px;">Next Word</button>
    `;
    feedbackDiv.style.display = 'block';

    document.querySelector('.write-step .write-input').style.display = 'none';
    document.querySelector('.write-step .write-actions').style.display = 'none';
    document.getElementById('skipLink').style.display = 'none';

    document.getElementById('nextWordBtn').addEventListener('click', () => {
      advanceStep({ rating: evaluation.rating, userSentence });
    });
  };

  document.getElementById('writeSubmitBtn').addEventListener('click', submitHandler);
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitHandler(); }
  });
  document.getElementById('skipLink').addEventListener('click', skipToNextWord);
}

// Render stats
function renderStats() {
  if (!stats) return;

  document.getElementById('stat-streak').textContent = stats.currentStreak;
  document.getElementById('stat-total').textContent = stats.totalSentences;
  document.getElementById('stat-words').textContent = words.length;
  document.getElementById('stat-best').textContent = stats.longestStreak;

  // Render living achievements
  renderLivingAchievements();
}

// Get current tier info for a living achievement
function getCurrentTier(achievement, value) {
  const tiers = achievement.tiers;
  let currentTier = null;
  let nextTier = tiers[0];

  for (let i = 0; i < tiers.length; i++) {
    if (value >= tiers[i].min) {
      currentTier = tiers[i];
      nextTier = tiers[i + 1] || null;
    }
  }

  return { currentTier, nextTier, value };
}

// Render living achievements
function renderLivingAchievements() {
  const achievementsList = document.getElementById('achievements-list');

  achievementsList.innerHTML = Object.entries(LIVING_ACHIEVEMENTS).map(([key, achievement]) => {
    const value = achievement.getValue(stats, words);
    const { currentTier, nextTier } = getCurrentTier(achievement, value);

    const isLocked = !currentTier;
    const tierName = currentTier ? currentTier.name : 'Locked';
    const tierColor = currentTier ? currentTier.color : '#d1d5db';

    // Calculate progress to next tier
    let progressPercent = 0;
    let progressText = '';

    if (isLocked && nextTier) {
      progressPercent = (value / nextTier.min) * 100;
      progressText = `${value}/${nextTier.min}`;
    } else if (nextTier) {
      const prevMin = currentTier.min;
      const range = nextTier.min - prevMin;
      const progress = value - prevMin;
      progressPercent = (progress / range) * 100;
      progressText = `${value}/${nextTier.min}`;
    } else {
      // Max tier reached, keep counting
      progressPercent = 100;
      progressText = achievement.format(value);
    }

    return `
      <div class="living-achievement ${isLocked ? 'locked' : ''}" style="--tier-color: ${tierColor}">
        <div class="achievement-icon-wrap">
          <span class="achievement-icon">${achievement.icon}</span>
          ${isLocked ? '<span class="lock-icon">🔒</span>' : ''}
        </div>
        <div class="achievement-info">
          <span class="achievement-name">${achievement.name}</span>
          <span class="achievement-tier">${tierName}</span>
        </div>
        <div class="achievement-progress">
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${Math.min(progressPercent, 100)}%"></div>
          </div>
          <span class="progress-text">${progressText}</span>
        </div>
      </div>
    `;
  }).join('');
}

// Utility functions
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function truncate(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Check AI availability and display status
async function checkAndDisplayAIStatus() {
  const status = await chrome.runtime.sendMessage({ action: 'checkAI' });

  if (!status.available) {
    showAIUnavailableMessage(status);
  }
}

// Show AI unavailable message in practice tab
function showAIUnavailableMessage(status) {
  const practiceSetup = document.getElementById('practice-setup');

  // Create or update the AI unavailable message
  let aiMessage = document.getElementById('ai-unavailable-message');
  if (!aiMessage) {
    aiMessage = document.createElement('div');
    aiMessage.id = 'ai-unavailable-message';
    aiMessage.className = 'ai-unavailable-message';
    practiceSetup.insertBefore(aiMessage, practiceSetup.firstChild);
  }

  if (status.status === 'downloadable') {
    aiMessage.innerHTML = `
      <div class="ai-warning">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <div>
          <strong>AI model needs to be downloaded</strong>
          <p>Chrome will download Gemini Nano (~2GB) once. This is free and runs locally on your device.</p>
          <p><a href="#" id="openSettings">Go to Settings to download</a></p>
        </div>
      </div>
    `;
    aiMessage.querySelector('#openSettings').addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
  } else if (status.status === 'downloading') {
    aiMessage.innerHTML = `
      <div class="ai-warning downloading">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        <div>
          <strong>AI model is downloading...</strong>
          <p>Chrome is downloading Gemini Nano. This may take a few minutes. You can still save words.</p>
        </div>
      </div>
    `;
  } else {
    aiMessage.innerHTML = `
      <div class="ai-warning error">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
        <div>
          <strong>Chrome AI not available</strong>
          <p>${escapeHtml(status.reason || 'This extension uses Gemini Nano, which requires Chrome 138+ desktop.')}</p>
          <p class="ai-requirements">Requirements: Chrome 138+, Windows/macOS/Linux</p>
          <p><a href="#" id="learnMore">Learn more in Settings</a></p>
        </div>
      </div>
    `;
    aiMessage.querySelector('#learnMore').addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
  }
}
