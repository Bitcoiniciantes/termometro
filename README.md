# Termômetro

Painel técnico gratuito, determinístico e sem IA para leitura de criptoativos.

## O que já funciona

- Candles reais de BTC, ETH, LINK, AVAX e SOL.
- Períodos de 1 hora, 4 horas, 1 dia e 1 semana.
- Cálculo local de MM20, MM50, RSI 14, volume relativo, ATR e compressão de preço.
- Nota explicável de -100 a +100 e confiança por concordância dos sinais.
- Radar personalizável salvo no navegador.
- MSTR aparece no radar, mas permanece sem cotação até existir uma fonte gratuita estável.

Os candles são consultados diretamente pelo navegador no endpoint público da Binance, sem chave de API. Essa arquitetura permite hospedar o piloto gratuitamente no GitHub Pages. A aplicação precisa de acesso à internet para atualizar as cotações.

## Rodar localmente

Requer Node.js 22.13 ou superior.

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

## Validar

```bash
npm test
```

## Aviso

Ferramenta educacional. As leituras não constituem recomendação de investimento.