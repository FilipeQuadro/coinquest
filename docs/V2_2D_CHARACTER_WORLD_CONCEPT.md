# V2.2D - Conceito de personagem e objetos da base

Conceito original para a fase V2.2D do roadmap em `CINEMATIC_COZY_ART_DIRECTION.md`.
Objetivo: dar ao mundo uma identidade propria e acolhedora sem perder a leitura tech/financeira e sem copiar nenhum jogo.

## Ideia central

A base e uma sala de revisao mensal. Quem mora nela e a **pessoa guardia da base**: alguem que cuida das proprias financas com calma, de cachecol, cha na mesa e livros-caixa na parede. O mundo deve parecer um lugar para *voltar*, nao um painel de alerta.

Vocabulario visual: cachecol dourado, tricot, livros-caixa, quadro do mes, cofre-lanterna, plantas. O dourado continua sendo a cor do "valor"; ciano continua sendo a cor do "tech".

## Personagem: pessoa guardia da base

- Genero neutro; nao tem nome fixo na interface.
- Silhueta reconhecivel por tres elementos: **coque no alto da cabeca**, **cachecol mostarda com ponta caida a direita** e **jaqueta tech de tricot verde-azulada** (ombros arredondados).
- Oculos redondos com brilho ciano substituem o visor reto antigo.
- Headset discreto em uma orelha, com microfone curto (requisito do Art Bible).
- Broche de moeda dourada na jaqueta: unico simbolo "CoinQuest" no corpo.
- Tenis creme com sola ciano; calca grafite.
- Expressoes simples: piscada no idle, sorriso no income, gota de suor e mao na cabeca no expense. Nada de expressao de panico ou culpa.

Paleta do personagem (14 cores + transparencia):

| Uso | Cor |
| --- | --- |
| Contorno | `#0E1424` |
| Pele luz / base / sombra | `#F0B78A` / `#D79C73` / `#A86C55` |
| Cabelo escuro / medio / brilho | `#24160F` / `#3E2820` / `#5E3D2B` |
| Jaqueta sombra / base / luz | `#1C4F57` / `#2B7A80` / `#3E9A9C` |
| Cachecol sombra / base / luz | `#B4832F` / `#E2B54A` / `#F6D57E` |
| Calca / tenis / sola | `#2A2D3A` / `#E9DFC8` / `#42D9F4` |

Contrato tecnico mantido: sprite sheet 48x64, 28 quadros na mesma ordem (idle 0-3, typing 4-9, income 10-15, expense 16-19, walk 20-27).

## Cofre local: cofre-lanterna

- Cofre baixo e robusto, corpo azul-marinho com **moldura de latao** e rebites.
- **Porta redonda** com aro de latao: o anel procedural de saude financeira encaixa exatamente nela.
- **Alca de lanterna** no topo, onde fica a luz de status. Le como "guardado e aceso", nao como caixa-forte bancaria.
- Duas dobradicas a esquerda, pes curtos, visor inferior para os pixels de estado.
- Contrato tecnico mantido: 120x108, anel em (60,47), nucleo 54x40 em (60,47), visor em (60,83). Estados continuam como overlays procedurais.

## Objetos da base (diorama)

Pequenos, baratos e originais; nenhum objeto exibe dado financeiro.

| Asset | Tamanho | Onde | Papel |
| --- | --- | --- | --- |
| `furniture/plant-pot.png` | 32x44 | canto esquerdo do chao | aconchego, vida |
| `furniture/ledger-shelf.png` | 96x52 | parede esquerda | livros-caixa e pote de moedas: memoria do mes |
| `furniture/desk-mug.png` | 14x16 | mesa, ao lado do teclado | pausa; vapor procedural |
| `tech/month-board.png` | 64x48 | parede direita | quadro do mes com notas e alfinetes (sem numeros) |

## Regras

- Phaser so desenha; nenhum objeto calcula ou mostra valores.
- Todos os assets tem fallback procedural e entram no manifest com teste de dimensao.
- Gerados por `scripts/generate-cozy-base-pack.mjs` (pixel a pixel, sem dependencias), entao podem ser ajustados e regenerados.
- Lista de nao-copia: sem picaretas, espadas, blocos de terreno, moedas no formato de jogos conhecidos, slimes ou silhuetas iconicas.
