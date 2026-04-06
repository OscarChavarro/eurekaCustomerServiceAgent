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
      "contextMessage": "..."
    }
  }
}
```

Comportamiento actual:

- `naive`: retorna el texto configurado en `contextGenerator.naive.contextMessage`.
- `vector-search`: placeholder actual que retorna `TODO: Implement this!`.
