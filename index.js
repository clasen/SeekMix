const Database = require('better-sqlite3');
const sqliteVec = require('sqlite-vec');
const axios = require('axios');
const { pipeline } = require('@huggingface/transformers');
const log = require('lemonlog')('SeekMix');

class BaseEmbeddingProvider {

    constructor({ model, dimensions } = {}) {
        this.model = model;
        this.dimensions = dimensions;
    }

    async getEmbeddings(text) {
        throw new Error('The getEmbeddings method must be implemented by derived classes');
    }

    float32Buffer(arr) {
        return Buffer.from(new Float32Array(arr).buffer);
    }
}

class OpenAIEmbeddingProvider extends BaseEmbeddingProvider {
    constructor({
        model = 'text-embedding-ada-002',
        dimensions = 1536,
        apiKey = process.env.OPENAI_API_KEY
    } = {}) {
        super({ model, dimensions });

        this.openaiClient = axios.create({
            baseURL: 'https://api.openai.com/v1',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });
    }

    async getEmbeddings(text) {
        try {
            const response = await this.openaiClient.post('/embeddings', {
                model: this.model,
                input: text,
                encoding_format: 'float'
            });

            return response.data.data[0].embedding;

        } catch (error) {
            log.error('Error generating embeddings with OpenAI:', error);
            throw error;
        }
    }
}

class OpenAIEmbedding3Provider extends OpenAIEmbeddingProvider {
    constructor({
        model = 'text-embedding-3-small',
        dimensions = 1536
    } = {}) {
        super({ model, dimensions });
    }
}

class OpenAIEmbedding3LargeProvider extends OpenAIEmbeddingProvider {
    constructor({
        model = 'text-embedding-3-large',
        dimensions = 3072
    } = {}) {
        super({ model, dimensions });
    }
}

// Clase para la generación de embeddings con Hugging Face Transformers.js
class HuggingfaceProvider extends BaseEmbeddingProvider {
    constructor({
        model = 'Xenova/multilingual-e5-large',
        dimensions = 1024,
        dtype = 'q8',
        pipelineOptions = {}
    } = {}) {
        super({ model, dimensions });
        this.dtype = dtype;
        this.pipelineOptions = pipelineOptions;
        this.extractor = null;
        this.isInitialized = false;
    }

    async initialize() {
        if (!this.isInitialized) {
            try {
                const options = { dtype: this.dtype, ...this.pipelineOptions };
                log.info('Initializing Hugging Face pipeline (first initialization may take longer while downloading the model)...');
                this.extractor = await pipeline('feature-extraction', this.model, options);
                this.dimensions = this.extractor.model.config.hidden_size;
                log.info(`Hugging Face pipeline initialized with model: ${this.model}`);
                this.isInitialized = true;
            } catch (error) {
                log.error(`Error initializing Hugging Face pipeline with model ${this.model}:`, error);
                throw error;
            }
        }
    }

    // Obtener embeddings usando Hugging Face Transformers.js
    async getEmbeddings(text) {
        try {
            await this.initialize();

            if (!this.extractor) {
                throw new Error('Hugging Face pipeline not initialized.');
            }

            const output = await this.extractor(text, { pooling: 'mean', normalize: true });
            const embeddingsList = output.tolist();

            let embedding = null;

            if (embeddingsList && embeddingsList.length > 0) {
                if (Array.isArray(embeddingsList[0]) && typeof embeddingsList[0][0] === 'number') {
                    embedding = embeddingsList[0];
                } else if (typeof embeddingsList[0] === 'number') {
                    embedding = embeddingsList;
                }
            }

            if (!embedding) {
                log.error('Unexpected embedding output structure:', embeddingsList);
                throw new Error('Failed to extract embedding from Hugging Face pipeline output.');
            }

            return embedding;
        } catch (error) {
            log.error('Error generating embeddings with Hugging Face:', error);
            throw error;
        }
    }
}

class SeekMix {
    constructor({
        dbPath = 'seekmix.db',
        ttl = -1,
        similarityThreshold = 0.87,
        dropIndex = false,
        dropKeys = false,
        embeddingProvider = null
    } = {}) {
        this.embeddingProvider = embeddingProvider || new HuggingfaceProvider();

        this.options = {
            dbPath,
            ttl,
            similarityThreshold,
            dropIndex,
            dropKeys
        };

        this.db = null;
        this._cacheTable = null;
        this._vecTable = null;
    }

    _sanitizeModelName() {
        return this.embeddingProvider.model.replace(/[^a-zA-Z0-9]/g, '_');
    }

