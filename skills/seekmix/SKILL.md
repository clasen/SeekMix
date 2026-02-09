---
name: seekmix
description: Semantic caching library for Node.js using vector embeddings and local SQLite storage. Use when adding semantic caching to reduce LLM API calls, caching query results by meaning instead of exact match, building RAG pipelines with cached retrieval/generation steps, or when the user mentions seekmix, semantic cache, or embedding cache.
---

# SeekMix

Semantic caching library that stores and retrieves results based on the meaning of queries using vector embeddings. Backed by SQLite + sqlite-vec — no external services required.

## When to Use

- Cache LLM responses so semantically similar questions return cached results
- Reduce cost and latency in RAG pipelines (cache retrieval and generation steps)
- Any scenario where exact-match caching misses near-duplicate queries

## When NOT to Use

- Exact key-value caching (use Redis or a Map)
- Non-text data that cannot be meaningfully embedded
- Scenarios requiring distributed cache across multiple processes (SeekMix uses a local SQLite file)

## Installation

```bash
npm install seekmix
```

No additional infrastructure needed. The default embedding provider (`HuggingfaceProvider`) runs locally — no API keys required. First run downloads the model automatically.

## Exports

```javascript
import {
  SeekMix,
  HuggingfaceProvider,       // Default — local, no API key
  OpenAIEmbeddingProvider,   // text-embedding-ada-002 (1536d)
  OpenAIEmbedding3Provider,  // text-embedding-3-small (1536d)
  OpenAIEmbedding3LargeProvider, // text-embedding-3-large (3072d)
  BaseEmbeddingProvider      // Extend for custom providers
} from 'seekmix';
```

## Configuration Options

| Option | Default | Description |
|---|---|---|
| `dbPath` | `'seekmix.db'` | SQLite file path. Use `':memory:'` for in-memory |
| `ttl` | `-1` | Time-to-live in seconds. `-1` = no expiration |
| `similarityThreshold` | `0.87` | Cosine similarity threshold (0–1). Higher = stricter matching |
| `dropIndex` | `false` | Drop and recreate tables on `connect()` |
| `dropKeys` | `false` | Delete all entries on `connect()` |
| `embeddingProvider` | `HuggingfaceProvider` | Embedding provider instance |

## Basic Usage

```javascript
import { SeekMix } from 'seekmix';

const cache = new SeekMix({
  similarityThreshold: 0.9,
  ttl: 3600 // 1 hour
});

await cache.connect();

// Store a result
await cache.set('Best restaurants in New York', apiResponse);

// Retrieve — matches semantically similar queries
const hit = await cache.get('Recommend places to eat in NYC');
// hit = { query, result, timestamp, score, tags } or null

await cache.disconnect();
```

## Lifecycle

1. **Instantiate** with config options
2. **`connect()`** — opens the SQLite database and initializes the embedding model
3. **`get()` / `set()`** — read and write cache entries
4. **`disconnect()`** — closes the database

Always call `connect()` before any operations and `disconnect()` when done.

## Common Tasks

### Use with OpenAI Embeddings

```javascript
import { SeekMix, OpenAIEmbeddingProvider } from 'seekmix';

const cache = new SeekMix({
  embeddingProvider: new OpenAIEmbeddingProvider({
    apiKey: process.env.OPENAI_API_KEY
  })
});
await cache.connect();
```

### Tag-based Filtering

Tags classify cache entries. Multiple tags use AND logic on retrieval.

```javascript
// Store with tags
await cache.set('Mejores restaurantes en Madrid', result, { tags: ['lang:es'] });
await cache.set('Best restaurants in Madrid', result, { tags: ['lang:en'] });

// Retrieve filtering by tag
const hit = await cache.get('Restaurantes en Madrid', { tags: ['lang:es'] });
// Only matches entries tagged 'lang:es'
```

### RAG Pipeline Caching

Use separate cache instances for retrieval and generation steps:

```javascript
const retrievalCache = new SeekMix({ dbPath: 'rag-retrieval.db' });
const generationCache = new SeekMix({ dbPath: 'rag-generation.db' });
await retrievalCache.connect();
await generationCache.connect();

async function queryRAG(question) {
  const cachedAnswer = await generationCache.get(question);
  if (cachedAnswer) return cachedAnswer.result;

  let context;
  const cachedRetrieval = await retrievalCache.get(question);
  if (cachedRetrieval) {
    context = cachedRetrieval.result;
  } else {
    context = await retrieveDocuments(question);
    await retrievalCache.set(question, context);
  }

  const answer = await generateAnswer(context, question);
  await generationCache.set(question, answer);
  return answer;
}
```

### Invalidate Old Entries

```javascript
const removed = await cache.invalidateOld(3600); // entries older than 1 hour
```

### Clear All Entries

```javascript
await cache.dropKeys();
```

## API Quick Reference

| Method | Signature | Returns |
|---|---|---|
| `connect()` | `async connect()` | `true` |
| `disconnect()` | `async disconnect()` | `void` |
| `set()` | `async set(query, result, { tags? })` | `true` |
| `get()` | `async get(query, { tags? })` | `{ query, result, timestamp, score, tags }` or `null` |
| `invalidateOld()` | `async invalidateOld(maxAgeInSeconds)` | `number` (count removed) |
| `dropKeys()` | `async dropKeys()` | `void` |

### `get()` Return Object

| Field | Type | Description |
|---|---|---|
| `query` | `string` | The original cached query text |
| `result` | `any` | The cached result (JSON-serialized internally) |
| `timestamp` | `number` | Unix timestamp (ms) when entry was stored |
| `score` | `number` | Cosine distance (lower = more similar). `0` = exact match |
| `tags` | `string[]` | Tags associated with the entry |

## Agent Usage Rules

- Always call `connect()` before `get()`/`set()` and `disconnect()` when done.
- Check if `seekmix` is already in `package.json` before installing.
- Use environment variables for API keys (`OPENAI_API_KEY`). Never hardcode secrets.
- The default `HuggingfaceProvider` requires no API key but downloads a model on first run (~500 MB). Warn the user about the initial download.
- Each embedding model creates its own tables — switching models does not invalidate existing caches from other models, but entries are not cross-compatible.
- `result` is JSON-serialized internally, so any JSON-serializable value works (strings, objects, arrays).
- Set `similarityThreshold` based on use case: `0.85`–`0.90` for general caching, `0.93`+ for strict matching.
- For tests or ephemeral usage, use `dbPath: ':memory:'`.
- The `score` field in `get()` results is cosine distance (not similarity). Similarity = `1 - score`.

## Troubleshooting

- **First `connect()` is slow**: The HuggingFace model is downloading. Subsequent runs use the cached model.
- **No cache hits despite similar queries**: Lower `similarityThreshold` (e.g., `0.80`). Log `score` values to calibrate.
- **`better-sqlite3` build errors**: Ensure native build tools are installed (`node-gyp`, Python, C++ compiler).
- **Stale results**: Set a `ttl` or call `invalidateOld()` periodically.

## References

- GitHub: https://github.com/clasen/SeekMix
- npm: https://www.npmjs.com/package/seekmix
