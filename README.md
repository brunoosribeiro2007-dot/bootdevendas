# Automação de Ofertas de Afiliado - Mercado Livre

Sistema em Node.js para buscar produtos automaticamente no Mercado Livre, extrair dados, gerar mensagens formatadas e enfileirar para publicação com intervalo fixo de 10 minutos.

## 🛠 Tecnologias

- Node.js
- Express
- Axios
- Node-cron
- SQLite3
- Winston (Logs)

## 🏗 Arquitetura

O projeto segue uma arquitetura em camadas:
- `src/config`: Configurações globais, variáveis de ambiente e log.
- `src/database`: Conexão sqlite e queries de banco.
- `src/services`: Regras de negócio, chamadas do ML e manipulação da fila.
- `src/controllers`: Lógica de rotas e processamento das requisições REST.
- `src/routes`: Definição de endpoints.
- `src/jobs`: Tarefas agendadas (Busca de produtos e Publicação).
- `src/publishers`: Interface genérica para diferentes canais de comunicação.

## 🚀 Como Executar

1. Clone ou baixe o repositório.
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Crie um arquivo `.env` baseado no `.env.example`:
   ```bash
   cp .env.example .env
   ```
4. Inicie o servidor:
   ```bash
   npm start
   ```
   Ou para desenvolvimento com autoreload:
   ```bash
   npm run dev
   ```

## 📚 Endpoints da API

- **GET /api/health:** Checagem de disponibilidade.

- **POST /api/products/capture:** Força a captura imediata de produtos.
  _Body opcional:_ `{ "keyword": "notebook", "category": "" }`

- **GET /api/products:** Lista todo o histórico da fila.

- **GET /api/queue/pending:** Lista itens na fila com status `pending`.

- **GET /api/queue/status/:status:** Lista itens na fila por status (pending, approved, rejected, published).

- **PATCH /api/queue/:id/approve:** Aprova um item `pending` para ser publicado pelo cron.

- **PATCH /api/queue/:id/reject:** Rejeita um item.

- **PATCH /api/queue/:id/reprocess:** Volta um item para o status `pending`.

- **PATCH /api/queue/:id/publish:** Marca um item manualmente como `published`.

## 🧪 Testes

Para rodar os testes básicos:
```bash
npm test
```
