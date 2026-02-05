// Popup script - Main UI logic

// State
let currentWord = null;
let words = [];
let stats = null;

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

  // Practice tab
  document.getElementById('startPractice').addEventListener('click', startPractice);
  document.getElementById('showHint').addEventListener('click', showHint);
  document.getElementById('skipWord').addEventListener('click', skipWord);
  document.getElementById('submitSentence').addEventListener('click', submitSentence);
  document.getElementById('nextWord').addEventListener('click', nextWord);

  // Enter key to submit
  document.getElementById('userSentence').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitSentence();
    }
  });
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

  if (!words || words.length === 0) {
    wordsList.innerHTML = '';
    emptyState.style.display = 'flex';
    return;
  }

  emptyState.style.display = 'none';

  // Sort by most recent first
  const sortedWords = [...words].sort((a, b) => b.createdAt - a.createdAt);

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
    return;
  }

  document.getElementById('practice-setup').style.display = 'none';
  document.getElementById('practice-session').style.display = 'flex';
  document.getElementById('practice-feedback').style.display = 'none';

  document.getElementById('practice-word-text').textContent = currentWord.word;

  // Show base form if different from the original word
  const baseFormEl = document.getElementById('practice-base-form');
  if (currentWord.baseForm && currentWord.baseForm !== currentWord.word.toLowerCase()) {
    baseFormEl.textContent = `(base: ${currentWord.baseForm})`;
    baseFormEl.style.display = 'block';
  } else {
    baseFormEl.style.display = 'none';
  }

  document.getElementById('practice-hint').style.display = 'none';
  document.getElementById('showHint').style.display = 'block';
  document.getElementById('userSentence').value = '';
  document.getElementById('userSentence').focus();

  // Pre-load example sentence if available
  if (currentWord.exampleSentence) {
    document.getElementById('practice-example').textContent = currentWord.exampleSentence;
  }
}

// Show hint (example sentence)
async function showHint() {
  const hintDiv = document.getElementById('practice-hint');
  const hintBtn = document.getElementById('showHint');
  const exampleEl = document.getElementById('practice-example');

  hintBtn.style.display = 'none';

  if (currentWord.exampleSentence) {
    exampleEl.textContent = currentWord.exampleSentence;
    hintDiv.style.display = 'block';
  } else {
    // Generate example sentence
    exampleEl.textContent = 'Generating...';
    hintDiv.style.display = 'block';

    const response = await chrome.runtime.sendMessage({
      action: 'generateSentence',
      word: currentWord.word
    });

    if (response.success) {
      exampleEl.textContent = response.content;
      currentWord.exampleSentence = response.content;
    } else {
      exampleEl.textContent = response.error || 'Failed to generate example';
    }
  }
}

// Skip current word
async function skipWord() {
  currentWord = await chrome.runtime.sendMessage({ action: 'getRandomWord' });

  if (currentWord) {
    document.getElementById('practice-word-text').textContent = currentWord.word;
    document.getElementById('practice-hint').style.display = 'none';
    document.getElementById('showHint').style.display = 'block';
    document.getElementById('practice-feedback').style.display = 'none';
    document.getElementById('userSentence').value = '';
    document.getElementById('userSentence').focus();

    if (currentWord.exampleSentence) {
      document.getElementById('practice-example').textContent = currentWord.exampleSentence;
    }
  }
}

// Submit sentence for evaluation
async function submitSentence() {
  const userSentence = document.getElementById('userSentence').value.trim();

  if (!userSentence) {
    return;
  }

  const submitBtn = document.getElementById('submitSentence');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="loading-spinner"></span> Evaluating...';

  const response = await chrome.runtime.sendMessage({
    action: 'evaluateSentence',
    userSentence: userSentence,
    word: currentWord.word
  });

  submitBtn.disabled = false;
  submitBtn.textContent = 'Submit';

  if (response.success && response.evaluation) {
    showFeedback(response.evaluation);

    // Record practice
    const practiceResult = await chrome.runtime.sendMessage({
      action: 'recordPractice',
      wordId: currentWord.id,
      rating: response.evaluation.rating
    });

    if (practiceResult.stats) {
      stats = practiceResult.stats;
    }
  } else {
    showFeedback({
      isCorrect: false,
      rating: 'needs_improvement',
      feedback: response.error || 'Failed to evaluate sentence. Please try again.',
      suggestion: null
    });
  }
}

// Show feedback
function showFeedback(evaluation) {
  const feedbackDiv = document.getElementById('practice-feedback');
  const iconEl = feedbackDiv.querySelector('.feedback-icon');
  const ratingEl = feedbackDiv.querySelector('.feedback-rating');
  const textEl = feedbackDiv.querySelector('.feedback-text');
  const suggestionEl = feedbackDiv.querySelector('.feedback-suggestion');

  // Set icon and rating
  const ratingConfig = {
    excellent: { icon: '🌟', text: 'Excellent!' },
    good: { icon: '👍', text: 'Good job!' },
    needs_improvement: { icon: '💡', text: 'Keep practicing!' }
  };

  const config = ratingConfig[evaluation.rating] || ratingConfig.needs_improvement;
  iconEl.textContent = config.icon;
  ratingEl.textContent = config.text;
  ratingEl.className = `feedback-rating ${evaluation.rating}`;

  textEl.textContent = evaluation.feedback;
  suggestionEl.textContent = evaluation.suggestion || '';

  // Hide input controls, show feedback
  document.querySelector('.practice-input').style.display = 'none';
  document.querySelector('.practice-actions').style.display = 'none';
  document.getElementById('showHint').style.display = 'none';
  feedbackDiv.style.display = 'block';
}

// Next word
async function nextWord() {
  // Check if daily goal is met
  if (stats && stats.todaySentences >= stats.dailyGoal) {
    // Show completion message
    document.getElementById('practice-session').style.display = 'none';
    document.getElementById('practice-setup').style.display = 'flex';
    updateProgressRing();
    return;
  }

  // Reset UI
  document.querySelector('.practice-input').style.display = 'flex';
  document.querySelector('.practice-actions').style.display = 'flex';

  // Get next word
  await startPractice();
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
