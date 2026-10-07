# Cinematic Cozy Finance RPG

Este documento define a direcao visual V2.2 do CoinQuest. Ele nao muda regras financeiras, nao muda arquitetura e nao transforma o mundo Phaser em fonte da verdade. A intencao e orientar futuras implementacoes visuais para elevar o CoinQuest de um dashboard pixel-tech/RPG para uma experiencia mais atmosferica, emocional, cinematografica e acolhedora.

A direcao recomendada e combinar **Cinematic soft 2D** com **Diorama financeiro**:

- manter Phaser 2D;
- manter React e a finance engine como fonte da verdade;
- manter local-first/offline-first;
- preservar clareza financeira;
- evoluir o mundo visual como uma base viva do mes;
- usar luz, profundidade, parallax e composicao para criar emocao sem copiar jogos existentes.

## 1. Visao geral: Cinematic Cozy Finance RPG

CoinQuest deve parecer um lugar seguro para revisar a propria vida financeira. A experiencia deve comunicar calma, progresso e controle local, sem apagar a precisao dos numeros.

A experiencia desejada:

- uma base financeira acolhedora;
- uma cena 2D com profundidade, luz e clima;
- UI React clara e auditavel;
- mundo Phaser emocional, mas subordinado aos dados ja calculados;
- Central do Mes como ponto de encontro do usuario com o proprio mes;
- progresso visual como interpretacao, nao como verdade financeira.

O usuario deve sentir que chega a uma base/campfire mensal: um lugar para revisar o que aconteceu, olhar compromissos previstos, acompanhar metas e decidir o proximo ponto de revisao.

## 2. Diferenca entre inspiracao e copia

A inspiracao permitida e o nivel de ambicao visual: atmosfera, cuidado com luz, sensacao emocional, fluidez e profundidade. A implementacao deve ser original e propria do CoinQuest.

Inspiracao aceitavel:

- cenas que parecem acolhedoras;
- uso de luz como linguagem emocional;
- sensacao de jornada;
- camadas visuais com profundidade;
- composicao calma;
- microinteracoes suaves;
- feedback visual que nao grita.

Copia proibida:

- personagens, silhuetas, roupas, mascaras, capas ou criaturas reconheciveis;
- HUD, icones, simbolos, menus ou gestos visuais especificos de outro jogo;
- paleta exata;
- arquitetura de cenarios;
- narrativa, nomes, linguagem ou mitologia;
- composicoes de cena facilmente reconheciveis;
- mecanicas sociais ou de voo;
- qualquer identidade protegida.

A regra pratica: se alguem puder olhar para uma tela do CoinQuest e dizer "isso parece aquele jogo especifico", a direcao falhou.

## 3. Lista explicita do que nao pode ser copiado

Nao copiar de Sky ou de qualquer outro jogo:

- personagem com capa/manto/mascara/silhueta semelhante;
- proporcao corporal distintiva;
- formato de HUD;
- simbolos de energia, asa, constelacao ou ritual;
- cenas de nuvens, templos, portais ou arquitetura reconhecivel;
- paleta direta de dourado/celeste/pastel especifica;
- animacoes caracteristicas;
- narrativa de luz/ascensao/comunidade;
- nomes, termos, mapas ou progressao;
- composicao de camera reconhecivel;
- sons, musica, UI sonora ou identidade emocional proprietaria.

O CoinQuest deve construir sua propria metafora: **uma base financeira cozy, local e pessoal**, nao uma fantasia copiada.

## 4. Principios visuais

1. **Clareza antes de encanto**  
   Numeros, labels e acoes financeiras continuam objetivos. A atmosfera apoia a decisao, nao substitui dados.

2. **Mundo como reflexo, nao fonte**  
   Phaser renderiza sinais derivados de React/finance. Ele nao calcula, nao persiste e nao decide nada financeiro.

3. **Acolhimento sem infantilizar**  
   O app pode ser cozy, mas deve continuar adulto, util e respeitoso.

4. **Cinematico por composicao, nao por peso**  
   Usar camadas 2D, luz, parallax e ritmo visual. Evitar 3D pesado, videos ou assets enormes.

5. **Local-first visivel**  
   A experiencia deve reforcar que o usuario controla os dados no dispositivo.

