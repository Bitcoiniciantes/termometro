# Checklist — Alterações nos projetos

Última atualização: 04/09/2026

## Projeto Termômetro (repo `Bitcoiniciantes/termometro`, Next.js, `app/`)

| # | O que foi feito | Onde | Commit |
|---|-----------------|------|--------|
| 1 | Contador de acessos (GoatCounter, "N Cervas") agora **visível no mobile**: o `<span data-goatcounter-total>` foi movido para **fora do `<p>`** do footer (o `footer p` é ocultado em telas ≤850px). Ajuste de estilo para cor muted (sem herdar o bold branco do logo). | `app/page.tsx` (footer), `app/globals.css` | `013c308` |
| 2 | Fonte dos itens do ticker de stocks 24h **~10% maior** (desktop e mobile). | `app/globals.css` | `54aaed7` |
| 3 | Ticker de stocks 24h roda também em dispositivos com `prefers-reduced-motion`. | `app/globals.css` / componente ticker | `6f621d9` |
| 4 | Barra de tickers de stocks 24h **clicável** acima do radar + ajuste no botão de IA. | `app/page.tsx`, `app/globals.css` | `988be00` |
| 5 | Busca de ações/ETFs com **fallback ao worker de candles** quando o par não tem cotação direta. | lib/hooks de dados | `c5b06b1` |
| 6 | Removida a frase "Viés comparativo" do radar. | `app/page.tsx` | `669b224` |
| 7 | Removida palavra solta + **NUPL atualiza automaticamente a cada 10 min**. | `app/page.tsx` | `53916e3` |
| 8 | Widget NUPL: retângulos com faixas iguais e ponteiro na fase correta. | componente NUPL | `55b6795` |
| 9 | Indicador predominante NUPL acima das barras. | componente NUPL | `530e0aa` |
| 10 | Simplificação da barra NUPL (removidos toggle e régua; cores equalizadas). | componente NUPL | `7468425`, `3d73971` |
| 11 | Escala NUPL (1 a 0; 0 no centro do Medo; negativos no desespero; ajustes de -1..1). | componente NUPL | `3b8f4a`, `9fc9df6`, `d4786e6` |
| 12 | Fonte preta nos segmentos NUPL + ponteiro na cor da fase. | componente NUPL | `8575b7b` |
| 13 | Painel **NEXUS** clonado do preditivo (somente NEXUS, sem Confluência): `app/ConfluencePanel.tsx` + `lib/confluence.ts` + `app/nexus.css` idênticos; tipos `FlowReading`/`ConfluenceRow`/`ConfluenceReading` e `Candle.takerBuyVolume` em `lib/types.ts`; `parseCandles` lendo `row[9]` (sem isso o fluxo agressor cai em modo parcial); wiring mínimo em `app/page.tsx` + `import nexus.css` no layout. Sem daemon, sem `MarketStreamProvider`. | `app/ConfluencePanel.tsx`, `lib/confluence.ts`, `app/nexus.css`, `lib/types.ts`, `lib/api.ts`, `app/page.tsx`, `app/layout.tsx` | `2df1ca9` |
| 14 | **Fita de ativos em pílula abaixo do gráfico** (modelo do preditivo): `AssetStrip` com os ativos dos cards + variação 24h (`quickChanges` via Binance `ticker/24hr`, fallback worker p/ PRATA/COBRE/URANIO via `marketSymbols`); clique abre o ativo no gráfico (`selectAsset`); CSS `chartRadar`/`quickAsset` (cores iguais, nada muda). | `app/page.tsx`, `lib/config.ts`, `app/globals.css` | `2df1ca9` |
| 15 | Atalho do menu **Painel → Gráfico** (`#grafico`, igual ao preditivo) + `id="grafico"` no article do gráfico + `scroll-margin-top:34px` (valor exato do preditivo) + altura reservada nos comparadores de período (`.mobile/desktopPeriodComparison`) para o **gráfico ficar paradinho** na troca de ativo (sem rolagem forçada). | `app/page.tsx`, `app/globals.css` | `9e33784` |
| 16 | **Período padrão em 15M** (antes 1H). Vale para gráfico + análise (mesmo estado, igual ao preditivo). | `app/page.tsx` | `b548e86` |
| 17 | **NUPL voltou ao gráfico do BTC**: `NUPL_URL` apontada para `https://estudebitcoin.pages.dev/dados/nupl.json` (a antiga `bitcoiniciantes.github.io/...` retorna 404 e a barra vinha vazia). Componente, lib e CSS já eram idênticos ao preditivo. | `lib/api.ts` | `b548e86` |

