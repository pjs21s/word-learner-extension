// Options page script

// DOM Elements
const dailyGoalInput = document.getElementById('dailyGoal');
const goalButtons = document.querySelectorAll('.goal-btn');
const targetLanguageSelect = document.getElementById('targetLanguage');
const exportDataBtn = document.getElementById('exportData');
const clearDataBtn = document.getElementById('clearData');
const saveSettingsBtn = document.getElementById('saveSettings');
const saveStatus = document.getElementById('saveStatus');

// AI Status Elements
const aiStatusIndicator = document.getElementById('ai-status-indicator');
const aiStatusText = document.getElementById('ai-status-text');
const downloadAIBtn = document.getElementById('downloadAI');
const aiRequirements = document.getElementById('ai-requirements');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await checkAIStatus();
  setupEventListeners();
});

// Load existing settings
async function loadSettings() {
  const { settings } = await chrome.storage.local.get(['settings']);
  const { stats } = await chrome.storage.local.get('stats');

  const currentGoal = stats?.dailyGoal || 5;
  dailyGoalInput.value = currentGoal;
  updateGoalButtons(currentGoal);

  if (settings?.targetLanguage) {
    targetLanguageSelect.value = settings.targetLanguage;
  }
}

// Check AI availability
async function checkAIStatus() {
  const status = await chrome.runtime.sendMessage({ action: 'checkAI' });

  if (status.available) {
    aiStatusIndicator.className = 'status-indicator available';
    aiStatusText.textContent = 'AI Ready';
    downloadAIBtn.style.display = 'none';
    aiRequirements.style.display = 'none';
  } else if (status.status === 'downloadable') {
    aiStatusIndicator.className = 'status-indicator downloadable';
    aiStatusText.textContent = 'AI model needs to be downloaded';
    downloadAIBtn.style.display = 'block';
    aiRequirements.style.display = 'none';
  } else if (status.status === 'downloading') {
    aiStatusIndicator.className = 'status-indicator downloading';
    aiStatusText.textContent = 'AI model is downloading...';
    downloadAIBtn.style.display = 'none';
    aiRequirements.style.display = 'none';
  } else {
    aiStatusIndicator.className = 'status-indicator unavailable';
    aiStatusText.textContent = status.reason || 'AI not available';
    downloadAIBtn.style.display = 'none';
    aiRequirements.style.display = 'block';
  }
}

// Download AI model
async function downloadAIModel() {
  downloadAIBtn.disabled = true;
  downloadAIBtn.textContent = 'Downloading...';
  aiStatusIndicator.className = 'status-indicator downloading';
  aiStatusText.textContent = 'Downloading AI model...';

  const result = await chrome.runtime.sendMessage({ action: 'downloadAI' });

  if (result.success) {
    aiStatusIndicator.className = 'status-indicator available';
    aiStatusText.textContent = 'AI Ready';
    downloadAIBtn.style.display = 'none';
  } else {
    aiStatusIndicator.className = 'status-indicator unavailable';
    aiStatusText.textContent = result.error || 'Download failed';
    downloadAIBtn.disabled = false;
    downloadAIBtn.textContent = 'Download AI Model';
  }
}

// Setup event listeners
function setupEventListeners() {
  // Download AI model button
  downloadAIBtn.addEventListener('click', downloadAIModel);

  // Goal preset buttons
  goalButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const goal = parseInt(btn.dataset.goal);
      dailyGoalInput.value = goal;
      updateGoalButtons(goal);
    });
  });

  // Custom goal input
  dailyGoalInput.addEventListener('input', () => {
    const goal = parseInt(dailyGoalInput.value);
    updateGoalButtons(goal);
  });

  // Export data
  exportDataBtn.addEventListener('click', exportData);

  // Clear data
  clearDataBtn.addEventListener('click', showClearConfirmation);

  // Save settings
  saveSettingsBtn.addEventListener('click', saveSettings);
}

// Update goal button states
function updateGoalButtons(currentGoal) {
  goalButtons.forEach(btn => {
    const btnGoal = parseInt(btn.dataset.goal);
    btn.classList.toggle('active', btnGoal === currentGoal);
  });
}

// Save settings
async function saveSettings() {
  const dailyGoal = parseInt(dailyGoalInput.value) || 5;
  const targetLanguage = targetLanguageSelect.value;

  // Validate daily goal
  if (dailyGoal < 1 || dailyGoal > 50) {
    showStatus('Daily goal must be between 1 and 50', true);
    return;
  }

  // Save settings
  await chrome.storage.local.set({
    settings: {
      targetLanguage
    }
  });

  // Update daily goal in stats
  const { stats } = await chrome.storage.local.get('stats');
  if (stats) {
    stats.dailyGoal = dailyGoal;
    await chrome.storage.local.set({ stats });
  }

  showStatus('Settings saved successfully!');
}

// Show status message
function showStatus(message, isError = false) {
  saveStatus.textContent = message;
  saveStatus.classList.toggle('error', isError);
  saveStatus.classList.add('visible');

  setTimeout(() => {
    saveStatus.classList.remove('visible');
  }, 3000);
}

// Export data
async function exportData() {
  const { words, stats } = await chrome.storage.local.get(['words', 'stats']);

  const exportObj = {
    words: words || [],
    stats: stats || {},
    exportDate: new Date().toISOString()
  };

  const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `word-learner-export-${new Date().toISOString().split('T')[0]}.json`;
  a.click();

  URL.revokeObjectURL(url);
  showStatus('Data exported successfully!');
}

// Show clear confirmation dialog
function showClearConfirmation() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>Clear All Data?</h3>
      <p>This will permanently delete all your saved words, statistics, and achievements. This action cannot be undone.</p>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="cancelClear">Cancel</button>
        <button class="btn btn-danger" id="confirmClear">Clear All Data</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('cancelClear').addEventListener('click', () => {
    overlay.remove();
  });

  document.getElementById('confirmClear').addEventListener('click', async () => {
    await clearAllData();
    overlay.remove();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  });
}

// Clear all data
async function clearAllData() {
  await chrome.storage.local.set({
    words: [],
    stats: {
      dailyGoal: parseInt(dailyGoalInput.value) || 5,
      currentStreak: 0,
      longestStreak: 0,
      todaySentences: 0,
      lastActiveDate: null,
      totalSentences: 0,
      achievements: []
    }
  });

  showStatus('All data cleared successfully!');
}
