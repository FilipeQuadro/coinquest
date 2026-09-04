# AGENTS.md - CoinQuest

Guia operacional permanente para agentes de codigo trabalhando no CoinQuest.
Leia este arquivo antes de iniciar uma tarefa e evite redescobrir arquitetura ou regras de dominio ja decididas.

## Arquitetura

- CoinQuest e um gerenciador financeiro local-first com apresentacao gamificada em pixel-art.
- Stack principal: React, TypeScript, Vite, Phaser, Dexie/IndexedDB, PWA, Vitest e Playwright.
- React e a camada financeira controlam regras de dominio, estado da aplicacao e persistencia.
- Phaser e camada de apresentacao/game world: reage a eventos, mas nao e fonte da verdade financeira.
- Phaser nao deve recalcular financas, armazenar dados financeiros ou derivar saude financeira por conta propria.
- Dexie/IndexedDB e persistencia local-first. Offline e parte central do produto.
- Fluxo geral: finance engine / React -> Dexie -> eventos -> Phaser reage.

## Regras Financeiras Permanentes

- Planned != Actual.
- Budget != balance.
- Budget e limite de planejamento, nao dinheiro existente e nao saldo.
- Transaction representa dinheiro realmente movimentado.
- RecurringRule/RecurringOccurrence planned nao vira Transaction automaticamente.
- Recurring realization explicita cria Transaction real.
- Credit card purchase nao e cash Transaction imediata.
- CardPurchase gera compromissos/faturas, nao movimentacao de caixa.
- Pagamento de fatura gera uma Transaction `kind: credit_card_payment`.
- Pagamento de fatura nao deve consumir Budget novamente.
- Invoice `dueDate` != `paymentDate`.
- `paymentDate` e a data real da movimentacao financeira.
- `paidAt` e timestamp tecnico da confirmacao.
- GoalContribution e alocacao para meta, nao Transaction.
- Goal completed significa objetivo reservado atingido; nao significa compra realizada.
- Simulation e hipotetica e nao persiste nada.
- MonthlyProjection / projectedNet nao significa saldo bancario futuro.
- Nao inventar opening balance.

## Datas e Meses

- Features financeiras devem respeitar `SelectedMonth` quando exibem ou calculam dados mensais.
- `SelectedMonth` usa `{ year, month }`.
- `month` segue o padrao zero-based da arquitetura existente.
- Preserve e reutilize helpers existentes de mes antes de fazer `month + 1` / `month - 1` espalhado.
- Evite parsing UTC acidental em datas financeiras locais.
- Para datas locais, siga o padrao atual do projeto e prefira construcao local explicita a `new Date("YYYY-MM-DD")`.
- Novo registro financeiro nao deve usar silenciosamente um mes selecionado historico/futuro como data real.

## Cartoes

- Reutilize o dominio existente de fechamento, vencimento, faturas e parcelas.
- Nunca implemente outro algoritmo paralelo de parcelamento ou ciclo de fatura.
- Preserve o tratamento de centavos: a soma das parcelas deve fechar exatamente o total.
- Evite dupla contagem entre parcelas e pagamento de fatura.
- Budget conta despesas standard e compromissos de parcelas; nao conta pagamento de fatura de novo.
- MonthlyOutlook/Projection contam fatura pendente como compromisso e fatura paga como cash movement real, nunca ambos.
- Cartao inativo preserva historico, compras, parcelas, faturas e pagamentos.
- Mudancas estruturais de ciclo (`closingDay`/`dueDay`) devem respeitar as protecoes existentes.

## Recorrencias

- RecurringRule e uma regra mensal; occurrences sao derivadas sob demanda.
- Nao materialize meses futuros indefinidamente.
- Estados `skipped` e `realized` usam overrides.
- `skipped` nao conta como planned naquele mes.
- `realized` nao conta novamente como planned.
- Nunca converta automaticamente uma recorrencia por vencimento/data.

## Metas

- Goal e GoalContribution pertencem ao dominio de alocacao, separado de cash.
- Contribution nao altera Transaction, Budget, MonthlyOutlook ou Projection.
- Retirada de meta deve ser historica/explicita; nao apagar silenciosamente contribuicoes antigas.
- Completed nao e compra realizada.
- Phaser so pode reagir a transicao real `active -> completed`.
- Reload, abrir detalhes, editar nome, arquivar ou restaurar nao devem repetir reacao de conclusao.

## Simulador

- Simulator usa baseline vs scenario.
- Reutilize Projection Engine e Card domain.
- Nao escreva no Dexie durante simulacao.
- Nao crie Transaction, CardPurchase, GoalContribution ou RecurringRule durante simulacao.
- Nao emita eventos financeiros nem acione Phaser durante simulacao.
- Nao classifique cenario como safe/dangerous/best/recomendado sem feature explicita.
- Impactos fora do horizonte devem continuar visiveis.
- Simulation result != bank balance.

## Banco e Migrations

- Dexie atual usa `coinquest-db`; schema vigente confirmado ate `version(6)`.
- Migrations Dexie devem preservar dados existentes.
- Nunca apagar tabelas ou dados financeiros sem instrucao explicita.
- Use a proxima `version()` apenas quando o schema realmente mudar.
- Evite migration para mudancas puramente de UI.
- Ao adicionar campos, preserve semantica de registros antigos com defaults seguros.

## Convencoes de Implementacao

- Use TypeScript consistente com o estilo existente.
- Reutilize servicos/helpers existentes antes de criar logica paralela.
- Componentes React apresentam dados; evite duplicar logica financeira na UI.
- Engines financeiras devem preferir funcoes puras e testes focados.
- Mudancas financeiras precisam de testes.
- Nao adicionar backend, Supabase ou API externa sem decisao explicita.
- Nao substituir a arquitetura local-first sem decisao explicita.
- Nao copiar assets protegidos de Terraria ou de qualquer outro jogo.
- Nao faca refatoracoes oportunistas junto de uma tarefa especifica.

## Estrategia de Testes

Ordem preferida:

1. Teste especifico alterado.
2. Testes do modulo.
3. Regressoes relacionadas.
4. `npm test` / `npm run test:run` quando necessario.
5. `npm run typecheck`.
6. `npm run build`.
7. Playwright/E2E apenas quando houver fluxo de usuario relevante ou no fechamento da tarefa.

Nao rode E2E repetidamente em pequenos ciclos. Se E2E falhar de forma localizada, corrija e execute primeiro apenas o teste relevante.

## Comandos

Scripts reais confirmados em `package.json`:

- Dev: `npm run dev` -> `vite --host 0.0.0.0`
- Test: `npm test` -> `vitest run`
- Test run: `npm run test:run` -> `vitest run`
- E2E: `npm run e2e` -> `node ./scripts/run-e2e.mjs`
- Typecheck: `npm run typecheck` -> `tsc --noEmit`
- Build: `npm run build` -> `tsc --noEmit && vite build`

## Estrategia de Trabalho Para Agentes

- Leia este `AGENTS.md` antes de comecar.
- Nao faca auditoria global sem necessidade.
- Leia apenas arquivos diretamente relacionados a tarefa.
- Siga padroes existentes quando houver implementacao semelhante.
- Revise primeiro o diff da propria tarefa antes de finalizar.
- Nao avance automaticamente para a proxima fase.
- Nao faca commit/push salvo instrucao explicita.
- Se surgir necessidade de mudanca arquitetural fora do escopo, pare e relate em vez de improvisar.

