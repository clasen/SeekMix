import { SeekMix, QwenEmbeddingProvider } from '../index.js';
try { process.loadEnvFile(); } catch (e) { }

// Simulate an expensive multilingual LLM call
async function expensiveApiCall(query) {
    console.log(`  🔄 Making API call for: "${query}"`);
    await new Promise(resolve => setTimeout(resolve, 500));
    return `Answer for: "${query}" — generated at ${new Date().toISOString()}`;
}

async function main() {
    const store = new SeekMix({
        reset: true,
        ttl: 60 * 60,
        similarityThreshold: 0.75,
        embeddingProvider: new QwenEmbeddingProvider(),
    });

    await store.connect();
    console.log('Connected using Qwen3 Embedding 8B (via OpenRouter)\n');

    // Seed the cache with a few multilingual entries
    const seeds = [
        { query: 'Best restaurants in New York', result: 'Try Le Bernardin, Eleven Madison Park, or Per Se.' },
        { query: 'Cómo hacer pasta al dente', result: 'Hierve agua con sal, añade la pasta y cocina 1-2 min menos de lo indicado.' },
        { query: 'Tips for a good night sleep', result: 'Avoid screens, keep a regular schedule, and maintain a cool room.' },
        { query: '東京のおすすめ観光地', result: '浅草寺、新宿御苑、東京タワーがおすすめです。' },
    ];

    console.log('--- Seeding store ---');
    for (const { query, result } of seeds) {
        await store.set(query, result);
        console.log(`  ✅ Stored: "${query}"`);
    }

    // Run semantically similar queries — most should hit the cache
    const queries = [
        'Where should I eat in New York?',           // → should hit "Best restaurants in New York"
        'Cuál es el truco para cocinar pasta',        // → should hit "Cómo hacer pasta al dente"
        'How can I improve my sleep quality?',        // → should hit "Tips for a good night sleep"
        '東京で何を見るべきですか',                    // → should hit "東京のおすすめ観光地"
        'Best hiking trails in Patagonia',            // → cache miss expected
    ];

    console.log('\n--- Semantic search demo ---');
    for (const query of queries) {
        console.log(`\nQuery: "${query}"`);
        const hit = await store.get(query);

        if (hit) {
            console.log(`  ✅ CACHE HIT  (similarity: ${(1 - hit.score).toFixed(4)})`);
            console.log(`  Original:    "${hit.query}"`);
            console.log(`  Answer:      ${hit.result}`);
        } else {
            console.log('  ❌ CACHE MISS');
            const result = await expensiveApiCall(query);
            await store.set(query, result);
            console.log(`  Answer:      ${result}`);
            console.log('  Saved to cache for future similar queries.');
        }
    }

    await store.disconnect();
    console.log('\nDone.');
}

main().catch(console.error);
