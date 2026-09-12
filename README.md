# CoinQuest V1

CoinQuest e um RPG financeiro local-first para controlar dinheiro real sem perder a sensacao de progresso. A V1 inclui transacoes, orcamento, recorrencias, cartoes, projecoes, metas, simulador de compras, backup local, sincronizacao Supabase opcional, resolucao explicita de conflitos, recuperacao de senha, PWA e experiencia visual game-first com Phaser.

## Requisitos

- Node.js 22.12+ ou versao compativel com o Vite atual.
- npm.

## Instalar

```bash
npm install
```

## Desenvolvimento

```bash
npm run dev
```

O Vite publica em `0.0.0.0` para permitir testes em outros dispositivos da rede local.

## Build e preview

```bash
npm run build
npm run preview
```

Use o preview para validar o comportamento de producao, PWA e service worker.

## Variaveis de ambiente

Crie um `.env.local` local quando quiser habilitar sincronizacao Supabase:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Essas variaveis usam a publishable key do Supabase. Nunca coloque `service_role`, senhas de banco ou secrets no frontend.

## Local-first, sync e backup

O CoinQuest salva primeiro no IndexedDB do dispositivo. A sincronizacao com Supabase e opcional e serve para convergir dados entre dispositivos autenticados. Backup local continua separado da nuvem e pode ser usado para exportar/restaurar os dados do aparelho.

## PWA e iPhone

Depois do primeiro carregamento em producao, o app pode abrir offline com os assets em cache e manter o uso local. Para instalabilidade e PWA completa em dispositivos reais, publique em HTTPS. No iOS, a instalacao ocorre pelo Safari em Compartilhar > Adicionar a Tela de Inicio, e a sincronizacao acontece quando o app esta aberto, retomado ou volta a ficar online.

## Scripts

```bash
npm run test:run
npm run typecheck
npm run build
npm run preview
```
