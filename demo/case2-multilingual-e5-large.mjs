import { SeekMix } from '../index.js';

async function expensiveApiCall(query) {
    console.log(`Making expensive API call for: "${query}"`);
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1000));

    // In a real-world scenario, this would be a call to an API like GPT-X
    return `Response for: ${query} - ${new Date().toISOString()}`;
}

const store = new SeekMix({
    ttl: 60 * 60,
    similarityThreshold: 0.87,
});

await store.connect();
console.log('Semantic store connected successfully');

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

    const cachedResult = await store.get(query);

    if (cachedResult) {
        console.log(`✅ CACHE HIT - Similarity: ${(1 - cachedResult.score).toFixed(4)}`);
        console.log(`Original query: "${cachedResult.query}"`);
        console.log(`Result: ${cachedResult.result}`);
        console.log(`Stored: ${Math.round((Date.now() - cachedResult.timestamp) / 1000)} seconds ago`);
    } else {
        console.log('❌ CACHE MISS - Making API call');

        // Make the expensive call
        const result = await expensiveApiCall(query);

        await store.set(query, result);
        console.log(`Result: ${result}`);
        console.log('Saved to cache for future similar queries');
    }
}

await store.disconnect();
