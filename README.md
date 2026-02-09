# SeekMix

SeekMix is a powerful semantic caching library for Node.js that leverages vector embeddings to cache and retrieve semantically similar queries, significantly reducing API calls to expensive LLM services.

## Features

- **Semantic Caching**: Cache results based on the semantic meaning of queries, not just exact matches
- **Configurable Similarity Threshold**: Fine-tune how semantically similar queries need to be for a cache hit
- **Local Embedding Models**: By default, SeekMix uses Hugging Face embedding models locally, reducing external API dependencies
- **Multiple Embedding Providers**: Support for OpenAI and Hugging Face embedding models
- **SQLite + sqlite-vec**: Persistent vector storage powered by SQLite — no external services required
- **Time-based Invalidation**: Easily invalidate old cache entries based on time criteria
- **TTL Support**: Configure time-to-live for all cache entries
- **Tag-based Filtering**: Classify cache entries with tags and filter on retrieval

## Benefits

- **Cost Reduction**: Minimize expensive API calls to Large Language Models
- **Improved Response Times**: Retrieve cached results for semantically similar queries instantly
- **Perfect for RAG Applications**: Ideal for Retrieval-Augmented Generation systems
- **Zero Infrastructure**: Just a local SQLite file
- **Flexible Configuration**: Adapt to your specific use case with multiple configuration options
- **Multi-model Support**: Use with OpenAI or open-source Hugging Face models

## Installation

```bash
npm install seekmix
```

> **AI Skill**: You can also add SeekMix as a skill for AI agentic development:
> ```bash
> npx skills add https://github.com/clasen/SeekMix --skill seekmix
> ```

## Quick Start

```javascript
import { SeekMix } from 'seekmix';

const cache = new SeekMix();
await cache.connect();

// Store a response
await cache.set('How to make pasta', 'Boil water, add pasta, cook 8 min...');

// Retrieve it with a semantically similar query
const hit = await cache.get('Steps for cooking pasta');

console.log(hit.result); // 'Boil water, add pasta, cook 8 min...'

await cache.disconnect();
```

The query `"Steps for cooking pasta"` was never stored — but SeekMix understands it means the same as `"How to make pasta"` and returns the cached result.

## Usage with an LLM

A typical pattern is to check the cache before calling an expensive API:

```javascript
import { SeekMix } from 'seekmix';

const cache = new SeekMix({
    similarityThreshold: 0.9,
    ttl: 60 * 60, // 1 hour
});
await cache.connect();

async function ask(question) {
    // 1. Check cache first
    const hit = await cache.get(question);
    if (hit) return hit.result;

    // 2. Cache miss — call the LLM
    const answer = await callYourLLM(question);

    // 3. Store for future similar questions
    await cache.set(question, answer);
    return answer;
}

// First call hits the LLM
await ask('What are the best restaurants in New York');

// This call returns the cached result — no LLM call needed
await ask('Recommend places to eat in New York');

await cache.disconnect();
```

## Advanced Configuration

```javascript
import { SeekMix, OpenAIEmbeddingProvider } from 'seekmix';

// Create a semantic cache with OpenAI embeddings and custom settings
const cache = new SeekMix({
  dbPath: 'my-app-cache.db', // SQLite database file path (default: 'seekmix.db')
  ttl: 60 * 60 * 24 * 7, // 1 week
  similarityThreshold: 0.85,
  dropIndex: false, // Set to true to recreate tables on connect
  dropKeys: false, // Set to true to clear all cache entries on connect
  embeddingProvider: new OpenAIEmbeddingProvider({
    model: 'text-embedding-ada-002',
    apiKey: process.env.OPENAI_API_KEY
  })
});
```

### Configuration Options

| Option | Default | Description |
|---|---|---|
| `dbPath` | `'seekmix.db'` | Path to the SQLite database file. Use `':memory:'` for in-memory storage |
| `ttl` | `-1` | Time-to-live in seconds for cache entries. `-1` means no expiration |
| `similarityThreshold` | `0.87` | Cosine similarity threshold for cache hits (0-1) |
| `dropIndex` | `false` | Drop and recreate tables on `connect()` |
| `dropKeys` | `false` | Delete all entries on `connect()` |
| `embeddingProvider` | `HuggingfaceProvider` | Embedding provider instance |

## Using with RAG Applications

SeekMix is perfect for Retrieval-Augmented Generation applications, as it can cache both the retrieval and generation steps:

```javascript
// Caching the retrieval step
const retrievalCache = new SeekMix({ dbPath: 'rag-retrieval.db' });
await retrievalCache.connect();

// Caching the generation step
const generationCache = new SeekMix({ dbPath: 'rag-generation.db' });
await generationCache.connect();

async function queryRAG(userQuestion) {
  // 1. Try to get the final answer from generation cache
  const cachedAnswer = await generationCache.get(userQuestion);
  if (cachedAnswer) return cachedAnswer.result;

  // 2. Try to get retrieved context from retrieval cache
  let context;
  const cachedRetrieval = await retrievalCache.get(userQuestion);
  
  if (cachedRetrieval) {
    context = cachedRetrieval.result;
  } else {
    // Perform actual retrieval from vector DB
    context = await retrieveDocuments(userQuestion);
    // Cache the retrieval results
    await retrievalCache.set(userQuestion, context);
  }

  // 3. Generate answer using LLM
  const answer = await generateAnswer(context, userQuestion);
  
  // 4. Cache the final answer
  await generationCache.set(userQuestion, answer);
  
  return answer;
}
```

## Tag-based Filtering

Classify cache entries with tags to filter results by category, language, domain, or any custom dimension. Multiple tags use AND logic — all specified tags must be present for a match.

```javascript
// Store entries with tags
await cache.set('Mejores restaurantes en Madrid', resultEs, { tags: ['lang:es'] });
await cache.set('Best restaurants in Madrid', resultEn, { tags: ['lang:en'] });
await cache.set('Latest AI news', resultTech, { tags: ['lang:en', 'code:NVDA'] });

// Retrieve filtering by tag
const hit = await cache.get('Restaurantes en Madrid', { tags: ['lang:es'] });
// ✅ Only matches entries tagged with 'lang:es'

// Multiple tags (AND logic: entry must have ALL specified tags)
const hit2 = await cache.get('AI news', { tags: ['lang:en', 'code:NVDA'] });
// ✅ Only matches entries tagged with BOTH 'lang:en' AND 'code:NVDA'

// Without tags — same behavior as always
const hit3 = await cache.get('Restaurants in Madrid');
```

The result object includes the matched entry's tags:

```javascript
{
  query: 'Mejores restaurantes en Madrid',
  result: resultEs,
  timestamp: 1234567890,
  score: 0.032,
  tags: ['lang:es']
}
```

## Invalidating Old Cache Entries

You can manually invalidate old cache entries:

```javascript
// Invalidate entries older than 1 hour
const invalidated = await cache.invalidateOld(60 * 60);
console.log(`Invalidated ${invalidated} old cache entries`);
```

## License

MIT
