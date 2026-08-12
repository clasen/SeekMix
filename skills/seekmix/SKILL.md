---
name: seekmix
description: Local semantic store for Node.js using vector embeddings, SQLite, and sqlite-vec. Use for semantic search, document retrieval, RAG context, recommendations, semantic memory, or semantic caching without external vector infrastructure.
---

# SeekMix

SeekMix indexes text, associates it with JSON data, and returns nearby entries using cosine similarity. It offers a concise `set()` / `get()` cache interface plus generic store operations for search-oriented use cases.

## When to Use

- Local semantic search over application-owned entries
- Document or chunk retrieval for RAG
- Semantic memory and recommendation candidates
- Semantic caching with caller-defined similarity and expiration
- SQLite-backed vector search without a separate service

## When NOT to Use

- Exact-only key-value caching
- Distributed vector search across multiple machines
- Content that cannot be represented meaningfully by the configured embedding model

## Installation

```bash
npm install seekmix
```

The default `HuggingfaceProvider` runs locally and downloads its model on first use.

## Semantic Cache Interface

```javascript
import { SeekMix } from 'seekmix';

const cache = new SeekMix({
  similarityThreshold: 0.9,
  ttl: 3600
});
await cache.connect();

await cache.set('Best restaurants in New York', apiResponse, {
  tags: ['restaurants']
});

const hit = await cache.get('Where should I eat in New York?', {
  tags: ['restaurants']
});
// hit.result or null
```

`set()` and `get()` delegate to the generic store API; they do not implement a separate vector-search path.

`get()` returns `{ query, result, timestamp, score, tags }` or `null`. `score` is cosine distance; similarity is `1 - score`.

## Generic Store Interface

```javascript
const store = new SeekMix();
await store.connect();

await store.upsert({
  id: 'document:42',
  content: 'Text used to create the embedding',
  data: { title: 'Document title' },
  tags: ['docs', 'published'],
  expiresAt: null
});

const matches = await store.search('semantic query', {
  limit: 5,
  minSimilarity: 0.8,
  tags: {
    all: ['docs'],
    none: ['draft']
  }
});

await store.disconnect();
```

The fields have distinct responsibilities:

- `id`: stable application identity
- `content`: text embedded for semantic search
- `data`: JSON-serializable application payload
- `tags`: optional exact filters
- `expiresAt`: optional Unix timestamp in milliseconds

## Configuration

| Option | Default | Description |
|---|---|---|
| `dbPath` | `'seekmix.db'` | SQLite path; use `':memory:'` for tests |
| `reset` | `false` | Recreate this provider's tables on `connect()` |
| `ttl` | `-1` | Lifetime in seconds for entries written with `set()` |
| `similarityThreshold` | `0.87` | Minimum similarity used by `get()` |
| `embeddingProvider` | `HuggingfaceProvider` | Provider instance |

## Search Results

Each result contains:

```javascript
{
  id,
  content,
  data,
  tags,
  createdAt,
  updatedAt,
  expiresAt,
  similarity,
  distance
}
```

`similarity` is `1 - distance`; higher is better. `minSimilarity` ranges from `-1` to `1` and defaults to `-1`. A search failure rejects; an empty array only means there were no matching entries.

Tag filters use exact strings. All tags in `tags.all` must be present, and any tag in `tags.none` excludes the entry.

## Exact and Lifecycle Operations

```javascript
const entry = await store.getById('document:42');
const deleted = await store.delete('document:42');
const expiredCount = store.purgeExpired();
const clearedCount = await store.clear();
```

Expired entries are automatically purged before `get()`, `getById()`, and `search()`.

## Semantic Cache Recipe

```javascript
async function ask(question) {
  const cached = await cache.get(question);
  if (cached) return cached.result;

  const answer = await callYourLLM(question);
  await cache.set(question, answer);
  return answer;
}
```

Use `search()` directly when you need multiple matches or a threshold that varies per query.

## Custom Providers

Providers are capability-based:

```javascript
const provider = {
  model: 'custom-model',
  dimensions: 768,
  async initialize() {}, // optional
  async embed(text) {
    return embedding;
  }
};
```

SeekMix validates model identity, dimension count, vector length, and finite vector values.

## Exports

- `SeekMix`
- `BaseEmbeddingProvider`
- `HuggingfaceProvider`
- `OpenAIEmbeddingProvider`
- `OpenAIEmbedding3Provider`
- `OpenAIEmbedding3LargeProvider`
- `OpenRouterEmbeddingProvider`
- `QwenEmbeddingProvider`
- `BgeM3EmbeddingProvider`
- `MultilingualE5LargeProvider`
- `OpenAIEmbedding3SmallRouterProvider`
- `OpenAIEmbedding3LargeRouterProvider`

## Agent Rules

- Always connect before operations and disconnect when finished.
- Prefer `set()` / `get()` for a semantic cache and `upsert()` / `search()` for a semantic collection.
- Use stable domain IDs; do not derive identity from embedding text unless the text is the actual domain key.
- Put searchable text in `content`, not only inside `data`.
- Use `expiresAt` only for entries that are genuinely disposable.
- Calibrate `minSimilarity` with representative data; do not assume one threshold fits every model.
- Use `dbPath: ':memory:'` and a deterministic stub provider for unit tests.
- Never hardcode provider API keys.
- Warn that the default local model downloads on first use.

## References

- GitHub: https://github.com/clasen/SeekMix
- npm: https://www.npmjs.com/package/seekmix
