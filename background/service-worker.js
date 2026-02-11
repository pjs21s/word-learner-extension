// Background Service Worker - Handles API calls, storage, and badge updates
console.log('[Word Learner] Service worker loaded');

// Initialize default stats on install
chrome.runtime.onInstalled.addListener(async (details) => {
  const { stats } = await chrome.storage.local.get('stats');
  if (!stats) {
    await chrome.storage.local.set({
      stats: {
        dailyGoal: 5,
        currentStreak: 0,
        longestStreak: 0,
        todaySentences: 0,
        lastActiveDate: null,
        totalSentences: 0,
        achievements: []
      }
    });
  }

  const { words } = await chrome.storage.local.get('words');
  if (!words) {
    await chrome.storage.local.set({ words: [] });
  }

  // Create context menu item
  chrome.contextMenus.create({
    id: 'saveWord',
    title: 'Save word to Word Learner',
    contexts: ['selection']
  });

  updateBadge();

  // Inject content scripts into all existing tabs on install/update
  if (details.reason === 'install' || details.reason === 'update') {
    injectContentScriptsToAllTabs();
  }
});

// Inject content scripts into all existing tabs
async function injectContentScriptsToAllTabs() {
  console.log('[Word Learner] Injecting content scripts to existing tabs...');
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      // Skip chrome://, edge://, about:, etc.
      if (!tab.url || !tab.url.startsWith('http')) {
        continue;
      }
      try {
        // Inject CSS
        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ['styles/content.css']
        });
        // Inject JS
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/content.js']
        });
        console.log('[Word Learner] Injected into tab:', tab.id, tab.url);
      } catch (err) {
        // Tab might be restricted (chrome pages, etc.)
        console.log('[Word Learner] Could not inject into tab:', tab.id, err.message);
      }
    }
  } catch (err) {
    console.error('[Word Learner] Failed to inject content scripts:', err);
  }
}

// Handle context menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'saveWord' && info.selectionText) {
    saveWord(info.selectionText.trim(), info.selectionText.trim(), tab.url);
  }
});

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Word Learner] Message received:', message.action);
  handleMessage(message, sender)
    .then(response => {
      console.log('[Word Learner] Sending response for:', message.action);
      sendResponse(response);
    })
    .catch(error => {
      console.error('[Word Learner] handleMessage error:', error);
      sendResponse({ success: false, error: error.message, logged: false });
    });
  return true; // Keep channel open for async response
});

async function handleMessage(message, sender) {
  switch (message.action) {
    case 'saveWord':
      return await saveWord(message.word, message.context, message.url);

    case 'getWords':
      return await getWords();

    case 'deleteWord':
      return await deleteWord(message.id);

    case 'generateSentence':
      return await generateExampleSentence(message.word);

    case 'evaluateSentence':
      return await evaluateSentence(message.userSentence, message.word);

    case 'getStats':
      return await getStats();

    case 'updateStats':
      return await updateStats(message.updates);

    case 'getRandomWord':
      return await getRandomWord();

    case 'recordPractice':
      return await recordPractice(message.wordId, message.rating);

    case 'checkAI':
      return await checkAIAvailability();

    case 'downloadAI':
      // Trigger model download by creating a session
      try {
        await initAISession();
        return { success: true };
      } catch (e) {
        return { error: e.message };
      }

    case 'logError':
      return await logError(message.error, message.context);

    case 'getErrors':
      return await getErrors();

    case 'clearErrors':
      return await clearErrors();

    default:
      return { error: 'Unknown action' };
  }
}

// Word management functions
async function saveWord(word, context, sourceUrl) {
  console.log('[Word Learner] saveWord called:', word);
  try {
    const { words } = await chrome.storage.local.get('words');
    console.log('[Word Learner] Current words count:', words?.length);

    // Check for exact duplicate
    const exactMatch = words.find(w => w.word.toLowerCase() === word.toLowerCase());
    if (exactMatch) {
      console.log('[Word Learner] Word already exists (exact match)');
      return { success: false, duplicate: true, existingWord: exactMatch.word };
    }

    // Extract base form using AI
    console.log('[Word Learner] Extracting base form...');
    const baseForm = await extractBaseForm(word, context);
    console.log('[Word Learner] Base form:', baseForm);

    // Check for duplicate by base form (e.g., "went" when "go" exists)
    const baseFormMatch = words.find(w => w.baseForm && w.baseForm.toLowerCase() === baseForm.toLowerCase());
    if (baseFormMatch) {
      console.log('[Word Learner] Word already exists (same base form):', baseFormMatch.word);
      return { success: false, duplicate: true, existingWord: baseFormMatch.word, baseForm: baseForm };
    }

    const newWord = {
      id: generateUUID(),
      word: word,
      baseForm: baseForm,
      context: context,
      sourceUrl: sourceUrl,
      createdAt: Date.now(),
      practiceCount: 0,
      lastPracticed: null,
      exampleSentence: null
    };

    words.push(newWord);
    await chrome.storage.local.set({ words });

    // Check for first_word achievement
    await checkAchievement('first_word', words.length >= 1);

    updateBadge();
    return { success: true, word: newWord };
  } catch (error) {
    await logError(error, `saveWord: ${word}`);
    return { success: false, error: error.message, logged: true };
  }
}

