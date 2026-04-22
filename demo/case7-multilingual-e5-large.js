import { SeekMix, MultilingualE5LargeProvider } from '../index.js';
try { process.loadEnvFile(); } catch (e) { }

async function expensiveApiCall(query) {
    console.log(`  🔄 Making API call for: "${query}"`);
    await new Promise(resolve => setTimeout(resolve, 500));
    return `Answer for: "${query}" — generated at ${new Date().toISOString()}`;
}

async function main() {
    const cache = new SeekMix({
        ttl: 60 * 60,
        similarityThreshold: 0.80,
        dropIndex: true,
        embeddingProvider: new MultilingualE5LargeProvider()
    });

    await cache.connect();
    console.log('Connected using intfloat/multilingual-e5-large (via OpenRouter)\n');

    const seeds = [
        { query: 'Best restaurants in New York', result: 'Try Le Bernardin, Eleven Madison Park, or Per Se.' },
        { query: 'Cómo hacer pasta al dente', result: 'Hierve agua con sal, añade la pasta y cocina 1-2 min menos de lo indicado.' },
        { query: 'Tips for a good night sleep', result: 'Avoid screens, keep a regular schedule, and maintain a cool room.' },
        { query: '東京のおすすめ観光地', result: '浅草寺、新宿御苑、東京タワーがおすすめです。' },
        { query: 'Comment apprendre le français rapidement', result: 'Pratique quotidienne, immersion culturelle et applications comme Duolingo.' },
    ];

    console.log('--- Seeding cache ---');
    for (const { query, result } of seeds) {
        await cache.set(query, result);
        console.log(`  ✅ Stored: "${query}"`);
    }

    const queries = [
        'Where should I eat in New York?',
        'Cuál es el truco para cocinar pasta',
        'How can I improve my sleep quality?',
        '東京で何を見るべきですか',
        'Quelle est la meilleure façon d\'apprendre le français?',
        'Best hiking trails in Patagonia',
    ];

    console.log('\n--- Semantic search demo (90+ languages) ---');
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
