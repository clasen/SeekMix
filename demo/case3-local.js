import { SeekMix } from '../index.js';

const store = new SeekMix({ reset: true });

await store.connect();

console.log('Connected with default settings (HuggingFace local model)\n');

// Index some entries
await store.upsert({
    id: 'pasta',
    content: 'How to make pasta',
    data: 'Boil water, add pasta, cook for 8 minutes.',
});
await store.upsert({
    id: 'france-capital',
    content: 'What is the capital of France',
    data: 'The capital of France is Paris.',
});
await store.upsert({
    id: 'sleep',
    content: 'Tips for better sleep',
    data: 'Avoid screens before bed and keep a regular schedule.',
});
console.log('3 entries indexed\n');

// Search with similar queries
const searches = [
    'How do I cook pasta',
    'Capital city of France',
    'How can I sleep better',
    'Best programming language' // no match expected
];

for (const query of searches) {
    const [match] = await store.search(query, {
        limit: 1,
        minSimilarity: 0.87,
    });
    if (match) {
        console.log(`"${query}"`);
        console.log(`  -> MATCH (similarity ${match.similarity.toFixed(4)}): ${match.data}\n`);
    } else {
        console.log(`"${query}"`);
        console.log('  -> NO MATCH\n');
    }
}

await store.disconnect();