6. **Estado financeiro sem julgamento moral**  
   O visual pode mostrar atencao ou calma, mas nao deve punir, assustar ou envergonhar.

7. **Progresso como jornada pessoal**  
   Metas, organizacao e revisao mensal podem aparecer como caminho, base, objetos e luz. Isso nao significa saldo, patrimonio ou previsao garantida.

## 5. Paleta sugerida propria

A paleta deve suavizar o pixel-tech atual sem abandonar completamente a identidade dark/local-first.

Base noturna:

- Ink deep: `#05070D`
- Midnight soil: `#0B1020`
- Cozy navy: `#121A2E`
- Soft panel: `#17213A`
- Deep violet: `#211A35`

Luz acolhedora:

- Campfire gold: `#F6D77A`
- Warm amber: `#F2A65A`
- Candle cream: `#FFF0C2`
- Hearth rose: `#E98F7D`

Luz atmosferica:

- Mist cyan: `#7EDFF2`
- Dawn blue: `#6FA8FF`
- Soft lilac: `#A995E8`
- Moon haze: `#CAD7F2`

Sinais financeiros:

- Income green: `#72E6A0`
- Attention amber: `#FFD36F`
- Expense coral: `#FF786F`
- Neutral slate: `#9FABCA`

Uso recomendado:

- cores financeiras continuam consistentes com significado;
- luz cozy aparece em fundo, ambientacao e progresso;
- vermelho/coral deve ser usado com moderacao para nao parecer alarme;
- dourado deve representar foco/decisao, nao "dinheiro garantido";
- azul/ciano representa tecnologia local, clareza e dados.

## 6. Linguagem de luz

A luz deve contar o estado emocional da base sem criar conclusoes financeiras falsas.

Fontes de luz:

- luz principal suave vinda de uma janela/campfire/base central;
- luz secundaria de monitores ou paineis financeiros;
- pontos pequenos em objetos de metas, cofre e planejamento;
- luz ambiente que muda por estado do mes, mas sempre com baixa intensidade.

Regras:

- luz quente para acolhimento e revisao;
- ciano para sistema/local/data;
- verde para entradas/movimentos positivos ja registrados;
- amber para pontos de revisao;
- coral apenas para atencao real, sem alarmismo;
- evitar neon forte ocupando toda a tela;
- evitar luz que esconda texto.

Estados visuais devem sempre ser acompanhados por texto claro em React quando afetarem interpretacao financeira.

## 7. Camera, composicao e profundidade

O CoinQuest deve continuar 2D, mas parecer mais profundo.

Composicao recomendada:

- primeiro plano: personagem, base, objetos de decisao;
- meio: mesa/campfire/painel mensal;
- fundo: janela, horizonte, ambiente ou paisagem simbolica;
- UI React: camada clara, proxima do usuario, sem desaparecer no cenario.

Camera:

- desktop: compor o mundo como uma cena ampla e calma;
- tablet: manter personagem + base + Centro do Mes legiveis;
- mobile: focar personagem/base, sem exigir scroll excessivo antes da acao financeira;
- evitar camera dramatica que prejudique usabilidade;
- usar movimentos sutis somente se respeitarem `prefers-reduced-motion`.

Profundidade:

- parallax lento;
- sombras suaves;
- pequenos glows;
- silhuetas no fundo;
- escala e sobreposicao de camadas;
- niebla/mist leve, nunca opaca sobre dados.

## 8. Parallax, nevoa, particulas e atmosfera

Parallax:

- manter poucas camadas;
- usar movimento lento e barato;
- nao depender de mouse/scroll para informacao essencial;
- preservar leitura no mobile.

Nevoa/mist:

- deve criar distancia e calma;
- nunca cobrir textos financeiros;
- preferir alpha baixo;
- desligar ou reduzir em `prefers-reduced-motion` se animada.

Particulas:

- poucas;
- lentas;
- temporarias quando relacionadas a eventos;
- nao usar particulas para representar valores exatos;
- nao criar "chuva de dinheiro" que incentive interpretacao errada.

Atmosfera:

- dia/noite pode existir, mas nao deve mudar significado financeiro;
- clima visual pode refletir estado do mes, mas sempre como sugestao emocional, nao diagnostico financeiro.

## 9. Como a Central do Mes vira base/campfire mensal

