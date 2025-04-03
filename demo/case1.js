require('dotenv').config();
const { SeekMix, OpenAIEmbeddingProvider } = require('../index');

// Function that simulates an expensive API call (for example, to an LLM)
async function expensiveApiCall(query) {
    console.log(`Making expensive API call for: "${query}"`);
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1000));

    // In a real case, here we would make a call to an API like GPT-4
    return `Response for: ${query} - ${new Date().toISOString()}`;
}

// Main function to demonstrate the use of semantic cache
async function main() {
    // Create and initialize the semantic cache
    const cache = new SeekMix({
        ttl: 60 * 60, // 1 hour TTL
        embeddingProvider: new OpenAIEmbeddingProvider(),
        dropIndex: true,
        dropKeys: true
    });

    try {
        // Connect to the cache
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

        // Process the queries, using the cache when possible
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

                // Save in cache for future similar queries
                await cache.set(query, result);
                console.log(`Result: ${result}`);
                console.log('Saved in cache for future similar queries');
            }
        }

        // Invalidation demo
        // console.log('\n--- Invalidation demonstration ---');
        // const invalidated = await cache.invalidateOld(30); // Invalidate entries older than 30 seconds
        // console.log(`Invalidated entries: ${invalidated}`);

    } catch (error) {
        console.error('Error in demonstration:', error);
    } finally {
        // Close connection to cache
        await cache.disconnect();
        console.log('\nConnection closed');
    }
}

// Run the demonstration
main().catch(console.error);