    async connect() {
        try {
            // Initialize HuggingfaceProvider if applicable
            if (this.embeddingProvider instanceof HuggingfaceProvider) {
                await this.embeddingProvider.initialize();
            }

            const modelSuffix = this._sanitizeModelName();
            this._cacheTable = `cache_${modelSuffix}`;
            this._vecTable = `vec_${modelSuffix}`;

            // Open SQLite database and load sqlite-vec extension
            this.db = new Database(this.options.dbPath);
            sqliteVec.load(this.db);

            // Drop tables if requested (full reset)
            if (this.options.dropIndex) {
                this.db.exec(`DROP TABLE IF EXISTS "${this._vecTable}"`);
                this.db.exec(`DROP TABLE IF EXISTS "${this._cacheTable}"`);
                log.info(`Tables dropped for model ${this.embeddingProvider.model}`);
            }

            // Create metadata table
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS "${this._cacheTable}" (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    key TEXT UNIQUE NOT NULL,
                    query TEXT NOT NULL,
                    result TEXT NOT NULL,
                    timestamp INTEGER NOT NULL,
                    tags TEXT NOT NULL DEFAULT '[]'
                )
            `);

            // Create vector table with cosine distance metric
            this.db.exec(`
                CREATE VIRTUAL TABLE IF NOT EXISTS "${this._vecTable}" USING vec0(
                    embedding float[${this.embeddingProvider.dimensions}] distance_metric=cosine
                )
            `);

            // Delete all entries if requested (only when tables weren't just recreated)
            if (this.options.dropKeys && !this.options.dropIndex) {
                this._dropKeys();
            }

            log.info(`SQLite database initialized at ${this.options.dbPath} for model ${this.embeddingProvider.model}`);
            return true;
        } catch (error) {
            log.error('Error initializing SQLite database:', error);
            throw error;
        }
    }

    _dropKeys() {
        try {
            this.db.exec(`DELETE FROM "${this._cacheTable}"`);
            this.db.exec(`DELETE FROM "${this._vecTable}"`);
            log.info('All cache entries deleted');
        } catch (error) {
            log.error('Error deleting entries:', error);
        }
    }

    async dropKeys() {
        this._dropKeys();
    }

    async disconnect() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }

    async set(query, result, { tags = [] } = {}) {
        try {
            const vector = await this.embeddingProvider.getEmbeddings(query);
            const timestamp = Date.now();
            const key = this._generateKey(query);
            const resultStr = JSON.stringify(result);
            const tagsStr = JSON.stringify([...tags].sort());

            const upsert = this.db.transaction(() => {
                // Remove existing entry with same key if present
                const existing = this.db.prepare(
                    `SELECT id FROM "${this._cacheTable}" WHERE key = ?`
                ).get(key);

                if (existing) {
                    this.db.prepare(`DELETE FROM "${this._vecTable}" WHERE rowid = ?`).run(existing.id);
                    this.db.prepare(`DELETE FROM "${this._cacheTable}" WHERE id = ?`).run(existing.id);
                }

                // Insert metadata
                const info = this.db.prepare(`
                    INSERT INTO "${this._cacheTable}" (key, query, result, timestamp, tags)
                    VALUES (?, ?, ?, ?, ?)
                `).run(key, query, resultStr, timestamp, tagsStr);

                const rowId = info.lastInsertRowid;

                // Insert vector (rowid must match the cache entry id)
                this.db.prepare(`
                    INSERT INTO "${this._vecTable}" (rowid, embedding)
                    VALUES (?, ?)
                `).run(BigInt(rowId), new Float32Array(vector));
            });

            upsert();
            return true;
        } catch (error) {
            log.error('Error saving to cache:', error);
            throw error;
        }
    }

    async get(query, { tags = [] } = {}) {
        try {
            const vector = await this.embeddingProvider.getEmbeddings(query);
            const k = tags.length > 0 ? 50 : 1;

            // KNN search using sqlite-vec + join with cache table
            const rows = this.db.prepare(`
                WITH knn AS (
                    SELECT rowid, distance
                    FROM "${this._vecTable}"
                    WHERE embedding MATCH ?
                      AND k = ${k}
                    ORDER BY distance
                )
                SELECT knn.rowid, knn.distance, c.query, c.result, c.timestamp, c.tags
                FROM knn
                LEFT JOIN "${this._cacheTable}" c ON c.id = knn.rowid
                ORDER BY knn.distance
            `).all(new Float32Array(vector));

            for (const row of rows) {
                // Stop if beyond similarity threshold
                if (row.distance > (1 - this.options.similarityThreshold)) break;
                if (!row.query) continue; // Skip if no cache entry found

                // Check TTL expiration
                if (this.options.ttl !== -1) {
                    const ageInSeconds = (Date.now() - row.timestamp) / 1000;
                    if (ageInSeconds > this.options.ttl) {
                        // Expired entry — remove and continue searching
                        this.db.prepare(`DELETE FROM "${this._cacheTable}" WHERE id = ?`).run(row.rowid);
                        this.db.prepare(`DELETE FROM "${this._vecTable}" WHERE rowid = ?`).run(row.rowid);
                        continue;
                    }
                }

                const entryTags = row.tags ? JSON.parse(row.tags) : [];

                // Check tags: all requested tags must be present (AND logic)
                if (tags.length > 0 && !tags.every(tag => entryTags.includes(tag))) {
                    continue;
                }

                return {
                    query: row.query,
                    result: JSON.parse(row.result),
                    timestamp: row.timestamp,
                    score: row.distance,
                    tags: entryTags,
                };
            }

            return null;
        } catch (error) {
            log.error('Error searching in cache:', error);
            return null;
        }
    }

    async invalidateOld(maxAgeInSeconds) {
        try {
            const cutoffTime = Date.now() - (maxAgeInSeconds * 1000);

            const oldEntries = this.db.prepare(`
                SELECT id FROM "${this._cacheTable}" WHERE timestamp < ?
            `).all(cutoffTime);

            if (oldEntries.length > 0) {
                const purge = this.db.transaction((entries) => {
                    const deleteCache = this.db.prepare(`DELETE FROM "${this._cacheTable}" WHERE id = ?`);
                    const deleteVec = this.db.prepare(`DELETE FROM "${this._vecTable}" WHERE rowid = ?`);

                    for (const entry of entries) {
                        deleteCache.run(entry.id);
                        deleteVec.run(entry.id);
                    }
                });

                purge(oldEntries);
            }

            return oldEntries.length;
        } catch (error) {
            log.error('Error invalidating old cache:', error);
            throw error;
        }
    }

    _generateKey(text) {
        return Buffer.from(text).toString('base64').substring(0, 32);
    }
}

module.exports = {
    SeekMix,
    HuggingfaceProvider,
    BaseEmbeddingProvider,
    OpenAIEmbeddingProvider,
    OpenAIEmbedding3Provider,
    OpenAIEmbedding3LargeProvider
};
