// example.js
// Ejemplo de uso del caché semántico

require('dotenv').config();
const { SemanticCache } = require('../index');

// Función que simula una llamada a una API costosa (por ejemplo, una LLM)
async function expensiveApiCall(query) {
    console.log(`Realizando llamada costosa a API para: "${query}"`);
    // Simular tiempo de procesamiento
    await new Promise(resolve => setTimeout(resolve, 1000));

    // En un caso real, aquí se haría una llamada a una API como GPT-4
    return `Respuesta para: ${query} - ${new Date().toISOString()}`;
}

// Función principal para demostrar el uso del caché semántico
async function main() {
    // Crear e inicializar el caché semántico
    const cache = new SemanticCache({
        similarityThreshold: 0.9, // Umbral de similitud semántica
        ttl: 60 * 60, // TTL de 1 hora
        dropIndex: false
    });

    try {
        // Conectar al caché
        await cache.connect();
        console.log('Caché semántico conectado correctamente');

        // Ejemplos de consultas semánticamente similares
        const queries = [
            'Cuáles son los mejores restaurantes de Madrid',
            'Recomiéndame dónde comer en Madrid',
            'Necesito información sobre restaurantes en Barcelona',
            'Quiero saber lugares para comer en Madrid',
            'Mamá está loca'
        ];

        // Procesar las consultas, usando el caché cuando sea posible
        for (const query of queries) {
            console.log(`\nProcesando consulta: "${query}"`);

            // Intentar obtener del caché
            const cachedResult = await cache.get(query);

            if (cachedResult) {
                console.log(`✅ CACHÉ HIT - Similitud: ${(1 - cachedResult.score).toFixed(4)}`);
                console.log(`Consulta original: "${cachedResult.query}"`);
                console.log(`Resultado: ${cachedResult.result}`);
                console.log(`Almacenado hace: ${Math.round((Date.now() - cachedResult.timestamp) / 1000)} segundos`);
            } else {
                console.log('❌ CACHÉ MISS - Realizando llamada a API');

                // Realizar la llamada costosa
                const result = await expensiveApiCall(query);

                // Guardar en caché para futuras consultas similares
                await cache.set(query, result);
                console.log(`Resultado: ${result}`);
                console.log('Guardado en caché para futuras consultas similares');
            }
        }

        // Demo de invalidación
        // console.log('\n--- Demostración de invalidación ---');
        // const invalidated = await cache.invalidateOld(30); // Invalidar entradas con más de 30 segundos
        // console.log(`Entradas invalidadas: ${invalidated}`);

    } catch (error) {
        console.error('Error en la demostración:', error);
    } finally {
        // Cerrar la conexión al caché
        await cache.disconnect();
        console.log('\nConexión cerrada');
    }
}

// Ejecutar la demostración
main().catch(console.error);