A Central do Mes deve ser o coracao de decisao. Ela pode ser visualmente tratada como "campfire" ou "mesa de revisao" do mes.

Objetivo:

- reunir resultado realizado, outlook, Centro de Decisao, insights e acoes;
- reduzir a sensacao de dashboard frio;
- manter cada conceito financeiro separado;
- guiar o usuario para revisar, nao para obedecer.

Tratamento visual:

- uma area principal com luz mais quente;
- Centro de Decisao como foco;
- itens de acao como pequenos mapas/papeis/placas;
- insights como leituras/sinais;
- outlook como estimativa marcada visualmente;
- historico como registros reais;
- metas como objetos de jornada, nao transacoes.

Copy segura:

- "pontos para revisar";
- "movimentacoes reais registradas";
- "compromissos previstos";
- "estimativa do mes";
- "planejamento";
- "acompanhar no mes".

Evitar:

- "voce deve";
- "corte gastos";
- "saldo futuro";
- "dinheiro disponivel";
- "previsao garantida";
- "oraculo financeiro".

## 10. Como o GameWorld vira um lugar emocional

O GameWorld atual e uma sala/lab compacta. A evolucao deve transformar essa sala em um lugar com memoria visual do mes.

Direcao:

- base pessoal, nao cockpit frio;
- objetos que representam areas do app;
- luz que convida a revisao;
- personagem com rotina e emocao;
- cofre digital como guardiao local dos dados;
- horizonte/janela como sensacao de jornada.

Exemplos de objetos:

- mesa de revisao mensal;
- mapa do mes;
- lanternas/metas;
- arquivo/historico;
- painel de compromissos;
- cofre local;
- plantas/luz quente para acolhimento;
- pequenos itens que indicam progresso sem mostrar dados sensiveis.

Limite importante:

O mundo nao deve exibir valores detalhados nem substituir historico, orcamento, projecao ou Centro de Decisao. Ele deve ser emocional e contextual.

## 11. Como representar orcamento, metas, historico, cartoes e projecoes sem confundir conceitos financeiros

### Orcamento

Representar como planejamento/limite:

- mapa de limites;
- trilha de planejamento;
- recipiente com marcadores;
- nao representar como dinheiro restante.

Nao usar:

- cofre cheio/vazio como "saldo";
- barra de "dinheiro disponivel";
- linguagem de sobra garantida.

### Metas

Representar como objetivos reservados/alocacoes:

- lanternas acesas;
- objetos em construcao;
- marco de jornada;
- caixa de projeto.

Nao representar como compra concluida ou dinheiro movimentado. `GoalContribution` nao cria `Transaction`.

### Historico

Representar como registros reais:

- diario;
- arquivo;
- trilha de pegadas;
- livro de movimentos.

Somente historico deve usar linguagem de movimentacao real ja registrada.

### Cartoes

Representar como compromissos/faturas:

- envelopes;
- calendario;
- selo de compromisso;
- painel separado do caixa.

Nao representar compra no cartao como saida de caixa imediata. Pagamento de fatura e movimento real.

### Projecoes

Representar como estimativa/cenario:

- horizonte;
- previsao de clima leve;
- mapa nebuloso;
- silhueta distante.

Nao representar como saldo futuro garantido.

## 12. Regras de clareza financeira

Regras obrigatorias para qualquer arte, UI ou copy futura:

- `Transaction` e movimento real de dinheiro.
- Budget e planejamento/limite, nao saldo.
- Projection e estimativa, nao saldo futuro garantido.
- Compra no cartao nao e transacao de caixa imediata.
- Pagamento de fatura e movimento real.
- GoalContribution e alocacao, nao Transaction.
- Simulation e hipotetica ate confirmacao explicita.
- Recorrencias sao previstas ate realizacao explicita.
- Nenhuma arte pode sugerir automacao financeira invisivel.
- Nenhuma cena pode insinuar que Phaser decide saude financeira.
- Nenhum estado visual deve parecer conselho financeiro prescritivo.

Toda representacao visual ambigua deve ter texto React claro por perto.

## 13. Personagem: direcao de silhueta, emocao e animacao

O personagem deve ser proprio do CoinQuest: alguem organizando uma base financeira local, com tecnologia e calma.

