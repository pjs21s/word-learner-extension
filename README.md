# Word Learner

A Chrome extension that helps you learn new words by saving them from any webpage and practicing with AI-powered sentence writing.

## Features

### Save Words from Any Webpage
- Select any word on a webpage and click "Save Word"
- Automatically extracts the base/dictionary form (e.g., "running" → "run")
- Captures context (the sentence where you found the word)
- Use keyboard shortcut: `Ctrl/Cmd + Shift + S`

### Practice with AI
- Write sentences using your saved words
- Get instant AI feedback on grammar and usage
- Receive suggestions for improvement
- Rated as: Excellent, Good, or Needs Improvement

### Living Achievements
Achievements that evolve as you learn:

| Achievement | Tiers |
|-------------|-------|
| 🔥 Streak Keeper | Spark → Flame → Fire → Blaze → Inferno |
| 📝 Sentence Crafter | Beginner → Writer → Author → Poet → Master |
| 📚 Word Collector | Curious → Reader → Scholar → Librarian → Sage |
| ⭐ Perfectionist | Careful → Precise → Excellent → Flawless → Legendary |

### Track Your Progress
- Daily practice goals
- Streak tracking
- Total sentences written
- Words saved count

## Requirements

- Chrome 138+ (desktop)
- Chrome AI (Gemini Nano) - downloads automatically (~2GB, runs locally)

## Installation

### From Source (Development)
1. Clone this repository
2. Open `chrome://extensions` in Chrome
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the extension folder

### Chrome Web Store
Coming soon.

## How It Works

1. **Save Words**: Browse any webpage, select a word, click the "Save Word" button
2. **Review**: Open the extension popup to see your saved words with base forms
3. **Practice**: Go to the Practice tab, write sentences using your words
4. **Get Feedback**: AI evaluates your sentences and helps you improve
5. **Track Progress**: Watch your achievements evolve as you learn

## Privacy

- All AI processing happens locally on your device using Chrome's built-in Gemini Nano
- No data is sent to external servers
- Words and progress are stored locally in Chrome storage

## Tech Stack

- Chrome Extension Manifest V3
- Chrome Built-in AI (Gemini Nano)
- Vanilla JavaScript
- Chrome Storage API

## Version History

- **1.0.3** - Base form extraction, living achievements, error tracking
- **1.0.0** - Initial release

## License

MIT