async function getWords() {
  const { words } = await chrome.storage.local.get('words');
  return words || [];
}

async function deleteWord(id) {
  const { words } = await chrome.storage.local.get('words');
  const filtered = words.filter(w => w.id !== id);
  await chrome.storage.local.set({ words: filtered });
  return { success: true };
}

async function getRandomWord() {
  const { words } = await chrome.storage.local.get('words');
  if (!words || words.length === 0) {
    return null;
  }

  // Prioritize words that haven't been practiced recently
  const sortedWords = [...words].sort((a, b) => {
    if (!a.lastPracticed) return -1;
    if (!b.lastPracticed) return 1;
    return a.lastPracticed - b.lastPracticed;
  });

  // Pick from the least practiced third
  const poolSize = Math.max(1, Math.floor(sortedWords.length / 3));
  const randomIndex = Math.floor(Math.random() * poolSize);
  return sortedWords[randomIndex];
}

async function recordPractice(wordId, rating) {
  const { words } = await chrome.storage.local.get('words');
  const wordIndex = words.findIndex(w => w.id === wordId);

  if (wordIndex !== -1) {
    words[wordIndex].practiceCount++;
    words[wordIndex].lastPracticed = Date.now();
    await chrome.storage.local.set({ words });
  }

  // Update stats
  const stats = await updateDailyStats(rating);

  return { success: true, stats };
}

// Stats management
async function getStats() {
  const { stats } = await chrome.storage.local.get('stats');
  return stats;
}

async function updateStats(updates) {
  const { stats } = await chrome.storage.local.get('stats');
  const newStats = { ...stats, ...updates };
  await chrome.storage.local.set({ stats: newStats });
  updateBadge();
  return newStats;
}

async function updateDailyStats(rating) {
  const { stats } = await chrome.storage.local.get('stats');
  const today = new Date().toISOString().split('T')[0];

  // Check if it's a new day
  if (stats.lastActiveDate !== today) {
    // Check if streak continues (was active yesterday)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (stats.lastActiveDate === yesterdayStr) {
      stats.currentStreak++;
    } else if (stats.lastActiveDate !== today) {
      stats.currentStreak = 1;
    }

    stats.todaySentences = 0;
    stats.lastActiveDate = today;
  }

  stats.todaySentences++;
  stats.totalSentences++;

  // Update longest streak
  if (stats.currentStreak > stats.longestStreak) {
    stats.longestStreak = stats.currentStreak;
  }

  // Track excellent ratings for perfect_10 achievement
  if (rating === 'excellent') {
    stats.excellentCount = (stats.excellentCount || 0) + 1;
  }

  await chrome.storage.local.set({ stats });

  // Check achievements
  await checkAchievements(stats);

  updateBadge();
  return stats;
}

async function checkAchievements(stats) {
  await checkAchievement('first_sentence', stats.totalSentences >= 1);
  await checkAchievement('streak_3', stats.currentStreak >= 3);
  await checkAchievement('streak_7', stats.currentStreak >= 7);
  await checkAchievement('streak_30', stats.currentStreak >= 30);
  await checkAchievement('sentences_10', stats.totalSentences >= 10);
  await checkAchievement('sentences_50', stats.totalSentences >= 50);
  await checkAchievement('sentences_100', stats.totalSentences >= 100);
  await checkAchievement('perfect_10', (stats.excellentCount || 0) >= 10);
}

async function checkAchievement(achievementId, condition) {
  if (!condition) return false;

  const { stats } = await chrome.storage.local.get('stats');
  if (!stats.achievements.includes(achievementId)) {
    stats.achievements.push(achievementId);
    await chrome.storage.local.set({ stats });
    return true;
  }
  return false;
}

// Chrome Built-in AI integration
let aiSession = null;

