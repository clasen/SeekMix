const { describe, it, before, after } = require('node:test');
const { strict: assert } = require('assert');
const { SeekMix } = require('../index');

describe('SeekMix tag filters (in/out)', function () {
    let cache;

    const embeddingProvider = {
        model: 'dummy',
        dimensions: 3,
        async getEmbeddings(text) {
            // Deterministic vectors to control nearest neighbor ordering.
            if (text.includes('one')) return [1, 0, 0];
            if (text.includes('two')) return [0.9, 0.1, 0];
            return [1, 0, 0];
        }
    };

    before(async function () {
        cache = new SeekMix({
            dbPath: ':memory:',
            embeddingProvider,
            dropIndex: true,
            dropKeys: true,
            similarityThreshold: 0.7,
        });
        await cache.connect();

        // Two nearby entries, closest one contains tag 'bad'
        await cache.set('question one', { id: 1 }, { tags: ['keep', 'bad'] });
        await cache.set('question two', { id: 2 }, { tags: ['keep'] });
    });

    after(async function () {
        await cache.disconnect();
    });

    it('supports legacy tags: [] include filter (AND)', async function () {
        const hit = await cache.get('query', { tags: ['keep'] });
        assert.ok(hit);
        assert.equal(hit.result.id, 1);
    });

    it('supports tags: { in: [] } include filter (AND)', async function () {
        const hit = await cache.get('query', { tags: { in: ['keep'] } });
        assert.ok(hit);
        assert.equal(hit.result.id, 1);
    });

    it('supports tags: { out: [] } exclusion filter', async function () {
        const hit = await cache.get('query', { tags: { out: ['bad'] } });
        assert.ok(hit);
        assert.equal(hit.result.id, 2);
    });

    it('supports tags: { in: [], out: [] } combined filter', async function () {
        const hit = await cache.get('query', { tags: { in: ['keep'], out: ['bad'] } });
        assert.ok(hit);
        assert.equal(hit.result.id, 2);
    });
});

