# SeekMix

SeekMix is a local semantic store for Node.js. It indexes text with vector embeddings, keeps arbitrary JSON data in SQLite, and returns the closest entries with explicit similarity scores.

Semantic caching is one use case, but the same API also supports document retrieval, RAG, recommendations, semantic memory, and local search.

## Features

- Multiple semantic search results ordered by cosine similarity
- Concise `set()` / `get()` interface for semantic caching
- Stable application-defined entry IDs
- Separate indexed content and JSON data
- Exact lookup, upsert, delete, clear, and expiration operations
- Include and exclude tag filters
- Local SQLite + `sqlite-vec` storage
- Local Hugging Face embeddings by default
- OpenAI, OpenRouter, and custom embedding providers
- One isolated vector index per embedding model and dimension count

## Installation

```bash
npm install seekmix
```

The default provider downloads its local Hugging Face model on first use.

> **AI Skill**: You can also add SeekMix as a skill for AI agentic development:
>
> ```bash
> npx skills add https://github.com/clasen/SeekMix --skill seekmix
> ```

## Quick Start

```javascript
import { SeekMix } from 'seekmix';

const cache = new SeekMix({
  similarityThreshold: 0.9,
  ttl: 60 * 60
});
await cache.connect();

await cache.set('How to make pasta al dente', {
  title: 'Pasta al dente',
  instructions: 'Boil in salted water and cook one minute less.'
});

const hit = await cache.get('How should I cook pasta?');
console.log(hit.result.title);

await cache.disconnect();
```

`set()` and `get()` are cache-oriented conveniences. They delegate to the same generic `upsert()` and `search()` operations described below.

`get()` returns `{ query, result, timestamp, score, tags }` or `null`. `score` is cosine distance, so lower is better; similarity is `1 - score`.

## Data Model

Every entry has three independent core fields:

| Field | Purpose |
|---|---|
| `id` | Stable, application-defined identity used by `getById()`, `upsert()`, and `delete()` |
| `content` | Text sent to the embedding provider and used for semantic search |
| `data` | Any JSON-serializable value returned to the application |

Entries can also have `tags` and an `expiresAt` Unix timestamp in milliseconds.

```javascript
const entry = await store.upsert({
  id: 'document:42',
  content: 'The full text that should be searchable',
  data: { title: 'Document title', url: '/documents/42' },
  tags: ['docs', 'published'],
  expiresAt: null
});
```

Calling `upsert()` again with the same `id` replaces its content, data, tags, expiration, and vector while preserving `createdAt`.

## Semantic Search

```javascript
const matches = await store.search('deployment instructions', {
  limit: 10,
  minSimilarity: 0.75,
  tags: {
    all: ['docs'],
    none: ['draft']
  }
});
```

`all` uses AND logic: every requested tag must exist. `none` excludes an entry if any listed tag exists.

Each match has this shape:

```javascript
{
  id: 'document:42',
  content: 'The full text that should be searchable',
  data: { title: 'Document title', url: '/documents/42' },
  tags: ['docs', 'published'],
  createdAt: 1786500000000,
  updatedAt: 1786500000000,
  expiresAt: null,
  similarity: 0.91,
  distance: 0.09
}
```

`similarity` is `1 - distance`. Higher similarity is better. `minSimilarity` accepts values from `-1` to `1` and defaults to `-1`, so the nearest entries are returned without an implicit cache threshold.

Tag filters are exact: SeekMix searches enough vector candidates to avoid dropping a valid tagged match behind a fixed candidate cutoff. This favors correctness; highly selective tag searches over very large collections may cost more than unfiltered searches.

## Exact Operations

```javascript
const entry = await store.getById('document:42');

const deleted = await store.delete('document:42');

const removedCount = await store.clear();
```

`getById()` returns an entry without similarity fields or `null` when the ID does not exist. `delete()` returns whether an entry was removed. `clear()` returns the number of removed entries.

## Expiration

The cache shorthand applies its configured TTL automatically:

```javascript
const cache = new SeekMix({ ttl: 60 * 60 });
await cache.set('Current exchange rate?', currentAnswer);
```

The generic API can set an absolute expiration per entry:

```javascript
await store.upsert({
  id: 'temporary:answer',
  content: 'What is the current exchange rate?',
  data: currentAnswer,
  expiresAt: Date.now() + 60 * 60 * 1000
});
```