### Próximos passos / pendências
- Nenhuma pendência aberta neste repo.

---

## Projeto Estude ( `EstudeBitcoinOficial/`, site estático, Pages, repo `Bitcoiniciants/estudebitcoin`)

| # | O que foi feito | Onde | Commit |
|---|-----------------|------|--------|
| 1 | Seção "ANÁLISE EDUCATIVA / Analista Digital" (`.ai-analyst`) **pintada na cor azul do botão "Análise com IA"** (`#9cc2ff` texto, `#6ea0ff`, `#4f8cff`, bordas azuis). | `index.html` (bloco CSS final) | `36f72b2` |
| 2 | Correção do **bug de notícias**: SOL, POL, NVDA, AMD, TSLA e quase todas as stocks retornavam `[]`. Causas: feed CriptoFácil paralisado (itens de abr/2026), CNBC bloqueando datacenter (403), Google News inacessível do Cloudflare e feeds gerais sem títulos relevantes. Correções no worker: | `cloudflare/bitcoiniciants-ia/src/index.js` | `ee1e8d3` |
|    | - Fallback **Bing News RSS** para todos os ativos (novo mapa `BING_QUERIES`). | idem | `ee1e8d3` |
|    | - Feeds vivos adicionados: **beincrypto** e **ambcrypto**. | idem | `ee1e8d3` |
|    | - Relevância agora checa título **ou** description (antes só título). | idem | `ee1e8d3` |
|    | - Removido CNBC (bloqueado 403) das `NICHE_SOURCES` de ações. | `NEWS_QUERIES`/`NEWS_PATTERNS` | `ee1e8d3` |
|    | - SOL, POL e stocks adicionados a `NEWS_TAGS`/`NEWS_QUERIES`/`NEWS_PATTERNS`/`BING_QUERIES`/`NICHE_SOURCES`. | `NEWS_TAGS`/`BING_QUERIES`/`NICHE_SOURCES` | `ee1e8d3` |
| 3 | Correção adicional no workflow de notícias: **Google News** (PT+EN) com `when:7d` e timeout ampliado; cache com TTL. | idem | `ee1e8d3` (patch anterior f84af34) |
| 4 | Deploys do worker: múltiplos; último version ID `708dad45-ee0a-4b8d-bd73-9b40a09e9e0e`. | Cloudflare | — |
| 5 | Workers atualizados no passado: conversor (15M antes de 1H, preço ao vivo, eixo+crosshair no ticker), dados NUPL/costbasis/ETF/DCA/Strategy via workflows. | vários commits | `a9f6b54`..`2b41d2c` e anteriores |

### Próximos passos / pendências
- **POL** segue retornando `[]` — não há notícias relevantes nos últimos 7 dias (a mais nova é de 16/07/2026). Escassez real de dados, não é bug. Revisitar quando houver cobertura nova.

## Deploys / infra
- Worker Cloudflare: `bitcoiniciants-ia` → `https://bitcoiniciants-ia.bitcoiniciants.workers.dev`
  - Endpoints: `/api/asset-news?asset=X`, `/api/quote?asset=X`, `/api/quotes`, `/api/candles`, `/api/ai-analysis`, `/v1/analyze`
- Publish Estude: GitHub Pages (legacy), atualiza em ~1-2 min após push.
- Publish Termômetro: Next.js static export + GitHub Pages.

## Observações técnicas
- Repos/git separados: Termômetro (`termometro`) e Estude (`estudebitcoin`).
- Resultado final das correções de notícias verificado via endpoint real: SOL/NVDA/AMD/TSLA/LINK=3 itens; **BTC/PAXG/PRATA/MSTR/AVAX** intactos; POL vazio por escassez.