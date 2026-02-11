// Content Script - Handles text selection and save button

// Prevent double injection
if (window.__wordLearnerInjected) {
  console.log('[Word Learner] Already injected, skipping');
} else {
  window.__wordLearnerInjected = true;
  console.log('[Word Learner] Content script loaded');
  initWordLearner();
}

function initWordLearner() {

let saveButton = null;

// Create the floating save button
function createSaveButton() {
  const button = document.createElement('div');
  button.id = 'word-learner-save-btn';
  button.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
    </svg>
    <span>Save Word</span>
  `;
  button.style.display = 'none';
  document.body.appendChild(button);
  return button;
}

// Position the button near the selection
function positionButton(x, y) {
  if (!saveButton) {
    saveButton = createSaveButton();
  }

  // Ensure button stays within viewport
  const buttonWidth = 100;
  const buttonHeight = 32;
  const padding = 10;

  let left = x;
  let top = y + 20;

  if (left + buttonWidth > window.innerWidth - padding) {
    left = window.innerWidth - buttonWidth - padding;
  }
  if (left < padding) {
    left = padding;
  }
  if (top + buttonHeight > window.innerHeight - padding) {
    top = y - buttonHeight - 10;
  }

  saveButton.style.left = `${left}px`;
  saveButton.style.top = `${top}px`;
  saveButton.style.display = 'flex';
}

// Hide the button
function hideButton() {
  if (saveButton) {
    saveButton.style.display = 'none';
  }
}

// Get selected text
function getSelectedText() {
  const selection = window.getSelection();
  if (selection.rangeCount === 0) return null;

  const text = selection.toString().trim();
  if (!text) return null;

  // Get surrounding context (the sentence or nearby text)
  const range = selection.getRangeAt(0);
  let context = text;

  try {
    const container = range.commonAncestorContainer;
    const parentElement = container.nodeType === Node.TEXT_NODE
      ? container.parentElement
      : container;

    if (parentElement) {
      const fullText = parentElement.textContent;
      // Try to extract a sentence containing the selected text
      const sentences = fullText.match(/[^.!?]*[.!?]/g) || [fullText];
      for (const sentence of sentences) {
        if (sentence.includes(text)) {
          context = sentence.trim();
          break;
        }
      }
    }
  } catch (e) {
    // Fall back to just the selected text
  }

  return { text, context };
}

// Handle text selection
document.addEventListener('mouseup', (event) => {
  // Ignore if clicking the save button
  if (saveButton && saveButton.contains(event.target)) {
    return;
  }

  const selection = getSelectedText();

  if (selection && selection.text.length > 0 && selection.text.length < 100) {
    positionButton(event.clientX, event.clientY);
  } else {
    hideButton();
  }
});

// Handle click outside to hide button
document.addEventListener('mousedown', (event) => {
  if (saveButton && !saveButton.contains(event.target)) {
    // Small delay to allow selection to complete
    setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.toString().trim().length === 0) {
        hideButton();
      }
    }, 10);
  }
});

// Handle save button click
document.addEventListener('click', async (event) => {
  if (!saveButton || !saveButton.contains(event.target)) return;

  event.preventDefault();
  event.stopPropagation();

  const selection = getSelectedText();
  if (!selection) {
    hideButton();
    return;
  }

  // Show loading state
  saveButton.classList.add('loading');
  saveButton.innerHTML = `
    <svg class="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
      <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path>
    </svg>
    <span>Saving...</span>
  `;

  try {
    console.log('[Word Learner] Saving word:', selection.text);
    const response = await chrome.runtime.sendMessage({
      action: 'saveWord',
      word: selection.text,
      context: selection.context,
      url: window.location.href
    });
    console.log('[Word Learner] Response:', response);

    if (response && response.success) {
      saveButton.classList.remove('loading');
      saveButton.classList.add('success');
      saveButton.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>Saved!</span>
      `;

      setTimeout(() => {
        hideButton();
        saveButton.classList.remove('success');
      }, 1500);
    } else if (response && response.duplicate) {
      // Handle duplicate word - show friendly notification instead of error
      saveButton.classList.remove('loading');
      saveButton.classList.add('duplicate');
      saveButton.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span>Already saved</span>
      `;

      // Show a friendly notification with the existing word
      const message = response.baseForm
        ? `"${response.existingWord}" (same base form: ${response.baseForm})`
        : `"${response.existingWord}"`;
      showDuplicateNotification(message);

      setTimeout(() => {
        hideButton();
        saveButton.classList.remove('duplicate');
      }, 2000);
    } else {
      const errorMsg = response?.error || 'Unknown error - no response';
      console.error('[Word Learner] Save failed:', errorMsg);
      saveButton.classList.remove('loading');
      saveButton.classList.add('error');

      // Log error if not already logged
      try {
        if (!response?.logged) {
          await chrome.runtime.sendMessage({
            action: 'logError',
            error: { message: errorMsg },
            context: `saveWord failed: ${selection.text}`
          });
        }
      } catch (logErr) {
        console.error('[Word Learner] Failed to log error:', logErr);
      }

      showErrorWithFeedback(errorMsg, selection.text);
      hideButton();
      saveButton.classList.remove('error');
    }
  } catch (error) {
    console.error('[Word Learner] Exception:', error);
    saveButton.classList.remove('loading');

    // Try to log the caught error
    try {
      await chrome.runtime.sendMessage({
        action: 'logError',
        error: { message: error.message, stack: error.stack },
        context: `saveWord exception: ${selection.text}`
      });
    } catch (logErr) {
      console.error('[Word Learner] Failed to log error:', logErr);
    }

    showErrorWithFeedback(error.message || 'Error saving word', selection.text);
    hideButton();
  }

  // Clear selection
  window.getSelection().removeAllRanges();
});

// Handle keyboard shortcut (Ctrl/Cmd + Shift + S to save)
document.addEventListener('keydown', async (event) => {
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'S') {
    const selection = getSelectedText();
    if (selection && selection.text.length > 0) {
      event.preventDefault();

      try {
        const response = await chrome.runtime.sendMessage({
          action: 'saveWord',
          word: selection.text,
          context: selection.context,
          url: window.location.href
        });

        if (response.success) {
          showNotification('Word saved!');
        } else if (response.duplicate) {
          // Handle duplicate - show friendly notification
          const message = response.baseForm
            ? `"${response.existingWord}" (same base form: ${response.baseForm})`
            : `"${response.existingWord}"`;
          showDuplicateNotification(message);
        } else {
          if (!response.logged) {
            await chrome.runtime.sendMessage({
              action: 'logError',
              error: { message: response.error || 'Unknown error' },
              context: `saveWord (keyboard) failed: ${selection.text}`
            });
          }
          showErrorWithFeedback(response.error || 'Failed to save word', selection.text);
        }
      } catch (error) {
        await chrome.runtime.sendMessage({
          action: 'logError',
          error: { message: error.message, stack: error.stack },
          context: `saveWord (keyboard) exception: ${selection.text}`
        });
        showErrorWithFeedback(error.message || 'Error saving word', selection.text);
      }
    }
  }
});

// Simple notification for keyboard shortcut
function showNotification(message) {
  const notification = document.createElement('div');
  notification.id = 'word-learner-notification';
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.classList.add('fade-out');
    setTimeout(() => notification.remove(), 300);
  }, 1500);
}

// Show duplicate word notification
function showDuplicateNotification(existingWord) {
  // Remove existing notification if any
  const existing = document.getElementById('word-learner-duplicate-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'word-learner-duplicate-toast';
  toast.innerHTML = `
    <div class="wl-duplicate-content">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
      </svg>
      <div class="wl-duplicate-text">
        <strong>Already in your collection!</strong>
        <span>${escapeHtml(existingWord)}</span>
      </div>
    </div>
  `;
  document.body.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });

  // Auto-dismiss after 3 seconds
  setTimeout(() => {
    if (document.body.contains(toast)) {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }
  }, 3000);
}

// Show error with feedback option
function showErrorWithFeedback(errorMessage, word) {
  // Remove existing error toast if any
  const existing = document.getElementById('word-learner-error-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'word-learner-error-toast';
  toast.innerHTML = `
    <div class="wl-error-content">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <div class="wl-error-text">
        <strong>Error saving word</strong>
        <span>${escapeHtml(errorMessage)}</span>
      </div>
    </div>
    <div class="wl-error-actions">
      <button class="wl-dismiss-btn">Dismiss</button>
      <button class="wl-feedback-btn">Send Feedback</button>
    </div>
  `;
  document.body.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });

  // Dismiss button
  toast.querySelector('.wl-dismiss-btn').addEventListener('click', () => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  });

  // Feedback button
  toast.querySelector('.wl-feedback-btn').addEventListener('click', async () => {
    const errors = await chrome.runtime.sendMessage({ action: 'getErrors' });
    const latestError = errors[0];

    const feedbackData = {
      error: errorMessage,
      word: word,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      details: latestError ? JSON.stringify(latestError, null, 2) : 'No details'
    };

    const subject = encodeURIComponent('Word Learner Error Report');
    const body = encodeURIComponent(`
Error: ${feedbackData.error}
Word: ${feedbackData.word}
URL: ${feedbackData.url}
Time: ${feedbackData.timestamp}

Details:
${feedbackData.details}

Additional notes:
(Please describe what you were doing when this happened)
    `.trim());

    // Open email client with pre-filled report
    window.open(`mailto:jsgd1254@gmail.com?subject=${subject}&body=${body}`);

    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  });

  // Auto-dismiss after 10 seconds
  setTimeout(() => {
    if (document.body.contains(toast)) {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }
  }, 10000);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

} // end initWordLearner
