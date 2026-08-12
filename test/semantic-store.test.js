const { describe, it, beforeEach, afterEach } = require('node:test');
const { strict: assert } = require('assert');
const { SeekMix } = require('../index');

describe('SeekMix semantic store', function () {
    let store;

    const embeddingProvider = {
        model: 'deterministic-test-model',
        dimensions: 3,
        async embed(text) {
            const normalized = text.toLowerCase();
            if (normalized.includes('sleep')) return [0, 1, 0];
            if (normalized.includes('target')) return [0, 1, 0];
            return [1, 0, 0];
        },
    };

    beforeEach(async function () {
        store = new SeekMix({
            dbPath: ':memory:',
            embeddingProvider,
        });
        await store.connect();
    });

    afterEach(async function () {
        await store.disconnect();
    });

    it('upserts and retrieves an entry by stable id', async function () {
        const first = await store.upsert({
            id: 'doc:pasta',
            content: 'How to cook pasta',
            data: { version: 1 },
            tags: ['food', 'guide', 'food'],
        });
        const updated = await store.upsert({
            id: 'doc:pasta',
            content: 'A better pasta guide',
            data: { version: 2 },
            tags: ['guide'],
        });

        assert.equal(updated.createdAt, first.createdAt);
        assert.ok(updated.updatedAt >= first.updatedAt);
        assert.deepEqual(await store.getById('doc:pasta'), updated);
    });

    it('keeps set and get concise for semantic cache usage', async function () {
        await store.set('How to cook pasta', { answer: 'Use salted water' }, {
            tags: ['food'],
        });
        await store.set('Pasta draft', { answer: 'Unreviewed' }, {
            tags: ['food', 'draft'],
        });

        const hit = await store.get('Pasta instructions', {
            tags: { in: ['food'], out: ['draft'] },
        });

        assert.ok(hit);
        assert.equal(hit.query, 'How to cook pasta');
        assert.deepEqual(hit.result, { answer: 'Use salted water' });
        assert.equal(hit.score, 0);
        assert.deepEqual(hit.tags, ['food']);
    });

    it('applies cache ttl to entries written with set', async function () {
        const cache = new SeekMix({
            dbPath: ':memory:',
            embeddingProvider,
            ttl: 0,
        });
        await cache.connect();

        try {
            assert.equal(await cache.set('temporary', 'value'), true);
            assert.equal(await cache.get('temporary'), null);
        } finally {
            await cache.disconnect();
        }
    });

    it('returns multiple semantic matches ordered by similarity', async function () {
        await store.upsert({
            id: 'doc:pasta-1',
            content: 'Pasta recipe',
            data: { rank: 1 },
        });
        await store.upsert({
            id: 'doc:pasta-2',
            content: 'Pasta sauce',
            data: { rank: 2 },
        });
        await store.upsert({
            id: 'doc:sleep',
            content: 'Sleep guide',
            data: { rank: 3 },
        });

        const matches = await store.search('pasta instructions', {
            limit: 2,
            minSimilarity: 0.9,
        });

        assert.deepEqual(matches.map(match => match.id), ['doc:pasta-1', 'doc:pasta-2']);
        assert.ok(matches.every(match => match.similarity === 1 && match.distance === 0));
    });

    it('applies all and none tag filters without a fixed candidate cutoff', async function () {
        for (let index = 0; index < 55; index += 1) {
            await store.upsert({
                id: `excluded:${index}`,
                content: `near result ${index}`,
                data: index,
                tags: ['excluded'],
            });
        }
        await store.upsert({
            id: 'wanted',
            content: 'target result',
            data: 'found',
            tags: ['keep'],
        });

        const matches = await store.search('near query', {
            limit: 1,
            tags: { all: ['keep'], none: ['excluded'] },
        });

        assert.equal(matches.length, 1);
        assert.equal(matches[0].id, 'wanted');
    });

    it('purges expired entries before exact and semantic reads', async function () {
        await store.upsert({
            id: 'expired',
            content: 'Pasta from yesterday',
            data: 'stale',
            expiresAt: Date.now() - 1,
        });
        await store.upsert({
            id: 'fresh',
            content: 'Pasta from today',
            data: 'fresh',
            expiresAt: Date.now() + 60_000,
        });

        assert.equal(await store.getById('expired'), null);
        const matches = await store.search('pasta');
        assert.deepEqual(matches.map(match => match.id), ['fresh']);
        assert.equal(store.purgeExpired(), 0);
    });

    it('deletes individual entries and clears the collection', async function () {
        await store.upsert({ id: 'one', content: 'one', data: 1 });
        await store.upsert({ id: 'two', content: 'two', data: 2 });

        assert.equal(await store.delete('one'), true);
        assert.equal(await store.delete('one'), false);
        assert.equal(await store.clear(), 1);
        assert.deepEqual(await store.search('anything'), []);
    });

    it('rejects embeddings with the wrong dimensions', async function () {
        store.embeddingProvider.embed = async () => [1, 0];

        await assert.rejects(
            store.upsert({ id: 'bad', content: 'bad vector', data: null }),
            /Embedding dimension mismatch/
        );
    });
});
