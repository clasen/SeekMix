const { SeekMix } = require('../index');

async function main() {
    const cache = new SeekMix({ dropIndex: true });

    await cache.connect();
    console.log('Connected with default settings (HuggingFace local model)\n');

    // Index some entries
    await cache.set('How to make pasta', 'Boil water, add pasta, cook for 8 minutes.');
    await cache.set('What is the capital of France', 'The capital of France is Paris.');
    await cache.set('Tips for better sleep', 'Avoid screens before bed and keep a regular schedule.');
    console.log('3 entries indexed\n');

    // Search with similar queries
    const searches = [
        'How do I cook pasta',
        'Capital city of France',
        'How can I sleep better',
        'Best programming language' // no match expected
    ];

    for (const q of searches) {
        const hit = await cache.get(q);
        if (hit) {
            console.log(`"${q}"`);
            console.log(`  -> HIT (similarity ${(1 - hit.score).toFixed(4)}): ${hit.result}\n`);
        } else {
            console.log(`"${q}"`);
            console.log(`  -> MISS\n`);
        }
    }

    await cache.disconnect();
}

main().catch(console.error);
