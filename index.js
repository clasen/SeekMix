const { createClient, SchemaFieldTypes, VectorAlgorithms } = require('redis');
const axios = require('axios');
const { pipeline } = require('@huggingface/transformers');
const log = require('lemonlog')('SeekMix');

class BaseEmbeddingProvider {

    constructor({model, dimensions} = {}) {
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
        dimensions = 1536,
        apiKey = process.env.OPENAI_API_KEY
    } = {}) {
        super({ model, dimensions, apiKey });
    }
}

class OpenAIEmbedding3LargeProvider extends OpenAIEmbeddingProvider {
    constructor({
        model = 'text-embedding-3-large',
        dimensions = 3072,
        apiKey = process.env.OPENAI_API_KEY
    } = {}) {
        super({ model, dimensions, apiKey });
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
        redisUrl = 'redis://localhost:6379',
        indexName = 'seekmix:idx',
        keyPrefix = 'seekmix:',
        ttl = 60 * 60 * 24,
        similarityThreshold = 0.87,
        dropIndex = false,
        dropKeys = false,
        embeddingProvider = null
    } = {}) {
        // Crear provider de embeddings si no se proporciona uno
        this.embeddingProvider = embeddingProvider || new HuggingfaceProvider();

        this.options = {
            redisUrl,
            indexName,
            keyPrefix,
            ttl,
            similarityThreshold,
            dropIndex,
            dropKeys
        };

        // Inicializar el cliente Redis
        this.redisClient = createClient({
            url: this.options.redisUrl,
        });
    }

    // Conectar al cliente Redis y configurar el índice de vectores
    async connect() {
        try {
            await this.redisClient.connect();

            // Initialize HuggingfaceProvider if applicable
            if (this.embeddingProvider instanceof HuggingfaceProvider) {
                await this.embeddingProvider.initialize();
            }

            this.options.indexName = this.options.indexName + ':' + this.embeddingProvider.model;
            this.options.keyPrefix = this.options.keyPrefix + this.embeddingProvider.model + ':';

            // Eliminar índice existente si existe
            if (this.options.dropIndex) {
                try {
                    await this.redisClient.ft.dropIndex(this.options.indexName);
                    log.info(`Index ${this.options.indexName} deleted`);
                } catch (error) {
                    if (!error.message.includes('Unknown Index name')) {
                        throw error;
                    }
                }
            }

            // Eliminar todas las claves del prefijo si se solicita
            if (this.options.dropKeys) {
                this.dropKeys();
            }

            const indices = await this.redisClient.ft._LIST();
            if (!indices.includes(this.options.indexName)) {
                // Crear un índice vectorial en Redis para búsqueda semántica
                await this.redisClient.ft.create(
                    this.options.indexName,
                    {
                        '$.vector': {
                            type: SchemaFieldTypes.VECTOR,
                            AS: 'vector',
                            ALGORITHM: VectorAlgorithms.HNSW,
                            TYPE: 'FLOAT32',
                            DIM: this.embeddingProvider.dimensions,
                            DISTANCE_METRIC: 'COSINE'
                        },
                        '$.text': {
                            type: SchemaFieldTypes.TEXT,
                            AS: 'text',
                            SORTABLE: true
                        },
                        '$.timestamp': {
                            type: SchemaFieldTypes.NUMERIC,
                            AS: 'timestamp',
                            SORTABLE: true
                        }
                    },
                    {
                        ON: 'JSON',
                        PREFIX: this.options.keyPrefix
                    }
                );
                log.info(`Index ${this.options.indexName} created successfully`);
            } else {
                log.info(`Using existing index: ${this.options.indexName}`);
            }

            return true;
        } catch (error) {
            log.error('Error connecting to Redis or configuring index:', error);
            throw error;
        }
    }

    async dropKeys() {
        try {
            let cursor = 0;
            do {
                const scanResult = await this.redisClient.scan(cursor, {
                    MATCH: `${this.options.keyPrefix}*`,
                    COUNT: 1000
                });

                cursor = scanResult.cursor;

                if (scanResult.keys.length > 0) {
                    await this.redisClient.del(scanResult.keys);
                    log.info(`Deleted ${scanResult.keys.length} keys with prefix ${this.options.keyPrefix}`);
                }
            } while (cursor !== 0);
        } catch (error) {
            log.error('Error deleting keys:', error);
        }
    }

    async disconnect() {
        return this.redisClient.disconnect();
    }

    async set(query, result) {
        try {
            const vector = await this.embeddingProvider.getEmbeddings(query);
            const timestamp = Date.now();
            const key = `${this.options.keyPrefix}${this._generateKey(query)}`;

            await this.redisClient.json.set(key, '$', {
                query,
                result,
                vector,
                timestamp,
                text: query
            });

            // Establecer TTL solo si no es -1 (sin caducidad)
            if (this.options.ttl !== -1) {
                await this.redisClient.expire(key, this.options.ttl);
            }

            return true;
        } catch (error) {
            log.error('Error saving to cache:', error);
            throw error;
        }
    }

    async get(query) {
        try {
            const vector = await this.embeddingProvider.getEmbeddings(query);
            // Crear un buffer para el vector
            const queryBuffer = this.embeddingProvider.float32Buffer(vector);

            // Buscar vector similar usando la sintaxis correcta de KNN
            const results = await this.redisClient.ft.search(
                this.options.indexName,
                '*=>[KNN 1 @vector $BLOB AS score]',
                {
                    PARAMS: {
                        BLOB: queryBuffer
                    },
                    SORTBY: 'score',
                    DIALECT: 2,
                    RETURN: ['$.query', '$.result', '$.timestamp', 'score'],
                }
            );

            if (results.total > 0 && results.documents[0].value.score <= (1 - this.options.similarityThreshold)) {
                return {
                    query: results.documents[0].value['$.query'],
                    result: results.documents[0].value['$.result'],
                    timestamp: results.documents[0].value['$.timestamp'],
                    score: results.documents[0].value['score'],
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

            // Buscar entradas más antiguas que el tiempo de corte
            const results = await this.redisClient.ft.search(
                this.options.indexName,
                `@timestamp:[0 ${cutoffTime}]`,
                {
                    LIMIT: {
                        from: 0,
                        size: 1000,
                    },
                }
            );

            // Eliminar entradas antiguas
            const deletePromises = results.documents.map(doc => {
                return this.redisClient.del(doc.id);
            });

            await Promise.all(deletePromises);
            return deletePromises.length;
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