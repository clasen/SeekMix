const Database = require('better-sqlite3');
const sqliteVec = require('sqlite-vec');
const { pipeline } = require('@huggingface/transformers');
const { createHash } = require('node:crypto');
const log = require('lemonlog')('SeekMix');

async function fetchJson(url, { method = 'GET', headers = {}, body } = {}) {
    const res = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    });

    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    const parseBody = async () => {
        if (res.status === 204) return null;
        if (isJson) {
            try {
                return await res.json();
            } catch {
                return null;
            }
        }
        const text = await res.text();
        return text.length > 0 ? text : null;
    };

    const data = await parseBody();

    if (!res.ok) {
        const detail =
            (data && typeof data === 'object' && data.error && data.error.message) ||
            (typeof data === 'string' ? data : data ? JSON.stringify(data) : '');
        const message = `HTTP ${res.status} ${res.statusText}${detail ? `: ${detail}` : ''}`;
        const err = new Error(message);
        err.status = res.status;
        err.statusText = res.statusText;
        err.data = data;
        throw err;
    }

    return data;
}

function createJsonClient({ baseURL, headers = {} }) {
    // Trailing slash + relative path: otherwise new URL('/x', base) drops the base path (e.g. /v1).
    const base = new URL(baseURL.endsWith('/') ? baseURL : `${baseURL}/`);
    return {
        async post(path, body) {
            const relative = path.startsWith('/') ? path.slice(1) : path;
            const url = new URL(relative, base);
            const data = await fetchJson(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...headers,
                },
                body,
            });
            return { data };
        },
    };
}

class BaseEmbeddingProvider {

    constructor({ model, dimensions } = {}) {
        this.model = model;
        this.dimensions = dimensions;
    }

    async embed(text) {
        throw new Error('The embed method must be implemented by derived classes');
    }
}

class OpenAIEmbeddingProvider extends BaseEmbeddingProvider {
    constructor({
        model = 'text-embedding-ada-002',
        dimensions = 1536,
        apiKey = process.env.OPENAI_API_KEY
    } = {}) {
        super({ model, dimensions });

        this.openaiClient = createJsonClient({
            baseURL: 'https://api.openai.com/v1',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
        });
    }

