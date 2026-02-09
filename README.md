# Flash-XB7

Multi-lingual vocabulary learning app with AI-powered flashcards.

## Features

- Support for English, Spanish, and Chinese
- AI-powered word extraction and translation
- Study modes: Flashcards, Translation tests, Sentence building
- PDF export functionality
- Progressive Web App (PWA) support

## Deployment

### Vercel Deployment

1. Install Vercel CLI:
```bash
npm install -g vercel
```

2. Deploy:
```bash
vercel
```

### Manual Deployment

Upload all files to any static hosting service. The app uses ES modules and import maps, so it works without a build step.

## Local Development

Since this app uses import maps and ES modules from CDN, you can:

1. Use any HTTP server (Python, Node.js http-server, VS Code Live Server, etc.)
2. Or deploy directly to Vercel/Netlify

## Environment Variables

Create a `.env.local` file with:
```
GEMINI_API_KEY=your_api_key_here
```

## Tech Stack

- React 19
- TypeScript
- Tailwind CSS (CDN)
- OpenAI SDK (DeepSeek API)
- Supabase
- jsPDF
