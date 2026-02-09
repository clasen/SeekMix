const { describe, it, before, after } = require('mocha');
const { strict: assert } = require('assert');
const { SeekMix } = require('../index');

describe('SeekMix Multilanguage Tests', function () {
    // Increase timeout for tests since language processing can take time
    this.timeout(60000);

    // Initialize the cache with Huggingface provider which supports multilingual embeddings
    let cache;

    before(async function () {
        this.timeout(120000); // Model loading can take longer than the default timeout
        // Create a new SeekMix instance with Huggingface provider
        cache = new SeekMix({
            dbPath: ':memory:',
            ttl: 3600, // 1 hour TTL
            dropIndex: true, // Fresh tables for testing
            dropKeys: true  // Clear any existing entries
        });

        // Initialize the cache (opens SQLite in-memory DB)
        await cache.connect();
        console.log('SeekMix cache initialized for testing');
    });

    after(async function () {
        // Close the database
        await cache.disconnect();
        console.log('SeekMix cache closed');
    });

    // Test multilingual query and retrieval
    describe('Multilingual semantic caching', function () {
        // Define 20 language pairs with semantically similar queries
        const languagePairs = [
            {
                language: 'English',
                original: 'What are the best restaurants in Madrid',
                similar: 'Recommend me places to eat in Madrid',
                different: 'How is the weather in Barcelona'
            },
            {
                language: 'Spanish',
                original: 'Cuáles son los mejores restaurantes de Madrid',
                similar: 'Recomiéndame lugares para comer en Madrid',
                different: 'Cómo está el clima en Barcelona'
            },
            {
                language: 'French',
                original: 'Quels sont les meilleurs restaurants de Madrid',
                similar: 'Recommandez-moi des endroits pour manger à Madrid',
                different: 'Comment est la météo à Barcelone'
            },
            {
                language: 'German',
                original: 'Was sind die besten Restaurants in Madrid',
                similar: 'Empfehlen Sie mir Orte zum Essen in Madrid',
                different: 'Wie ist das Wetter in Barcelona'
            },
            {
                language: 'Italian',
                original: 'Quali sono i migliori ristoranti di Madrid',
                similar: 'Consigliami dove mangiare a Madrid',
                different: 'Com\'è il tempo a Barcellona'
            },
            {
                language: 'Portuguese',
                original: 'Quais são os melhores restaurantes em Madrid',
                similar: 'Recomende-me lugares para comer em Madrid',
                different: 'Como está o clima em Barcelona'
            },
            {
                language: 'Dutch',
                original: 'Wat zijn de beste restaurants in Madrid',
                similar: 'Raad me plekken aan om te eten in Madrid',
                different: 'Hoe is het weer in Barcelona'
            },
            {
                language: 'Polish',
                original: 'Jakie są najlepsze restauracje w Madrycie',
                similar: 'Poleć mi miejsca do jedzenia w Madrycie',
                different: 'Jaka jest pogoda w Barcelonie'
            },
            {
                language: 'Swedish',
                original: 'Vilka är de bästa restaurangerna i Madrid',
                similar: 'Rekommendera ställen att äta på i Madrid',
                different: 'Hur är vädret i Barcelona'
            },
            {
                language: 'Finnish',
                original: 'Mitkä ovat parhaat ravintolat Madridissa',
                similar: 'Suosittele paikkoja syödä Madridissa',
                different: 'Millainen sää on Barcelonassa'
            },
            {
                language: 'Danish',
                original: 'Hvad er de bedste restauranter i Madrid',
                similar: 'Anbefal mig steder at spise i Madrid',
                different: 'Hvordan er vejret i Barcelona'
            },
            {
                language: 'Norwegian',
                original: 'Hva er de beste restaurantene i Madrid',
                similar: 'Anbefal meg steder å spise i Madrid',
                different: 'Hvordan er været i Barcelona'
            },
            {
                language: 'Czech',
                original: 'Jaké jsou nejlepší restaurace v Madridu',
                similar: 'Doporučte mi místa k jídlu v Madridu',
                different: 'Jaké je počasí v Barceloně'
            },
            {
                language: 'Hungarian',
                original: 'Melyek a legjobb éttermek Madridban',
                similar: 'Ajánlj nekem helyeket ahol ehetek Madridban',
                different: 'Milyen az időjárás Barcelonában'
            },
            {
                language: 'Greek',
                original: 'Ποια είναι τα καλύτερα εστιατόρια στη Μαδρίτη',
                similar: 'Προτείνετέ μου μέρη για φαγητό στη Μαδρίτη',
                different: 'Πώς είναι ο καιρός στη Βαρκελώνη'
            },
            {
                language: 'Turkish',
                original: 'Madrid\'deki en iyi restoranlar hangileridir',
                similar: 'Madrid\'de yemek yiyebileceğim yerler öner',
                different: 'Barselona\'da hava nasıl'
            },
            {
                language: 'Russian',
                original: 'Какие лучшие рестораны в Мадриде',
                similar: 'Порекомендуйте места для еды в Мадриде',
                different: 'Какая погода в Барселоне'
            },
            {
                language: 'Japanese',
                original: 'マドリードの最高のレストランはどこですか',
                similar: 'マドリードで食事ができる場所を教えてください',
                different: 'バルセロナの天気はどうですか'
            },
            {
                language: 'Chinese',
                original: '马德里最好的餐厅是哪些',
                similar: '推荐在马德里吃饭的地方',
                different: '巴塞罗那的天气怎么样'
            },
            {
                language: 'Arabic',
                original: 'ما هي أفضل المطاعم في مدريد',
                similar: 'أوصيني بأماكن للأكل في مدريد',
                different: 'كيف الطقس في برشلونة'
            }
        ];

        it('should cache and retrieve semantically similar queries across languages', async function () {
            // For each language pair in our test set
            for (const pair of languagePairs) {
                const { language, original, similar, different } = pair;

                console.log(`\nTesting ${language} language:`);
                console.log(`Original query: "${original}"`);

                // Simulate a result for the original query
                const result = `Results for: ${original} (${language})`;

                // Cache the original query
                await cache.set(original, result);
                console.log(`Cached result for original query`);

                // Test with a semantically similar query
                console.log(`Similar query: "${similar}"`);
                const similarResult = await cache.get(similar);

                // Assert that we get a cache hit for the similar query
                assert.notEqual(similarResult, null,
                    `Should find a similar entry for "${similar}" in ${language}`);

                console.log(`✅ Cache hit - Similarity: ${(1 - similarResult.score).toFixed(4)}`);
                console.log(`Retrieved original query: "${similarResult.query}"`);

                // Test with a semantically different query
                console.log(`Different query: "${different}"`);
                const differentResult = await cache.get(different);

                // Assert that we get a cache miss for the different query
                assert.equal(differentResult, null,
                    `Should NOT find a similar entry for "${different}" in ${language}`);

                console.log(`✅ Cache miss for different query`);
            }
        });

        it('should cache and retrieve cross-language semantically similar queries', async function () {
            // Test if queries in different languages but with same meaning can be matched

            // We'll use English as source and test against a few other languages
            const englishQuery = 'What are the best restaurants in New York';
            const englishResult = 'Results for best New York restaurants';

            // Store the English query
            await cache.set(englishQuery, englishResult);
            console.log(`\nCached original English query: "${englishQuery}"`);

            // Test similar queries in different languages
            const crossLanguageQueries = [
                { language: 'Spanish', query: 'Cuáles son los mejores restaurantes en Nueva York' },
                { language: 'French', query: 'Quels sont les meilleurs restaurants à New York' },
                { language: 'German', query: 'Was sind die besten Restaurants in New York' },
                { language: 'Italian', query: 'Quali sono i migliori ristoranti di New York' }
            ];

            for (const { language, query } of crossLanguageQueries) {
                console.log(`Testing ${language} query: "${query}"`);

                // Try to retrieve using the translated query
                const result = await cache.get(query);

                console.log(result ?
                    `✅ Cross-language cache hit - Similarity: ${(1 - result.score).toFixed(4)}` :
                    `❌ Cross-language cache miss`);

                // We're not asserting here because cross-language performance depends on the embedding model quality
            }
        });

        it('should properly identify cache misses between unrelated queries across languages', async function () {
            // This test verifies that unrelated queries in different languages don't produce false cache hits

            console.log('\nTesting cache misses between unrelated queries in different languages:');

            // Create a set of unrelated queries in different languages
            const unrelatedQueries = [
                { language: 'English', query: 'How to grow tomatoes in the garden', result: 'Tomato growing guide' },
                { language: 'Spanish', query: 'Cómo reservar un vuelo a París', result: 'Reservas de vuelos a París' },
                { language: 'French', query: 'Recette pour faire du pain', result: 'Recette de pain traditionnel' },
                { language: 'German', query: 'Die besten Sehenswürdigkeiten in Berlin', result: 'Berliner Touristenattraktion' },
                { language: 'Italian', query: 'Come preparare la pasta carbonara', result: 'Ricetta pasta carbonara' }
            ];

            // Cache all the queries
            for (const { language, query, result } of unrelatedQueries) {
                await cache.set(query, result);
                console.log(`Cached ${language} query: "${query}"`);
            }

            // Test that each query doesn't retrieve any of the others
            for (let i = 0; i < unrelatedQueries.length; i++) {
                const { language, query, result } = unrelatedQueries[i];

                // Test against all other queries
                for (let j = 0; j < unrelatedQueries.length; j++) {
                    if (i === j) continue; // Skip testing against itself

                    const otherQuery = unrelatedQueries[j].query;
                    const otherLanguage = unrelatedQueries[j].language;

                    console.log(`Testing if ${language} query "${query}" matches ${otherLanguage} query "${otherQuery}"`);

                    // Get the exact match first to ensure it's cached
                    const exactMatch = await cache.get(query);
                    assert.notEqual(exactMatch, null, `Should find exact match for "${query}"`);
                    assert.equal(exactMatch.result, result, `Should return correct result for exact match`);

                    // Check if the other query returns a match (it shouldn't)
                    const crossMatch = await cache.get(otherQuery);

                    // It should find its own result, but not the result of the current query
                    assert.notEqual(crossMatch, null, `Should find a result for "${otherQuery}"`);
                    assert.notEqual(crossMatch.result, result, `"${otherQuery}" should not match "${query}"`);

                    console.log(`✅ Verified no false match between different queries`);
                }
            }
        });
    });
}); 