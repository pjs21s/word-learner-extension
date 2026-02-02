// Content Script - Handles text selection and save button

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
    const response = await chrome.runtime.sendMessage({
      action: 'saveWord',
      word: selection.text,
      context: selection.context,
      url: window.location.href
    });

    if (response.success) {
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
    } else {
      saveButton.classList.remove('loading');
      saveButton.classList.add('error');
      saveButton.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span>${response.error || 'Error'}</span>
      `;

      setTimeout(() => {
        hideButton();
        saveButton.classList.remove('error');
      }, 2000);
    }
  } catch (error) {
    saveButton.classList.remove('loading');
    saveButton.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <span>Error</span>
    `;

    setTimeout(hideButton, 2000);
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

      const response = await chrome.runtime.sendMessage({
        action: 'saveWord',
        word: selection.text,
        context: selection.context,
        url: window.location.href
      });

      if (response.success) {
        // Show brief notification
        showNotification('Word saved!');
      } else {
        showNotification(response.error || 'Failed to save word');
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
