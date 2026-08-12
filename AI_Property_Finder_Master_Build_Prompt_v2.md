# AI Property Finder & Global Real Estate Marketplace
## Master Build Prompt / Project Reference Guide (v2 — Revised)

> **Purpose:** Master prompt and technical reference for building an AI-powered global property discovery platform with a Nigerian agent marketplace.
>
> **Primary instruction to the coding agent:** Do not attempt to build the entire product blindly in one pass. Work phase-by-phase, inspect the existing codebase before making changes, explain important architectural decisions, and keep the project production-ready.
>
> **What changed in v2:** Removed reliance on unlicensed/scraped data sources (e.g. Zillow-derived APIs). Replaced with a licensed provider (RentCast) for international inventory. Added an explicit go-to-market sequencing section, since inventory availability — not just architecture — determines launch order.

---

# 1. PRODUCT VISION

Build a modern, AI-powered real-estate marketplace that allows people to:

1. Search for properties around the world.
2. Describe what they want using natural language (e.g. *"2-bedroom apartment in Ikeja, around ₦3 million yearly, secure, steady electricity, not too far from the main road"*).
3. Receive intelligently ranked property recommendations with AI-generated match explanations.
4. Compare properties.
5. Save searches and receive matching-property alerts.
6. Contact agents and request inspections.
7. Allow Nigerian real-estate agents, agencies, and property owners to register.
8. Allow them to list their own properties.
9. Guide agents through a standardized AI-assisted natural-language listing process.
10. Eventually monetize agents through subscriptions, featured listings, qualified leads, verification, and premium tools.

**Core differentiator vs. existing Nigerian listing sites (e.g. Jiji):** those are manual classifieds — browse, filter, scroll. This platform uses AI-assisted natural-language search and AI-assisted listing creation on both ends of the marketplace. That is the wedge, not the volume of listings.

---

# 2. CORE BUSINESS STRATEGY

Two complementary inventory sources:

## A. External (International) Inventory

Properties imported from a **licensed** third-party real-estate data provider — **RentCast** (US, 150M+ properties, self-serve API) as the initial provider. Additional licensed providers (or IDX/MLS feeds) can be added later per market.

**Hard rule:** only licensed/permitted data sources are used. No scraping of Zillow, Jiji, or any platform whose terms prohibit redistribution. This is a legal exposure issue, not a style preference — it was the single biggest risk identified in review of v1 of this document, and it is not open for reinterpretation later in the build.

International inventory serves two purposes:
- Gives the platform real, working global search functionality from day one.
- Acts as a **credibility and demo layer** to convince Nigerian agencies, individual agents, and property owners that this is a live, serious platform worth listing on — not an empty new website.

It is **not** expected to generate meaningful lead revenue directly (most international listings link out to the source platform/brokerage). Its job is trust-building and functionality demonstration, not primary monetization.

## B. Proprietary Nigerian Inventory

Nigerian agents, agencies, and property owners create accounts and list properties directly.

Listing flow example:

> "Newly built 3 bedroom duplex at Lekki Phase 1, ₦8 million per year. It has a BQ, swimming pool, parking space, 24/7 security and prepaid meter."

AI extracts structured property data; agent reviews and confirms before publishing. This creates a proprietary Nigerian property database over time — this is the actual long-term asset of the business (see Section 12).

---

# 3. PRODUCT POSITIONING

Primary positioning:

> **AI-Powered Property Finder**
> Find properties anywhere. List your property from anywhere.

Core consumer CTA (used only once Nigerian inventory density exists — see Section 9):
> **Tell us what you're looking for.**

Agent/owner CTA (used from day one):
> **List Your Property** / **Become a Nigerian Property Agent**

---

# 4. TARGET USERS

## 4.1 Property Seekers (Phase 2+)
Renting, buying, land, shortlets, commercial, investment.

## 4.2 Nigerian Agents & Agencies (Phase 1 — primary launch focus)
Agents managing multiple listings, real estate agencies, and **larger Nigerian real estate moguls/property companies specifically** — the strategy explicitly targets bigger players, not only small independent agents, since their inventory volume solves the cold-start problem fastest.

## 4.3 Individual Property Owners (Phase 1)
People with houses to list, not necessarily professional agents.

## 4.4 International Property Owners (later, exploratory)
Potential future self-listing users once trust/verification infrastructure exists. Lower priority — harder identity/ownership verification problem than a licensed Nigerian agent, and not needed for the core wedge.

---

# 5. GO-TO-MARKET SEQUENCING (New — critical)

This section governs build order as much as the architecture does. **Do not build or launch out of this order.**

