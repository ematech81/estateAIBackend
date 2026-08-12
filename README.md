# EstateAI — Backend (`api`)

Node.js + Express + TypeScript REST API for EstateAI: MongoDB models, JWT auth,
an AI service abstraction (Anthropic Claude) for AI-assisted listing extraction,
and the Nigerian agent listings endpoints.

See [`AI_Property_Finder_Master_Build_Prompt_v2.md`](./AI_Property_Finder_Master_Build_Prompt_v2.md)
for the full product/technical spec. This repo pairs with the frontend at
[estateAIWeb](https://github.com/ematech81/estateAIWeb).

## Current status: Phase 0

Canonical property schema + Nigerian agent registration + AI-assisted natural-language
listing flow. No consumer search or RentCast integration yet — see Section 5 of the
master build prompt for why.

## Getting started

```bash
npm install
cp .env.example .env   # fill in MONGODB_URI, JWT_SECRET, ANTHROPIC_API_KEY
npm run dev            # http://localhost:4000
```

## Scripts

```bash
npm run dev         # start dev server (ts-node-dev)
npm run build        # compile TypeScript
npm run typecheck    # tsc --noEmit
npm run lint          # eslint
npm test              # jest + supertest, in-memory MongoDB
```

## Structure

```
src/
  config/        env validation, MongoDB connection
  models/        User, Property (canonical schema)
  modules/
    auth/        register, login, JWT
    listings/    draft (AI extraction), create, mine, patch
  services/ai/   AIProvider abstraction + Anthropic adapter
  middleware/    auth guard, error handler
  utils/         ApiError, asyncHandler
tests/           Jest + Supertest against an in-memory MongoDB
```