Silhueta:

- hoodie/jacket simples;
- headset ou pequeno acessorio tech;
- postura de trabalho/revisao;
- detalhes cozy, como cachecol curto, caneca ou luz de mesa, se nao parecer fantasia copiada;
- sem capa longa, mascara, asas, manto ou elementos que remetam diretamente a outra IP.

Emocao:

- idle calmo;
- respirar leve;
- olhar para tela/base;
- pequenos gestos de celebracao contida;
- reacao a despesa sem punição ou drama;
- animacao de revisao/concentracao.

Animacao:

- loops curtos;
- frames legiveis em mobile;
- prioridade para leitura e personalidade;
- efeitos procedurais baratos para brilho e feedback;
- respeitar `prefers-reduced-motion` para animacoes de UI, e considerar opcao futura para reduzir animacoes Phaser.

## 14. Mundo/base/diorama financeiro

A base deve ser uma representacao emocional do mes, nao um mapa grande.

Modelo recomendado:

- diorama compacto;
- um ponto central de luz;
- areas/objetos para dados, metas, planejamento, historico e compromissos;
- profundidade por camadas;
- background vivo, mas discreto;
- evolucao visual por sinais ja derivados.

Exemplos de regioes:

- Mesa/Campfire mensal: Centro de Decisao.
- Arquivo: Historico.
- Mapa: Planejamento e orçamento.
- Cofre local: Dados/backup.
- Calendario/lampiao: Recorrencias e compromissos.
- Estante de projetos: Metas.
- Painel distante: Projecao/estimativas.

O diorama nao deve virar menu escondido. A navegacao React continua clara.

## 15. HUD e UI bridge entre mundo e React

O HUD deve conectar mundo e finanças sem competir com a Central do Mes.

Direcao:

- HUD compacto;
- poucas metricas;
- labels claros;
- status visual com texto;
- links/atalhos em React, nao dentro do canvas;
- mundo nao deve conter dados sensiveis detalhados.

Bridge visual:

- cards React podem usar bordas, luz e profundidade da base;
- Centro de Decisao pode parecer uma mesa iluminada;
- botoes podem ter microinteracoes suaves;
- health card pode parecer um "sinal do mes", mas com texto objetivo.

Evitar:

- HUD cheio de numeros;
- termos vagos como energia financeira;
- XP financeiro se isso parecer saldo/progresso monetario;
- feedback visual que pareca recomendacao automatica.

## 16. Mobile, performance e bundle

O CoinQuest e PWA. A direcao cinematic/cozy precisa ser leve.

Regras:

- manter assets otimizados;
- preferir camadas 2D pequenas;
- evitar videos;
- evitar 3D;
- evitar shaders pesados;
- limitar particulas;
- carregar apenas assets usados;
- manter fallback procedural quando fizer sentido;
- testar em viewport mobile;
- nao bloquear a primeira acao financeira com uma cena pesada.

Metas praticas:

- novos sprites devem ter dimensoes proporcionais ao uso real;
- agrupar assets apenas quando houver volume suficiente;
- manter o build observavel;
- usar WebP/PNG conforme qualidade e pipeline;
- nao depender de rede para assets essenciais.

## 17. Acessibilidade e prefers-reduced-motion

A direcao visual nao pode depender apenas de cor ou movimento.

Regras:

- todo estado visual relevante deve ter texto;
- nao usar apenas vermelho/verde para significado;
- foco de teclado continua visivel;
- contraste de texto sobre fundos atmosfericos deve ser testado;
- hover nao pode ser a unica pista;
- mobile touch targets continuam confortaveis;
- animacoes CSS devem respeitar `prefers-reduced-motion`;
- futuras animacoes Phaser devem ter caminho para reduzir intensidade quando possivel.

## 18. Roadmap V2.2B/V2.2C/V2.2D/V2.2E

### V2.2B — Home cinematic prototype

Objetivo: prototipar a primeira impressao sem mexer em regras financeiras.

Escopo sugerido:

- shell visual da home;
- world intro mais cinematica;
- Central do Mes mais integrada;
- nenhum asset novo pesado;
- nenhum schema ou logica financeira.

### V2.2C — GameWorld atmosphere pass

Objetivo: evoluir atmosfera Phaser mantendo a sala/base compacta.

