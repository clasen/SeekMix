
import { SeekMix } from '../index.js';

async function expensiveApiCall(query) {
    console.log(`Making expensive API call for: "${query}"`);
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1000));

    // In a real-world scenario, this would be a call to an API like GPT-X
    return `Response for: ${query} - ${new Date().toISOString()}`;
}

// Create and initialize the semantic cache
const cache = new SeekMix({
    similarityThreshold: 0.85, // Semantic similarity threshold
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