    async embed(text) {
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

class OpenRouterEmbeddingProvider extends BaseEmbeddingProvider {
    constructor({
        model,
        dimensions,
        apiKey = process.env.OPENROUTER_API_KEY
    } = {}) {
        super({ model, dimensions });

        this.openrouterClient = createJsonClient({
            baseURL: 'https://openrouter.ai/api/v1',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
        });
    }

    async embed(text) {
        try {
            const response = await this.openrouterClient.post('/embeddings', {
                model: this.model,
                input: text,
                encoding_format: 'float'
            });

            const body = response.data;
            if (!body?.data?.[0]?.embedding) {
                const detail = body?.error?.message || JSON.stringify(body);
                throw new Error(`Unexpected OpenRouter response for model ${this.model}: ${detail}`);
            }
            return body.data[0].embedding;
        } catch (error) {
            log.error('Error generating embeddings with OpenRouter:', error);
            throw error;
        }
    }
}

class QwenEmbeddingProvider extends OpenRouterEmbeddingProvider {
    constructor({
        model = 'qwen/qwen3-embedding-8b',
        dimensions = 4096
    } = {}) {
        super({ model, dimensions });
    }
}

class BgeM3EmbeddingProvider extends OpenRouterEmbeddingProvider {
    constructor({
        model = 'baai/bge-m3',
        dimensions = 1024
    } = {}) {
        super({ model, dimensions });
    }
}

class MultilingualE5LargeProvider extends OpenRouterEmbeddingProvider {
    constructor({
        model = 'intfloat/multilingual-e5-large',
        dimensions = 1024
    } = {}) {
        super({ model, dimensions });
    }
}

class OpenAIEmbedding3SmallRouterProvider extends OpenRouterEmbeddingProvider {
    constructor({
        model = 'openai/text-embedding-3-small',
        dimensions = 1536
    } = {}) {
        super({ model, dimensions });
    }
}

class OpenAIEmbedding3LargeRouterProvider extends OpenRouterEmbeddingProvider {
    constructor({
        model = 'openai/text-embedding-3-large',
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
    async embed(text) {
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
        reset = false,
        ttl = -1,
        similarityThreshold = 0.87,
        embeddingProvider = new HuggingfaceProvider(),
    } = {}) {
        if (ttl !== -1 && (!Number.isFinite(ttl) || ttl < 0)) {
            throw new TypeError('ttl must be -1 or a non-negative number of seconds');
        }
        if (!Number.isFinite(similarityThreshold) || similarityThreshold < 0 || similarityThreshold > 1) {
            throw new TypeError('similarityThreshold must be between 0 and 1');
        }

        this.embeddingProvider = embeddingProvider;
        this.options = { dbPath, reset, ttl, similarityThreshold };
        this.db = null;
        this._entriesTable = null;
        this._vectorsTable = null;
    }

    async connect() {
        if (this.db) {
            throw new Error('SeekMix is already connected');
        }

        if (typeof this.embeddingProvider.initialize === 'function') {
            await this.embeddingProvider.initialize();
        }
        this._assertEmbeddingProvider();

        const namespace = createHash('sha256')
            .update(`${this.embeddingProvider.model}:${this.embeddingProvider.dimensions}`)
            .digest('hex')
            .slice(0, 16);
        this._entriesTable = `seekmix_entries_${namespace}`;
        this._vectorsTable = `seekmix_vectors_${namespace}`;

        this.db = new Database(this.options.dbPath);
        try {
            sqliteVec.load(this.db);

            if (this.options.reset) {
                this.db.exec(`DROP TABLE IF EXISTS "${this._vectorsTable}"`);
                this.db.exec(`DROP TABLE IF EXISTS "${this._entriesTable}"`);
            }

            this.db.exec(`
                CREATE TABLE IF NOT EXISTS "${this._entriesTable}" (
                    row_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    id TEXT UNIQUE NOT NULL,
                    content TEXT NOT NULL,
                    data TEXT NOT NULL,
                    tags TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    expires_at INTEGER
                )
            `);
            this.db.exec(`
                CREATE INDEX IF NOT EXISTS "${this._entriesTable}_expires_at"
                ON "${this._entriesTable}" (expires_at)
            `);
            this.db.exec(`
                CREATE VIRTUAL TABLE IF NOT EXISTS "${this._vectorsTable}" USING vec0(
                    embedding float[${this.embeddingProvider.dimensions}] distance_metric=cosine
                )
            `);
        } catch (error) {
            this.db.close();
            this.db = null;
            throw error;
        }

        return true;
    }

    async disconnect() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }

    async upsert({ id, content, data, tags = [], expiresAt = null }) {
        this._assertConnected();
        this._assertEntry({ id, content, data, tags, expiresAt });

        const vector = await this._embed(content);
        const serializedData = JSON.stringify(data);
        const serializedTags = JSON.stringify([...new Set(tags)].sort());
        const timestamp = Date.now();

        const upsertEntry = this.db.transaction(() => {
            const existing = this.db.prepare(`
                SELECT row_id, created_at
                FROM "${this._entriesTable}"
                WHERE id = ?
            `).get(id);

            let rowId;
            let createdAt;
            if (existing) {
                rowId = existing.row_id;
                createdAt = existing.created_at;
                this.db.prepare(`
                    UPDATE "${this._entriesTable}"
                    SET content = ?, data = ?, tags = ?, updated_at = ?, expires_at = ?
                    WHERE row_id = ?
                `).run(content, serializedData, serializedTags, timestamp, expiresAt, rowId);
                this.db.prepare(`DELETE FROM "${this._vectorsTable}" WHERE rowid = ?`).run(rowId);
            } else {
                const result = this.db.prepare(`
                    INSERT INTO "${this._entriesTable}"
                        (id, content, data, tags, created_at, updated_at, expires_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run(id, content, serializedData, serializedTags, timestamp, timestamp, expiresAt);
                rowId = result.lastInsertRowid;
                createdAt = timestamp;
            }

            this.db.prepare(`
                INSERT INTO "${this._vectorsTable}" (rowid, embedding)
                VALUES (?, ?)
            `).run(BigInt(rowId), vector);

            return {
                id,
                content,
                data: JSON.parse(serializedData),
                tags: JSON.parse(serializedTags),
                createdAt,
                updatedAt: timestamp,
                expiresAt,
            };
        });

        return upsertEntry();
    }

    async set(query, result, { tags = [] } = {}) {
        this._assertTags(tags, 'tags');
        const expiresAt = this.options.ttl === -1
            ? null
            : Date.now() + (this.options.ttl * 1000);

        await this.upsert({
            id: query,
            content: query,
            data: result,
            tags,
            expiresAt,
        });
        return true;
    }

    async get(query, { tags = [] } = {}) {
        const [match] = await this.search(query, {
            limit: 1,
            minSimilarity: this.options.similarityThreshold,
            tags: this._normalizeCacheTags(tags),
        });
        if (!match) return null;

        return {
            query: match.content,
            result: match.data,
            timestamp: match.updatedAt,
            score: match.distance,
            tags: match.tags,
        };
    }

    async getById(id) {
        this._assertConnected();
        this._assertId(id);
        this.purgeExpired();

        const row = this.db.prepare(`
            SELECT id, content, data, tags, created_at, updated_at, expires_at
            FROM "${this._entriesTable}"
            WHERE id = ?
        `).get(id);

        return row ? this._deserializeEntry(row) : null;
    }

    async search(query, {
        limit = 10,
        minSimilarity = -1,
        tags = {},
    } = {}) {
        this._assertConnected();
        this._assertSearch({ query, limit, minSimilarity, tags });
        this.purgeExpired();

        const { all = [], none = [] } = tags;
        const hasTagFilters = all.length > 0 || none.length > 0;
        const entryCount = this.db.prepare(
            `SELECT COUNT(*) AS count FROM "${this._entriesTable}"`
        ).get().count;
        if (entryCount === 0) return [];

        const vector = await this._embed(query);
        const candidateCount = hasTagFilters ? entryCount : Math.min(limit, entryCount);
        const rows = this.db.prepare(`
            WITH matches AS (
                SELECT rowid, distance
                FROM "${this._vectorsTable}"
                WHERE embedding MATCH ?
                  AND k = ?
                ORDER BY distance
            )
            SELECT
                e.id,
                e.content,
                e.data,
                e.tags,
                e.created_at,
                e.updated_at,
                e.expires_at,
                matches.rowid AS row_id,
                matches.distance
            FROM matches
            JOIN "${this._entriesTable}" e ON e.row_id = matches.rowid
            ORDER BY matches.distance
        `).all(vector, candidateCount);
        rows.sort((left, right) => left.distance - right.distance || left.row_id - right.row_id);

        const results = [];
        for (const row of rows) {
            const similarity = 1 - row.distance;
            if (similarity < minSimilarity) break;

            const entry = this._deserializeEntry(row);
            if (all.some(tag => !entry.tags.includes(tag))) continue;
            if (none.some(tag => entry.tags.includes(tag))) continue;

            results.push({
                ...entry,
                similarity,
                distance: row.distance,
            });
            if (results.length === limit) break;
        }

        return results;
    }

    async delete(id) {
        this._assertConnected();
        this._assertId(id);

        const row = this.db.prepare(
            `SELECT row_id FROM "${this._entriesTable}" WHERE id = ?`
        ).get(id);
        if (!row) return false;

        this._deleteRows([row.row_id]);
        return true;
    }

    async clear() {
        this._assertConnected();
        const result = this.db.prepare(
            `SELECT COUNT(*) AS count FROM "${this._entriesTable}"`
        ).get();

        const clearEntries = this.db.transaction(() => {
            this.db.exec(`DELETE FROM "${this._vectorsTable}"`);
            this.db.exec(`DELETE FROM "${this._entriesTable}"`);
        });
        clearEntries();
        return result.count;
    }

    purgeExpired() {
        this._assertConnected();
        const rows = this.db.prepare(`
            SELECT row_id
            FROM "${this._entriesTable}"
            WHERE expires_at IS NOT NULL AND expires_at <= ?
        `).all(Date.now());
        if (rows.length > 0) {
            this._deleteRows(rows.map(row => row.row_id));
        }
        return rows.length;
    }

    _deleteRows(rowIds) {
        const deleteRows = this.db.transaction((ids) => {
            const deleteVector = this.db.prepare(
                `DELETE FROM "${this._vectorsTable}" WHERE rowid = ?`
            );
            const deleteEntry = this.db.prepare(
                `DELETE FROM "${this._entriesTable}" WHERE row_id = ?`
            );

            for (const rowId of ids) {
                deleteVector.run(rowId);
                deleteEntry.run(rowId);
            }
        });
        deleteRows(rowIds);
    }

    async _embed(text) {
        const embedding = await this.embeddingProvider.embed(text);
        const values = ArrayBuffer.isView(embedding) ? embedding : new Float32Array(embedding);

        if (values.length !== this.embeddingProvider.dimensions) {
            throw new Error(
                `Embedding dimension mismatch: expected ${this.embeddingProvider.dimensions}, got ${values.length}`
            );
        }
        for (const value of values) {
            if (!Number.isFinite(value)) {
                throw new Error('Embedding values must be finite numbers');
            }
        }

        return values instanceof Float32Array ? values : new Float32Array(values);
    }

    _deserializeEntry(row) {
        return {
            id: row.id,
            content: row.content,
            data: JSON.parse(row.data),
            tags: JSON.parse(row.tags),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            expiresAt: row.expires_at,
        };
    }

    _assertConnected() {
        if (!this.db) {
            throw new Error('SeekMix is not connected');
        }
    }

    _assertEmbeddingProvider() {
        const { model, dimensions, embed } = this.embeddingProvider;
        if (typeof model !== 'string' || model.length === 0) {
            throw new TypeError('embeddingProvider.model must be a non-empty string');
        }
        if (!Number.isInteger(dimensions) || dimensions <= 0) {
            throw new TypeError('embeddingProvider.dimensions must be a positive integer');
        }
        if (typeof embed !== 'function') {
            throw new TypeError('embeddingProvider.embed must be a function');
        }
    }

    _assertId(id) {
        if (typeof id !== 'string' || id.length === 0) {
            throw new TypeError('id must be a non-empty string');
        }
    }

    _assertEntry({ id, content, data, tags, expiresAt }) {
        this._assertId(id);
        if (typeof content !== 'string' || content.length === 0) {
            throw new TypeError('content must be a non-empty string');
        }
        if (data === undefined || JSON.stringify(data) === undefined) {
            throw new TypeError('data must be JSON-serializable');
        }
        this._assertTags(tags, 'tags');
        if (expiresAt !== null && (!Number.isFinite(expiresAt) || expiresAt < 0)) {
            throw new TypeError('expiresAt must be null or a non-negative Unix timestamp in milliseconds');
        }
    }

    _assertSearch({ query, limit, minSimilarity, tags }) {
        if (typeof query !== 'string' || query.length === 0) {
            throw new TypeError('query must be a non-empty string');
        }
        if (!Number.isInteger(limit) || limit <= 0) {
            throw new TypeError('limit must be a positive integer');
        }
        if (!Number.isFinite(minSimilarity) || minSimilarity < -1 || minSimilarity > 1) {
            throw new TypeError('minSimilarity must be between -1 and 1');
        }
        if (!tags || typeof tags !== 'object' || Array.isArray(tags)) {
            throw new TypeError('tags must be an object with all and none arrays');
        }
        this._assertTags(tags.all || [], 'tags.all');
        this._assertTags(tags.none || [], 'tags.none');
    }

    _assertTags(tags, field) {
        if (!Array.isArray(tags) || tags.some(tag => typeof tag !== 'string' || tag.length === 0)) {
            throw new TypeError(`${field} must be an array of non-empty strings`);
        }
    }

    _normalizeCacheTags(tags) {
        if (Array.isArray(tags)) {
            return { all: tags };
        }
        if (tags && typeof tags === 'object' && !Array.isArray(tags)) {
            return {
                all: tags.in || [],
                none: tags.out || [],
            };
        }
        throw new TypeError('tags must be an array or an object with in and out arrays');
    }
}

module.exports = {
    SeekMix,
    HuggingfaceProvider,
    BaseEmbeddingProvider,
    OpenAIEmbeddingProvider,
    OpenAIEmbedding3Provider,
    OpenAIEmbedding3LargeProvider,
    OpenRouterEmbeddingProvider,
    QwenEmbeddingProvider,
    BgeM3EmbeddingProvider,
    MultilingualE5LargeProvider,
    OpenAIEmbedding3SmallRouterProvider,
    OpenAIEmbedding3LargeRouterProvider
};
