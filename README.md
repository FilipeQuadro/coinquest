# CoinQuest v0.1 — RPG financeiro local-first

Primeira fundação funcional do projeto: PWA + React + TypeScript + Dexie/IndexedDB + Phaser 3.90.

## O que já existe

- Registro rápido em português: `gastei 39,90 no mercado no pix`.
- Registro manual de receita/despesa.
- Saldo, receitas, despesas e quantidade de registros no mês.
- Histórico com exclusão.
- Banco local IndexedDB via Dexie.
- PWA com Service Worker para abrir offline depois do primeiro carregamento.
- Cena Phaser em pixel-art desenhada por código, sem assets copiados de Terraria.
- Baú reage a receitas/despesas.
- Som de feedback gerado localmente via Web Audio API, sem arquivos externos.
- Layout responsivo para notebook e iPhone.

## 1. Pré-requisitos

Use Node.js 22.12+ (ou versão compatível com o Vite atual).

Confira:

```bash
node -v
npm -v
```

## 2. Instalar dependências

Abra o terminal dentro da pasta `coinquest`:

```bash
npm install
```

## 3. Rodar no notebook

```bash
npm run dev
```

Abra o endereço mostrado pelo Vite, normalmente `http://localhost:5173`.

## 4. Testar build

```bash
npm run build
npm run preview
```

## 5. Sobre o iPhone

Para Service Worker/PWA funcionar corretamente no iPhone, o app precisa ser servido por HTTPS (localhost é exceção apenas no próprio computador). O caminho mais simples depois é publicar gratuitamente em um host HTTPS, mantendo os dados financeiros no IndexedDB do aparelho.

No iPhone: Safari → Compartilhar → Adicionar à Tela de Início.

## 6. Onde os dados ficam

Nesta fase, cada aparelho possui seu próprio banco IndexedDB. Isso significa que iPhone e notebook ainda **não sincronizam automaticamente**.

A próxima camada será um mecanismo de sincronização opcional, sem quebrar o modo offline.

## Próximas fases sugeridas

1. Orçamento mensal e limites por categoria.
2. Metas/missões financeiras.
3. Simulador de compras futuras e parcelas.
4. Mundo com casa evolutiva, clima, ciclo dia/noite e conquistas.
5. Backup criptografado e exportação/importação.
6. Sincronização opcional entre iPhone e notebook.

## Estrutura

```text
src/
├── components/   # interface React
├── db/           # IndexedDB / Dexie
├── game/         # Phaser e eventos do mundo
├── lib/          # parser, áudio, dinheiro
└── styles/       # visual geral
```
