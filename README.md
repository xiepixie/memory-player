# Memory Player

Turn your notes into long-term memory. A local-first spaced repetition player for your markdown knowledge base.

## Features

- **Markdown Native**: Edit your files directly on your disk. No proprietary formats. You own your data forever.
- **Spaced Repetition**: Built-in FSRS (Free Spaced Repetition Scheduler) algorithm schedules reviews at the perfect time to maximize retention.
- **Cloud Sync**: Seamlessly sync your review progress across devices via Supabase, while keeping your files local.
- **Anki-style Cloze**: Supports standard `{{c1::Answer}}` and `{{c1::Answer::Hint}}` syntax for flashcards.
- **Immersive Mode**: Distraction-free reading and reviewing experience.

## Tech Stack

- **Frontend**: React, TypeScript, TailwindCSS, DaisyUI
- **State Management**: Zustand
- **Backend/Sync**: Supabase
- **Desktop Framework**: Tauri v2 (Rust)
- **Algorithm**: ts-fsrs

## Getting Started

### Prerequisites

- Node.js (v18+)
- Rust (latest stable)
- Supabase Project (for sync features)

### Installation

1.  **Install dependencies**
    ```bash
    bun install
    ```

2.  **Setup Environment Variables**
    Copy `.env.example` to `.env` and fill in your Supabase credentials.
    ```bash
    cp .env.example .env
    ```

3.  **Run in Development Mode**
    ```bash
    bun tauri dev
    ```

### Building for Production

To build the application for your OS:

```bash
bun tauri build
```

## Project Structure

- `/src`: React frontend application
  - `/components`: UI Components
  - `/lib`: Core logic (Markdown parsing, FSRS, Storage adapters)
  - `/store`: Global state (Zustand)
- `/src-tauri`: Rust backend configuration

## License

MIT