Expired entries are purged before exact reads and semantic searches. They can also be removed explicitly:

```javascript
const removedCount = store.purgeExpired();
```

## Cache and Store Interfaces

The concise interface keeps the original cache workflow:

```javascript
async function ask(question) {
  const cached = await cache.get(question);
  if (cached) return cached.result;

  const answer = await callYourLLM(question);
  await cache.set(question, answer);
  return answer;
}
```

Use `upsert()`, `getById()`, and `search()` when you need stable IDs, multiple results, explicit thresholds, or per-entry expiration.

## Configuration

```javascript
import { SeekMix, OpenAIEmbedding3Provider } from 'seekmix';

const store = new SeekMix({
  dbPath: 'knowledge.db',
  reset: false,
  ttl: -1,
  similarityThreshold: 0.87,
  embeddingProvider: new OpenAIEmbedding3Provider()
});
```

| Option | Default | Description |
|---|---|---|
| `dbPath` | `'seekmix.db'` | SQLite database path; use `':memory:'` for ephemeral storage |
| `reset` | `false` | Drop and recreate this provider's entry and vector tables on `connect()` |
| `ttl` | `-1` | Lifetime in seconds for entries written through `set()`; `-1` disables expiration |
| `similarityThreshold` | `0.87` | Minimum similarity used by cache-oriented `get()` |
| `embeddingProvider` | `HuggingfaceProvider` | Provider with `model`, `dimensions`, and `embed(text)` |

## Embedding Providers

| Provider | Class | Default model | Dimensions |
|---|---|---|---|
| Hugging Face local | `HuggingfaceProvider` | `Xenova/multilingual-e5-large` | 1024 |
| OpenAI | `OpenAIEmbeddingProvider` | `text-embedding-ada-002` | 1536 |
| OpenAI v3 small | `OpenAIEmbedding3Provider` | `text-embedding-3-small` | 1536 |
| OpenAI v3 large | `OpenAIEmbedding3LargeProvider` | `text-embedding-3-large` | 3072 |
| OpenRouter generic | `OpenRouterEmbeddingProvider` | Configured by the caller | Configured by the caller |
| Qwen3 Embedding 8B | `QwenEmbeddingProvider` | `qwen/qwen3-embedding-8b` | 4096 |
| BAAI bge-m3 | `BgeM3EmbeddingProvider` | `baai/bge-m3` | 1024 |
| Multilingual E5 Large | `MultilingualE5LargeProvider` | `intfloat/multilingual-e5-large` | 1024 |

OpenAI providers use `OPENAI_API_KEY`. OpenRouter providers use `OPENROUTER_API_KEY`.

### Custom Provider

SeekMix depends on provider capabilities, not provider classes. A custom provider may optionally expose `initialize()` and must expose `model`, `dimensions`, and `embed()`:

```javascript
const embeddingProvider = {
  model: 'my-model',
  dimensions: 768,
  async initialize() {
    // Optional one-time setup
  },
  async embed(text) {
    return createEmbedding(text);
  }
};

const store = new SeekMix({ embeddingProvider });
```

SeekMix rejects vectors whose dimensions do not match the provider contract or contain non-finite values.

## API Reference

| Method | Returns |
|---|---|
| `connect()` | `Promise<true>` |
| `disconnect()` | `Promise<void>` |
| `set(query, result, { tags? })` | `Promise<true>` |
| `get(query, { tags? })` | `Promise<CacheHit \| null>` |
| `upsert({ id, content, data, tags?, expiresAt? })` | `Promise<Entry>` |
| `getById(id)` | `Promise<Entry \| null>` |
| `search(query, { limit?, minSimilarity?, tags? })` | `Promise<SearchResult[]>` |
| `delete(id)` | `Promise<boolean>` |
| `clear()` | `Promise<number>` |
| `purgeExpired()` | `number` |

Always call `connect()` before using the store and `disconnect()` when finished. Invalid inputs and storage or embedding failures reject immediately; a failed search is never represented as an empty result set.

## Storage Architecture

SeekMix keeps authoritative entry data in a regular SQLite table and vectors in a separate `vec0` virtual table. Both share an internal integer row ID, which makes updates and deletes transactional while keeping application IDs independent from SQLite internals.

Each provider model and dimension pair receives a collision-resistant table namespace. This prevents incompatible vector dimensions from sharing an index while allowing multiple embedding models in the same database.

## License

MIT