### Phase 1 (Months 1–2+): Supply-side only
- Ads and outreach target **agencies and individual property owners only** — not home-seekers.
- Landing page for this phase leads with **"List your property where global buyers are already searching"** — the AI-assisted listing flow and international-activity proof-of-life are front and center. The consumer search bar is not the hero element yet.
- Goal: build real Nigerian listing density, city by city (starting with Lagos hubs — Ikeja, Lekki, Surulere, Yaba, etc.).
- Direct outreach to real estate agencies and known agents (including those already listing on Jiji — they've already shown willingness to list online; they are a warm audience, not a data source to scrape).
- Track **inventory density per city** as the primary KPI for this phase, not search volume or traffic.

### Phase 2: Consumer search opens, city by city
- Only open consumer-facing "type what you want" ad campaigns in cities/areas that already have real listing density.
- Empty-search handling (see Section 6) still applies everywhere else.

### Do not
- Run consumer-facing "AI finds your dream home" ads before Phase 1 inventory exists in the targeted city — this creates a broken first impression (empty results) for the exact user the AI-search pitch is supposed to win over.

---

# 6. EMPTY-SEARCH-RESULT HANDLING

Because Nigerian inventory will be sparse or absent in most cities early on, a no-match search must never be a dead end.

- If no exact matches: show nearby-area matches or similar property types before showing zero results (e.g. Ikeja search with no results — show Yaba/Surulere).
- If truly nothing local: show relevant international results as "here's what's available elsewhere" rather than a blank page.
- Show a clear message (e.g. *"No properties in this area yet"*) with a **"Become an Agent"** CTA — appropriate because in Phase 1 the audience clicking search is agents/owners testing the platform, not end consumers (see Section 5). Do not rely on this CTA once Phase 2 opens to general consumers — a genuine home-seeker hitting "become an agent" is a dead end, not a conversion.
- Log empty-search events per city/area — this is a direct signal for where to prioritize agent outreach next.

---

# 7. RECOMMENDED TECH STACK

Unchanged from v1 — the developer is already comfortable with MERN; prefer this stack unless there is a strong technical reason to change it.

## Frontend
- Next.js, React, TypeScript, Tailwind CSS
- Component library where appropriate
- React Query/TanStack Query where appropriate
- Zod for validation
- Mobile (later, after web MVP validates the marketplace): React Native + Expo

## Backend
- Node.js, TypeScript, Express.js or NestJS
- Modular backend, REST API, clear service/repository boundaries

## Database
- MongoDB, MongoDB Atlas in production. Use indexes carefully.

## Search
- Start with MongoDB search capabilities if sufficient.
- For larger inventory: Typesense, Elasticsearch/OpenSearch, or MongoDB Atlas Search. Do not introduce a dedicated search engine before it's needed.

## Cache / Queues (later)
- Redis, BullMQ or equivalent — for API sync, AI jobs, notifications, image processing, scheduled matching.

## File Storage
- Cloudinary or equivalent object storage/CDN. Do not store large images directly in MongoDB.

## Payments
- Paystack for Nigerian agents. Design a payment abstraction so another provider can be added later.

## Maps
- Google Maps Platform or Mapbox. Use geocoding and coordinates carefully.

## AI
- LLM provider through a service abstraction — do not hard-code the app to one provider.
- Must support: structured extraction (agent listings), natural-language search interpretation, property description generation, match explanation, agent assistant features later.
- **The AI must never invent property facts.** Hard search constraints (price, location, bedrooms) are enforced by deterministic code, not left to the model.

## External Property Data
- **RentCast** (licensed, self-serve API, nationwide US coverage, property + rent estimate + active listing data) as the initial international provider.
- Any additional provider must be evaluated for redistribution/display rights before integration — no exceptions for "it's publicly viewable on a website."

---

# 8. HIGH-LEVEL ARCHITECTURE

```text
                         ┌──────────────────────┐
                         │   Next.js Web App    │
                         └───────────┬──────────┘
                                     │
                         ┌───────────▼──────────┐
                         │   Node.js Backend    │
                         │     REST API         │
                         └───────────┬──────────┘
                                     │
          ┌──────────────────────────┼──────────────────────────┐
          │                          │                          │
          ▼                          ▼                          ▼
   ┌──────────────┐        ┌──────────────────┐        ┌────────────────┐
   │   MongoDB    │        │    AI Service     │        │  Search Engine │
   └──────────────┘        └──────────────────┘        └────────────────┘
          ▲                          │                          ▲
          │                          │                          │
          └──────────────┬───────────┴─────────────┬────────────┘
                          │                         │
                   ┌──────▼──────┐          ┌───────▼──────────┐
                   │ RentCast /  │          │ Nigerian Agent   │
                   │ Licensed API│          │ Listings         │
                   └─────────────┘          └──────────────────┘
```

---

# 9. CANONICAL PROPERTY SCHEMA (unchanged principle)

External APIs and Nigerian agent listings will all differ in shape. Never let a provider's schema leak into the frontend.

```text
External API / Nigerian Listing
     │
     ▼
Provider Adapter
     │
     ▼
Normalizer
     │
     ▼
Canonical Property Model
     │
     ▼
MongoDB
     │
     ▼
Search / Matching
     │
     ▼
Frontend
```

```ts
interface PropertyProvider {
  search(params: PropertySearchParams): Promise<NormalizedProperty[]>;
  getProperty(id: string): Promise<NormalizedProperty | null>;
}
```

Every provider (RentCast, future providers, Nigerian-agent-sourced listings) implements the same interface. The frontend never knows or cares which source a property came from.

Canonical model retains the same shape as v1 (source, sourcePropertyId, title, description, listingType, propertyType, status, price{amount, currency, period}, location{country, state, city, district, address, coordinates}, specifications{bedrooms, bathrooms, etc.}) — see Appendix A for full field list from the original spec.

---

# 10. MVP SCOPE

### Property seekers (Phase 2 — gated by inventory density, see Section 5)
Home page, natural-language search, location search, basic filters, results, property details, match score, save/favorite, contact agent, search history.

### Nigerian agents / owners (Phase 1 — build and launch first)
Registration, login, agent/owner profile, identity/business verification foundation, property creation, AI-assisted natural-language listing, property management dashboard, listing status, leads.

### Platform
External API (RentCast) integration, property normalization, internal property database, search engine, matching engine, admin dashboard, basic moderation, basic analytics, empty-search handling (Section 6).

**Do not overbuild** payments, WhatsApp automation, investment intelligence, advanced verification, or complex CRM until the core marketplace works.

---

# 11. LEGAL / COMPLIANCE AWARENESS

Before launch, review applicable:
- Nigerian privacy/data-protection requirements
- Payment regulations
- Real-estate advertising requirements
- Consumer protection requirements
- **RentCast's (and any future provider's) API terms of service, specifically redistribution/display rights**
- Copyright/image licensing

