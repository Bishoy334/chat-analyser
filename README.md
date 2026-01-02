# Chat Analyser

A powerful TypeScript tool that analyses chat exports from WhatsApp, Instagram, and Android Messages. Generates comprehensive statistics and interactive HTML reports to explore your messaging patterns.

## Features

- **Multi-Platform Support** - Analyse chats from WhatsApp (.txt), Instagram (.json), and Android Messages (.xml)
- **Interactive CLI** - Easy-to-use menu-driven interface with progress indicators
- **Comprehensive Metrics** - Message counts, word frequencies, emoji usage, response times, and more
- **Hierarchical Analysis** - Aggregate statistics across multiple chats and platforms
- **HTML Dashboard** - Beautiful interactive reports viewable in any browser
- **Name Normalisation** - Intelligently matches participants across platforms
- **Session Detection** - Identifies conversation sessions and calculates engagement time

## Installation

```bash
# Clone the repository
git clone git@github.com:Bishoy334/ChatAnalyser.git
cd chat_analyser

# Install dependencies
npm install
```

## Usage

### Interactive Mode (Recommended)

```bash
npx tsx src/index.ts
```

This launches the interactive CLI where you can:
1. Analyse a custom directory
2. Browse and analyse sample datasets
3. View platform-specific export instructions
4. Access help documentation

### Direct Mode

```bash
npx tsx src/index.ts <input-directory> [output-file]
```

**Examples:**
```bash
# Analyse chats in a directory
npx tsx src/index.ts ./my-chats

# Specify output location
npx tsx src/index.ts ./my-chats ./results/analysis.json
```

## Supported Platforms

### WhatsApp
- Export format: `.txt` files
- How to export: Open chat > Menu > More > Export chat (without media)

### Instagram
- Export format: `.json` files
- How to export: Settings > Your Activity > Download Your Information > Messages

## Output

The tool generates two files in your input directory:

| File | Description |
|------|-------------|
| `hierarchical_analysis.json` | Raw analysis data for programmatic use |
| `hierarchical_analysis.html` | Interactive dashboard for visual exploration |

## Analysis Metrics

### Per-Message Statistics
- Total messages, words, characters
- Emoji usage and frequencies
- Media attachments (photos, videos, audio)
- Links and domain extraction

### Per-Person Breakdown
- Message counts and averages
- Top words and emojis used
- Response time analysis (median, average, distribution)
- Activity heatmap (hourly/weekly patterns)
- Conversation streaks

### Temporal Analysis
- Hourly and weekly activity histograms
- Conversation sessions with timing data
- Total engagement time estimation
- Session initiator tracking

### Cross-Platform Insights
- Aggregate statistics across all platforms
- Per-platform comparisons
- Participant presence across chats

## Project Structure

```
src/
├── parsers/           # Platform-specific chat parsers
├── analysis/          # Metrics computation and aggregation
├── cli/               # Command-line interface
├── html/              # HTML report generation
├── types/             # TypeScript type definitions
└── utils/             # Shared utilities
```

## Configuration

Key settings in `src/utils/constants.ts`:

| Setting | Default | Description |
|---------|---------|-------------|
| `DEFAULT_SESSION_GAP_MS` | 45 min | Gap threshold for new conversation sessions |
| `DEFAULT_ENGAGEMENT_GAP_MS` | 2 min | Gap threshold for engagement periods |
| `MAX_TOP_EMOJIS` | 20 | Number of top emojis to track |
| `MAX_TOP_WORDS` | 50 | Number of top words globally |
| `MIN_WORD_LENGTH` | 3 | Minimum word length for word analysis |

## File Organisation

Place your chat exports in the `assets/` directory organised by person or group:

```
assets/
├── John/
│   ├── whatsapp_chat.txt
│   └── instagram_messages.json
├── Family Group/
│   └── whatsapp_export.txt
└── _old/              # Directories starting with _ are ignored
    └── archived_chat.txt
```

## Dependencies

- **emoji-regex** - Emoji pattern matching
- **grapheme-splitter** - Unicode grapheme handling
- **xml2js** - XML parsing for Android Messages
- **iconv-lite** - Character encoding conversion
- **nspell** - Spell checking utilities

## Requirements

- Node.js 18+
- npm or yarn