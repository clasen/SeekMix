const { createClient, SchemaFieldTypes } = require('redis');
const axios = require('axios');

// Clase para la generación de embeddings
class EmbeddingProvider {
    constructor({
        model = 'text-embedding-ada-002',
        dimensions = 1536,
        apiKey = process.env.OPENAI_API_KEY
    } = {}) {
        this.model = model;
        this.dimensions = dimensions;
        
        // Configurar cliente Axios para OpenAI
        this.openaiClient = axios.create({
            baseURL: 'https://api.openai.com/v1',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });
    }

    // Obtener embeddings usando OpenAI
    async getEmbeddings(text) {
        try {
            const response = await this.openaiClient.post('/embeddings', {
                model: this.model,
                input: text,
                encoding_format: 'float'
            });
            return response.data.data[0].embedding;
        } catch (error) {
            console.error('Error al generar embeddings:', error);
            throw error;
        }
    }

    // Convertir array a Float32Buffer para búsquedas vectoriales
    float32Buffer(arr) {
        return Buffer.from(new Float32Array(arr).buffer);
    }
}

// Clase principal del caché semántico
class SemanticCache {
    constructor({
        redisUrl = 'redis://localhost:6379',
        indexName = 'semantic_cache_idx',
        keyPrefix = 'semantic:',
        ttl = 60 * 60 * 24,
        similarityThreshold = 0.8,
        dropIndex = false,
        embeddingProvider = null,
        embeddingOptions = {}
    } = {}) {
        // Crear provider de embeddings si no se proporciona uno
        this.embeddingProvider = embeddingProvider || new EmbeddingProvider(embeddingOptions);
        
        this.options = { 
            redisUrl, 
            vectorDimensions: this.embeddingProvider.dimensions,
            indexName, 
            keyPrefix, 
            ttl, 
            similarityThreshold, 
            dropIndex 
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

            // Eliminar índice existente si existe
            if (this.options.dropIndex) {
                try {
                    await this.redisClient.ft.dropIndex(this.options.indexName);
                    console.log(`Índice ${this.options.indexName} eliminado`);
                } catch (error) {
                    if (!error.message.includes('Unknown Index name')) {
                        throw error;
                    }
                }
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
                            ALGORITHM: 'HNSW',
                            TYPE: 'FLOAT32',
                            DIM: this.options.vectorDimensions,
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
                console.log(`Índice ${this.options.indexName} creado correctamente`);
            } else {
                console.log(`Usando índice existente: ${this.options.indexName}`);
            }

            return true;
        } catch (error) {
            console.error('Error al conectar con Redis o configurar índice:', error);
            throw error;
        }
    }

    // Desconectar el cliente Redis
    async disconnect() {
        return this.redisClient.disconnect();
    }

    // Guardar una entrada en el caché con su vector de embeddings
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

            // Establecer TTL
            await this.redisClient.expire(key, this.options.ttl);

            return true;
        } catch (error) {
            console.error('Error al guardar en caché:', error);
            throw error;
        }
    }

    // Buscar una entrada semánticamente similar en el caché
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
                const cachedResult = {
                    query: results.documents[0].value['$.query'],
                    result: results.documents[0].value['$.result'],
                    timestamp: results.documents[0].value['$.timestamp'],
                    score: results.documents[0].value['score'],
                };

                return cachedResult;
            }

            return null;
        } catch (error) {
            console.error('Error al buscar en caché:', error);
            return null;
        }
    }

    // Invalidar entradas antiguas del caché
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
            console.error('Error al invalidar caché antiguo:', error);
            throw error;
        }
    }

    // Generar una clave única basada en el texto
    _generateKey(text) {
        return Buffer.from(text).toString('base64').substring(0, 32);
    }
}

module.exports = { SemanticCache, EmbeddingProvider };