// Background Service Worker - Handles API calls, storage, and badge updates

// Initialize default stats on install
chrome.runtime.onInstalled.addListener(async () => {
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
});

// Handle context menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'saveWord' && info.selectionText) {
    saveWord(info.selectionText.trim(), info.selectionText.trim(), tab.url);
  }
});

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
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

    default:
      return { error: 'Unknown action' };
  }
}

// Word management functions
async function saveWord(word, context, sourceUrl) {
  const { words } = await chrome.storage.local.get('words');

  // Check for duplicate
  const exists = words.some(w => w.word.toLowerCase() === word.toLowerCase());
  if (exists) {
    return { success: false, error: 'Word already saved' };
  }

  const newWord = {
    id: generateUUID(),
    word: word,
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
  try {
    const session = await initAISession();
    const result = await session.prompt(prompt);
    return { success: true, content: result };
  } catch (error) {
    // Reset session on error so it can be recreated
    aiSession = null;
    return { error: error.message };
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
