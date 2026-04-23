import { SeekMix, OpenAIEmbeddingProvider } from '../index.js';
try { process.loadEnvFile(); } catch (e) { }


// Main function to demonstrate the use of semantic cache
// Create and initialize the semantic cache
const cache = new SeekMix({
    dbPath: 'demo-cache.db',
    embeddingProvider: new OpenAIEmbeddingProvider(),
    dropIndex: true,
    dropKeys: true,
    similarityThreshold: 0.7
});

await cache.connect();

const tags = ['actor:petercabot'];
const node = {
    description: 'Historia del accidente de los padres de peter',
    nodeId: 'peter_parents',
}

await cache.set('como fue el accidente con tus padres?', node, { tags });
await cache.set('que pasó en uritorco?', node, { tags });
await cache.set('y tu mamá?', node, { tags });

const r = await cache.get("what about your dog?")

console.log(r);