**Never use external property data unless its provider's terms explicitly permit the intended use (public display, redistribution, lead generation).** This was the central correction from v1 and applies to any future provider added to the platform.

The coding agent should flag areas requiring legal review rather than pretending to provide legal advice.

---

# 12. LONG-TERM STRATEGIC ASSET

The external API is a supply/credibility layer, not the ultimate business. The long-term defensible asset is:

```text
Users
+
Verified Nigerian Agents
+
First-party Nigerian Property Inventory
+
Search Intent Data
+
Lead Data
+
Property Performance Data
+
Agent Reputation Data
```

---

# 13. IMPLEMENTATION RULES (unchanged from v1)

1. Never leak a provider's raw schema to the frontend.
2. Every provider integration goes through an adapter + normalizer.
3. The AI must never invent property facts; hard constraints are enforced deterministically.
4. First-party Nigerian listings are strategically important — prioritize their build quality over polishing international search.
5. Never expose sensitive agent/user information unnecessarily.
6. Never claim property verification that was not actually performed.
7. Do not over-engineer the MVP.
8. Every major feature must have tests.
9. Keep provider integrations modular.
10. **Only use data sources with confirmed redistribution/display rights.**

---

# 14. CODING AGENT BEHAVIOR — FIRST RESPONSE

Do NOT immediately start coding. First:
1. Inspect the repository.
2. Summarize the existing application.
3. Compare it against this specification.
4. Identify missing infrastructure.
5. Identify contradictions.
6. Propose a phased implementation plan **that builds the Nigerian agent/listing side before the consumer search experience** (per Section 5).
7. Identify the first milestone.
8. Ask only questions that are genuinely blocking.

If the repository is empty, propose the initial architecture before creating files. Start with the canonical schema and the Nigerian agent registration + AI-assisted listing flow — not the homepage, and not the international search UI.

---

# 15. IMPLEMENTATION RULE — PER MILESTONE

```text
PLAN → IMPLEMENT → TEST → TYPECHECK → LINT → REVIEW → DOCUMENT
```

Do not move to the next major milestone while the current milestone is broken.

---

# 16. FIRST BUILD SESSION CHECKLIST

1. This document.
2. The repository.
3. RentCast API documentation and credentials (via environment variables/secrets — never in prompts or source files).
4. Any existing branding/UI requirements.

Then start with:

```text
PHASE 0: Canonical property schema + Nigerian agent registration & AI-assisted listing flow
```

Do not start with the homepage or the international search UI — those are Phase 2.

---

# 17. PROJECT SUCCESS CRITERIA

### Phase 1 success:
- Agent/owner can register, create a profile, describe a property in natural language, have AI structure it, upload media, and submit a listing.
- Platform has real, visible Nigerian listing density in at least one launch city.
- Empty-search fallback with "Become an Agent" CTA is live and tracked.

### Phase 2 success (only after Phase 1 density exists):
- Seeker can search globally and locally using natural language, see match scores, view details, save properties, contact agents.
- Platform can import and normalize RentCast data alongside first-party Nigerian listings through the same canonical schema.

---

## END OF MASTER BUILD PROMPT (v2)
