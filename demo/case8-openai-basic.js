import { SeekMix, OpenAIEmbeddingProvider } from '../index.js';
try { process.loadEnvFile(); } catch (e) { }


const store = new SeekMix({
    dbPath: 'demo-cache.db',
    embeddingProvider: new OpenAIEmbeddingProvider(),
    reset: true,
    similarityThreshold: 0.7,
});

await store.connect();

const tags = ['actor:petercabot'];
const node = {
    description: 'Historia del accidente de los padres de peter',
    nodeId: 'peter_parents',
}

await store.set('como fue el accidente con tus padres?', node, { tags });
await store.set('que pasó en uritorco?', node, { tags });
await store.set('y tu mamá?', node, { tags });

const result = await store.get('what about your dog?', { tags });

console.log(result);

await store.disconnect();