Escopo sugerido:

- parallax mais expressivo;
- luz ambiental;
- particulas leves;
- melhor clima dia/noite;
- sem Phaser virar fonte da verdade.

Status (v1.17.0): implementado em `src/game/systems/atmosphere.ts` com quatro fases (`dawn`, `day`, `dusk`, `night`, forcaveis via `?timeOfDay=`), faixa de luz da janela, sombra ambiente, poca de luz do monitor, particulas limitadas e parallax que acompanha o ponteiro. Com `prefers-reduced-motion`, parallax, particulas e loops decorativos ficam desligados; reacoes financeiras continuam.

### V2.2D — Character/world concept assets

Objetivo: criar ou substituir assets originais de personagem e objetos principais.

Escopo sugerido:

- concept do personagem;
- sprite sheet revisado;
- base/diorama objects;
- cofre local mais memoravel;
- manifest e testes de assets.

### V2.2E — UI bridge entre mundo e finanças

Objetivo: aproximar Centro de Decisao, GameWorld e cards principais.

Escopo sugerido:

- cards com linguagem de mesa/base;
- HUD compacto revisado;
- status visual + texto;
- links claros para areas financeiras.

Status (v1.18.0): "Mesa de revisao" abaixo do mundo em `GameWorld.tsx`, com nivel da base (marcadores + titulo + proximo passo) e atalhos para Registro, Orcamento, Recorrencias, Faturas e Metas rotulados como real, planejado, previsto, compromisso e alocacao. Todos os valores vem das engines React; o Phaser nao participa.

## 19. Criterios de aceite para futuras implementacoes

Uma implementacao futura deve ser aceita somente se:

- preservar React/finance como fonte da verdade;
- nao alterar regra financeira sem tarefa explicita de dominio;
- nao alterar schema/migration para polish visual;
- funcionar offline/local;
- nao depender de backend;
- nao copiar identidade de outro jogo;
- manter textos financeiros claros;
- distinguir real, planejado, estimado e simulado;
- funcionar em mobile;
- respeitar `prefers-reduced-motion` quando houver CSS motion;
- nao adicionar assets grandes sem justificativa;
- passar typecheck/build/testes relevantes;
- manter E2E principal estavel quando tocar fluxo visual importante.

## 20. Fora de escopo

Fica fora da V2.2 inicial:

- 3D;
- engine nova;
- redesign total;
- multiplayer/social;
- backend obrigatorio;
- sync como foco;
- schema/migration;
- importacao bancaria automatica;
- PDF/OFX;
- assets copiados;
- videos;
- shaders pesados;
- mapa grande;
- mundo como menu obrigatorio;
- mundo como fonte da verdade financeira;
- gamificacao que esconda ou distorca dados.

V3.0 so deve ser considerada se os prototipos V2.2 validarem que a direcao melhora a experiencia sem perder clareza financeira.

## 21. Riscos tecnicos, visuais e legais

### Riscos tecnicos

- bundle crescer demais;
- queda de performance mobile;
- cena Phaser ficar complexa demais;
- CSS virar um sistema visual informal dificil de manter;
- E2E quebrar por mudancas de layout;
- assets sem pipeline claro;
- animacoes afetarem acessibilidade.

Mitigacao:

- fases pequenas;
- asset budget por fase;
- testes de manifest;
- typecheck/build;
- E2E mobile pontual;
- manter fallback procedural;
- documentar cada novo asset.

### Riscos visuais

- app ficar bonito, mas menos legivel;
- cozy fantasy brigar com finance tech;
- mundo parecer infantil;
- UI parecer decorativa demais;
- excesso de glow/nevoa;
- perda da identidade local-first.

Mitigacao:

- React UI objetiva;
- paleta controlada;
- textos claros;
- revisao mobile;
- art direction antes de assets finais.

### Riscos legais

- aproximacao excessiva de uma referencia existente;
- silhuetas/personagens reconheciveis;
- simbolos ou composicoes similares;
- narrativa visual derivativa.

Mitigacao:

- usar apenas ambicao visual como referencia;
- criar vocabulario proprio: base financeira, diorama mensal, cofre local, mesa de revisao;
- revisar cada asset contra a lista de nao-copia;
- evitar elementos iconicos de jogos conhecidos.