async function checkAIAvailability() {
  if (!('LanguageModel' in self)) {
    return { available: false, reason: 'Chrome AI not supported in this browser' };
  }

  try {
    const availability = await LanguageModel.availability();
    // Returns: 'available', 'downloadable', 'downloading', 'unavailable'
    return {
      available: availability === 'available',
      status: availability,
      reason: availability === 'unavailable'
        ? 'Chrome AI is not available on this device'
        : availability === 'downloadable'
        ? 'AI model needs to be downloaded'
        : availability === 'downloading'
        ? 'AI model is downloading...'
        : null
    };
  } catch (error) {
    return { available: false, reason: error.message };
  }
}

async function initAISession() {
  if (aiSession) return aiSession;

  const { available, reason } = await checkAIAvailability();
  if (!available) {
    throw new Error(reason || 'Chrome AI not available');
  }

  aiSession = await LanguageModel.create({
    initialPrompts: [
      {
        role: 'system',
        content: 'You are a helpful language learning assistant. Keep responses concise.'
      }
    ]
  });

  return aiSession;
}

async function promptAI(prompt) {
  console.log('[Word Learner] promptAI called');
  try {
    const session = await initAISession();
    console.log('[Word Learner] AI session ready, prompting...');
    const result = await session.prompt(prompt);
    console.log('[Word Learner] AI response received');
    return { success: true, content: result };
  } catch (error) {
    console.error('[Word Learner] promptAI error:', error);
    // Reset session on error so it can be recreated
    aiSession = null;
    return { error: error.message };
  }
}

async function extractBaseForm(word, context) {
  console.log('[Word Learner] extractBaseForm called for:', word);
  try {
    const prompt = `What is the base/dictionary form of the word "${word}"?
Context: "${context}"
Reply with ONLY the base form, nothing else. For example:
- "running" → "run"
- "went" → "go"
- "better" → "good"
- "cats" → "cat"`;

    const result = await promptAI(prompt);
    console.log('[Word Learner] AI result:', result);
    if (result.success) {
      return result.content.trim().toLowerCase();
    }
    console.log('[Word Learner] AI failed, using fallback');
    return word.toLowerCase(); // Fallback to original word
  } catch (error) {
    console.error('[Word Learner] extractBaseForm error:', error);
    return word.toLowerCase(); // Fallback on error
  }
}

async function generateExampleSentence(word) {
  const prompt = `Generate one natural example sentence using the word "${word}" that helps a language learner understand its meaning. Under 20 words. Output only the sentence.`;

  const result = await promptAI(prompt);

  if (result.success) {
    // Save the example sentence to the word
    const { words } = await chrome.storage.local.get('words');
    const wordIndex = words.findIndex(w => w.word.toLowerCase() === word.toLowerCase());
    if (wordIndex !== -1) {
      words[wordIndex].exampleSentence = result.content;
      await chrome.storage.local.set({ words });
    }
  }

  return result;
}

async function evaluateSentence(userSentence, word) {
  const prompt = `Evaluate this sentence by a language learner:
"${userSentence}"
Target word: "${word}"

Reply in JSON only:
{"isCorrect":true/false,"rating":"excellent"/"good"/"needs_improvement","feedback":"brief feedback","suggestion":"improved version or null"}`;

  const result = await promptAI(prompt);

  if (result.success) {
    try {
      // Extract JSON from the response
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const evaluation = JSON.parse(jsonMatch[0]);
        return { success: true, evaluation };
      }
    } catch (e) {
      return { error: 'Failed to parse evaluation response' };
    }
  }

  return result;
}

// Badge update
async function updateBadge() {
  const { stats } = await chrome.storage.local.get('stats');
  if (stats) {
    const remaining = Math.max(0, stats.dailyGoal - stats.todaySentences);
    if (remaining === 0) {
      chrome.action.setBadgeText({ text: '✓' });
      chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
    } else {
      chrome.action.setBadgeText({ text: remaining.toString() });
      chrome.action.setBadgeBackgroundColor({ color: '#3b82f6' });
    }
  }
}

// Error logging functions
async function logError(error, context = '') {
  const { errors = [] } = await chrome.storage.local.get('errors');

  const errorEntry = {
    id: generateUUID(),
    message: error.message || String(error),
    stack: error.stack || null,
    context: context,
    timestamp: Date.now(),
    userAgent: navigator.userAgent
  };

  // Keep only last 20 errors
  errors.unshift(errorEntry);
  if (errors.length > 20) {
    errors.pop();
  }

  await chrome.storage.local.set({ errors });
  return errorEntry;
}

async function getErrors() {
  const { errors = [] } = await chrome.storage.local.get('errors');
  return errors;
}

async function clearErrors() {
  await chrome.storage.local.set({ errors: [] });
  return { success: true };
}

// Utility function
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Update badge on startup
updateBadge();
