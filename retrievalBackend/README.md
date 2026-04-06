# retrievalBackend

`retrievalBackend` expone el endpoint wrapper `POST /v1/chat/completions` y centraliza la estrategia de generacion de contexto para LLM.

## Context Generation

La generacion de contexto se organiza como un use case de aplicacion:

- `GenerateContextUseCase` (`src/main/application/use-cases/context-generation`)
- puerto outbound `ContextGenerator`
- adapters outbound concretos:
  - `NaiveContextGenerator`
  - `VectorSearchContextGenerator`

`StreamChatCompletionsUseCase` delega la construccion del mensaje de sistema en `GenerateContextUseCase` y luego llama al puerto de chat completions.

## Seleccion de Implementacion

La implementacion activa se selecciona en `secrets.json` bajo `contextGenerator.implementation`.

Valores soportados:

- `naive`
- `vector-search`

Ejemplo:

```json
{
  "contextGenerator": {
    "implementation": "naive",
    "naive": {
      "contextMessage": ["...", "..."]
    }
  }
}
```

Comportamiento actual:

- `naive`: concatena `contextGenerator.naive.contextMessage` con espacios y retorna ese contexto (ademas imprime el contexto generado en consola).
- `vector-search`:
  1. toma el ultimo prompt del usuario;
  2. llama a BGE (`embedding`) para convertir prompt a vector;
  3. consulta Qdrant (`qdrant`) para recuperar chunks similares;
  4. arma un contexto de sistema en espanol con evidencia recuperada;
  5. imprime el contexto generado en consola.

## Configuracion para `vector-search`

`secrets.json` incluye:

- `embedding.provider|host|port` (servicio BGE)
- `qdrant.url|apiKey|collectionName`
- `contextGenerator.vectorSearch.maxMatches`

## Startup Validation

En el arranque se ejecuta validacion de conectividad con BGE:

- si `contextGenerator.implementation` es `vector-search`, valida llamada real a `/embed`.
- si esta en `naive`, la validacion BGE se omite de forma explicita.
