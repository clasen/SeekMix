process.loadEnvFile();
const { SeekMix, OpenAIEmbedding3LargeRouterProvider } = require('../index');

async function expensiveApiCall(query) {
    console.log(`  🔄 Making API call for: "${query}"`);
    await new Promise(resolve => setTimeout(resolve, 500));
    return `Answer for: "${query}" — generated at ${new Date().toISOString()}`;
}

async function main() {
    const cache = new SeekMix({
        ttl: 60 * 60,
        similarityThreshold: 0.75,
        dropIndex: true,
        embeddingProvider: new OpenAIEmbedding3LargeRouterProvider()
    });

    await cache.connect();
    console.log('Connected using OpenAI text-embedding-3-large (via OpenRouter)\n');

    const seeds = [
        { query: 'Best restaurants in New York', result: 'Try Le Bernardin, Eleven Madison Park, or Per Se.' },
        { query: 'How to make pasta al dente', result: 'Boil salted water, add pasta, cook 1-2 min less than the package says.' },
        { query: 'Tips for a good night sleep', result: 'Avoid screens, keep a regular schedule, and maintain a cool room.' },
        { query: 'What is machine learning', result: 'ML is a subset of AI where systems learn patterns from data without explicit programming.' },
    ];

    console.log('--- Seeding cache ---');
    for (const { query, result } of seeds) {
        await cache.set(query, result);
        console.log(`  ✅ Stored: "${query}"`);
    }

    const queries = [
        'Where should I eat in New York?',
        'Steps to cook pasta perfectly',
        'How can I improve my sleep quality?',
        'Explain machine learning in simple terms',
        'Best hiking trails in Patagonia',
    ];

    console.log('\n--- Semantic search demo ---');
    for (const query of queries) {
        console.log(`\nQuery: "${query}"`);
        const hit = await cache.get(query);

        if (hit) {
            console.log(`  ✅ CACHE HIT  (similarity: ${(1 - hit.score).toFixed(4)})`);
            console.log(`  Original:    "${hit.query}"`);
            console.log(`  Answer:      ${hit.result}`);
        } else {
            console.log('  ❌ CACHE MISS');
            const result = await expensiveApiCall(query);
            await cache.set(query, result);
            console.log(`  Answer:      ${result}`);
            console.log('  Saved to cache for future similar queries.');
        }
    }

    await cache.disconnect();
    console.log('\nDone.');
}

main().catch(console.error);
