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

## Basic Usage

```javascript
const { SeekMix, OpenAIEmbeddingProvider } = require('seekmix');

// Function that simulates an expensive API call (e.g., to an LLM)
async function expensiveApiCall(query) {
    console.log(`Making expensive API call for: "${query}"`);
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1000));

    // In a real-world scenario, this would be a call to an API like GPT-X
    return `Response for: ${query} - ${new Date().toISOString()}`;
}

// Create and initialize the semantic cache
const cache = new SeekMix({
    similarityThreshold: 0.9, // Semantic similarity threshold
    ttl: 60 * 60, // 1 hour TTL
    // embeddingProvider: new OpenAIEmbeddingProvider()
});

await cache.connect();
console.log('Semantic cache connected successfully');

// Examples of semantically similar queries
const queries = [
    'What are the best restaurants in New York',
    'Recommend places to eat in New York',
    'I need information about restaurants in Chicago',
    'Looking for good dining spots in New York',
    'Tell me about hiking trails'
];

// Process queries, using the cache when possible
for (const query of queries) {
    console.log(`\nProcessing query: "${query}"`);

    // Try to get from cache
    const cachedResult = await cache.get(query);

    if (cachedResult) {
        console.log(`✅ CACHE HIT - Similarity: ${(1 - cachedResult.score).toFixed(4)}`);
        console.log(`Original query: "${cachedResult.query}"`);
        console.log(`Result: ${cachedResult.result}`);
        console.log(`Stored: ${Math.round((Date.now() - cachedResult.timestamp) / 1000)} seconds ago`);
    } else {
        console.log('❌ CACHE MISS - Making API call');

        // Make the expensive call
        const result = await expensiveApiCall(query);

        // Save to cache for future similar queries
        await cache.set(query, result);
        console.log(`Result: ${result}`);
        console.log('Saved to cache for future similar queries');
    }
}

await cache.disconnect();
```

## Advanced Configuration

```javascript
const { SeekMix, OpenAIEmbeddingProvider } = require('seekmix');

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

## Invalidating Old Cache Entries

You can manually invalidate old cache entries:

```javascript
// Invalidate entries older than 1 hour
const invalidated = await cache.invalidateOld(60 * 60);
console.log(`Invalidated ${invalidated} old cache entries`);
```

## License

MIT
