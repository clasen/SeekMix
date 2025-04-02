# SeekMix

SeekMix is a powerful semantic caching library for Node.js that leverages vector embeddings to cache and retrieve semantically similar queries, significantly reducing API calls to expensive LLM services.

[![npm version](https://badge.fury.io/js/seekmix.svg)](https://badge.fury.io/js/seekmix)

## Features

- **Semantic Caching**: Cache results based on the semantic meaning of queries, not just exact matches
- **Configurable Similarity Threshold**: Fine-tune how semantically similar queries need to be for a cache hit
- **Multiple Embedding Providers**: Support for OpenAI and Hugging Face embedding models
- **Redis Vector Database**: Leverages Redis as a vector database for efficient similarity search
- **Time-based Invalidation**: Easily invalidate old cache entries based on time criteria
- **TTL Support**: Configure time-to-live for all cache entries

## Benefits

- **Cost Reduction**: Minimize expensive API calls to Large Language Models
- **Improved Response Times**: Retrieve cached results for semantically similar queries instantly
- **Perfect for RAG Applications**: Ideal for Retrieval-Augmented Generation systems
- **Flexible Configuration**: Adapt to your specific use case with multiple configuration options
- **Multi-model Support**: Use with OpenAI or open-source Hugging Face models

## Installation

```bash
npm install seekmix
```

## Requirements

- Node.js (>= 14.x)
- Redis 6.2+ with RediSearch module enabled (Redis Stack recommended)

## Basic Usage

```javascript
const { SeekMix, HuggingfaceProvider } = require('seekmix');

async function main() {
  // Create a semantic cache instance with default settings
  const cache = new SeekMix({
    similarityThreshold: 0.9, // Higher means queries need to be more similar for a cache hit
    ttl: 60 * 60, // TTL of 1 hour
    // By default, uses Hugging Face embedding model
  });

  // Connect to Redis and initialize the vector index
  await cache.connect();

  // Example function that simulates an expensive API call
  async function expensiveApiCall(query) {
    console.log(`Making expensive API call for: "${query}"`);
    // In real use, this would be a call to an LLM like GPT-4
    return `Response for: ${query}`;
  }

  // Process a query using the semantic cache
  const query = "What are the best restaurants in Madrid?";
  
  // Try to get result from cache
  const cachedResult = await cache.get(query);

  if (cachedResult) {
    console.log(`Cache hit! Original query: "${cachedResult.query}"`);
    console.log(`Result: ${cachedResult.result}`);
    console.log(`Similarity score: ${(1 - cachedResult.score).toFixed(4)}`);
  } else {
    console.log('Cache miss - calling API');
    const result = await expensiveApiCall(query);
    
    // Save to cache for future similar queries
    await cache.set(query, result);
    console.log(`Result: ${result}`);
  }

  // Disconnect when done
  await cache.disconnect();
}

main().catch(console.error);
```

## Advanced Configuration

```javascript
const { SeekMix, OpenAIEmbeddingProvider } = require('seekmix');

// Create a semantic cache with OpenAI embeddings and custom settings
const cache = new SeekMix({
  redisUrl: 'redis://username:password@your-redis-host:6379',
  indexName: 'my-app:semantic-cache',
  keyPrefix: 'my-app:cache:',
  ttl: 60 * 60 * 24 * 7, // 1 week
  similarityThreshold: 0.85,
  dropIndex: false, // Set to true to recreate the index on connect
  dropKeys: false, // Set to true to clear all cache entries on connect
  embeddingProvider: new OpenAIEmbeddingProvider({
    model: 'text-embedding-ada-002',
    apiKey: process.env.OPENAI_API_KEY
  })
});
```

## Using with RAG Applications

SeekMix is perfect for Retrieval-Augmented Generation applications, as it can cache both the retrieval and generation steps:

```javascript
// Caching the retrieval step
const retrievalCache = new SeekMix({ keyPrefix: 'rag:retrieval:' });
await retrievalCache.connect();

// Caching the generation step
const generationCache = new SeekMix({ keyPrefix: 'rag:generation:' });
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
