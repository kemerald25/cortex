# Cortex 🧠

Cortex is a mobile-first, AI-powered study companion and active recall platform designed to transform raw course materials into structured, high-impact study resources. By processing lecture notes, textbooks, and slides, Cortex helps students learn faster and retain knowledge longer using cognitive science principles.

---

## 🚀 Key Features

### 1. Course Material Processing & Syllabus Parsing
*   **Doc Chunking & Semantic Search**: Processes large PDFs, textbooks, slides, and files, splitting them into manageable chunks for vector embeddings.
*   **AI Table of Contents (TOC)**: Automatically extracts a structured syllabus/topics outline from uploaded documents to map out courses.

### 2. Conciser Study Note Compiler
*   Generates exam-oriented study notes directly grounded on course materials.
*   Every note includes:
    *   **Core Idea**: A 1-2 sentence high-level summary of the concept.
    *   **Key Definitions**: Clear, concise terminology definitions (focused on 3 to 5 terms for high impact).
    *   **Process / Logic**: Step-by-step workflows, architectures, or stages of the concept rendered in clean lists.
    *   **Formula / Code**: Relevant equations or code snippets.
    *   **Common Exam Angles**: Anticipated questions, trap points, and exam structure tips.

### 3. Active Recall & Spaced Repetition (SRS)
*   **AI-Generated Flashcards**: Automatically generates review questions and answers from study notes.
*   **SM-2 Algorithm Integration**: Schedules flashcard reviews dynamically based on active recall performance (1-5 ratings), optimizing memory retention.

### 4. Grounded AI Study Partner
*   Includes a contextual chat assistant for each topic, answering questions based exclusively on the relevant segments of the uploaded course material.

### 5. Resilient AI Pipeline (Fail-Safe JSON Engine)
*   **Stack-based JSON Recovery**: Employs a stack-based parser to dynamically repair truncated AI JSON responses (closing open strings and missing brackets/braces from token-limit cutoffs).
*   **API Token Rotation Pool**: Seamlessly rotates requests across multiple Cloudflare API tokens, providing automatic failover if a token encounters rate-limiting (`429 Too Many Requests`) or network issues.

---

## 🛠️ Technology Stack

*   **Framework**: [Next.js](https://nextjs.org/) (React, App Router)
*   **Styling**: Premium, responsive mobile-first UI using Vanilla CSS and Tailwind CSS.
*   **Database**: [Supabase](https://supabase.com/) (PostgreSQL)
*   **AI Services**: Cloudflare Workers AI (specifically `@cf/meta/llama-3.1-8b-instruct-fast` for generation and `@cf/baai/bge-large-en-v1.5` for text embeddings)

---

## 📦 Getting Started

### 1. Configure Environment Variables
Create a `.env` file in the root directory:
```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

CLOUDFLARE_ACCOUNT_ID=your-cloudflare-account-id
# Supports single or multiple comma-separated tokens for automatic rotation:
CLOUDFLARE_API_TOKEN=token1,token2
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Run the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) with your browser to launch the app.
