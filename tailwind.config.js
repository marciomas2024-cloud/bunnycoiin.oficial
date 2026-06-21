# Bunnycoiin DeFi

Plataforma DeFi do token $BNC (Solana), com staking, swap e painel admin.

## Por que rodar fora do chat?

O preview de artifacts dentro do chat do Claude.ai bloqueia chamadas de rede
de saída (fetch para APIs externas) por segurança. Por isso, dentro do chat,
o preço aparecia como "indisponível" mesmo com o código correto — não era
um bug de lógica, era a sandbox do navegador ali dentro. Rodando este projeto
no seu próprio computador ou publicado num site real, o fetch funciona
normalmente e o preço (DexScreener ou bonding curve da pump.fun) é buscado
de verdade.

---

## Opção 1 — Testar no seu computador

Pré-requisito: ter o [Node.js](https://nodejs.org) instalado (versão 18 ou mais recente).

```bash
# 1. Entre na pasta do projeto
cd bunnycoiin-defi

# 2. Instale as dependências (só precisa fazer isso uma vez)
npm install

# 3. Inicie o servidor de desenvolvimento
npm run dev
```

Isso vai abrir automaticamente `http://localhost:5173` no seu navegador,
já com o fetch funcionando de verdade.

---

## Opção 2 — Publicar no Vercel (online, grátis)

### Passo a passo simples (sem usar terminal):

1. Crie uma conta gratuita em [vercel.com](https://vercel.com) (pode entrar com GitHub, GitLab ou e-mail)
2. Crie um repositório no GitHub e suba esta pasta inteira para lá
   (no GitHub: "New repository" → "uploading an existing file" → arraste todos os arquivos desta pasta)
3. No Vercel, clique em "Add New" → "Project" → selecione o repositório que você criou
4. O Vercel detecta automaticamente que é um projeto Vite — não precisa mudar nenhuma configuração
5. Clique em "Deploy"
6. Em ~1 minuto, você recebe um link público (ex: `bunnycoiin-defi.vercel.app`) já no ar

### Alternativa via terminal (se preferir):

```bash
npm install -g vercel
cd bunnycoiin-defi
vercel
```

Siga as perguntas no terminal (aceite as opções padrão) e ao final você
recebe a URL pública do site.

---

## Estrutura do projeto

```
bunnycoiin-defi/
├── index.html              # HTML raiz
├── package.json            # dependências (React, lucide-react, Tailwind)
├── vite.config.js          # configuração do Vite
├── tailwind.config.js      # configuração do Tailwind CSS
├── postcss.config.js       # necessário para o Tailwind funcionar
└── src/
    ├── main.jsx             # ponto de entrada do React
    ├── index.css            # estilos globais + diretivas Tailwind
    └── BunnycoiinDeFi.jsx   # o componente principal da plataforma
```

## Configurações importantes dentro do código

Abra `src/BunnycoiinDeFi.jsx` e procure por estas constantes no topo do arquivo:

- `SOLANA_ADDRESS` — endereço do token $BNC na Solana
- `ADMIN_PASSWORD` — senha do painel admin (atualmente `bunnycoiin2026`,
  **troque antes de divulgar publicamente**, pois fica visível no código)
- `STAKING_LIVE` — `false` enquanto o programa de staking on-chain não
  existir; vire `true` quando o contrato Anchor for deployado
- `BUNNYCOIIN_STAKING_IDL.programId` — preencher com o endereço real do
  programa de staking quando ele for publicado em mainnet
- `JUPITER_API_KEY` — já configurada com a chave fornecida. **Aviso de
  segurança:** como este é um front-end puro (sem servidor por trás), essa
  chave fica visível para qualquer pessoa que inspecionar o código da
  página no navegador. Para uma chave gratuita de uso leve, isso costuma
  ser aceitável; se o projeto crescer e você quiser proteger a chave de
  verdade, o caminho correto é criar um pequeno backend (ex: uma function
  serverless na Vercel) que repassa as chamadas à Jupiter sem expor a
  chave no JavaScript do cliente.

## Sobre o Swap (Jupiter Aggregator)

A aba "Swap" já está integrada de verdade com a [Jupiter API](https://dev.jup.ag),
o maior agregador de liquidez da Solana. O fluxo funciona assim:

1. Você digita o valor → a plataforma busca uma cotação real (`/swap/v1/quote`)
2. Ao confirmar, a Jupiter monta a transação (`/swap/v1/swap`)
3. A Phantom pede sua assinatura e envia a transação real à blockchain
4. Você recebe o link da transação no Solscan para conferir

**Importante:** enquanto o $BNC estiver na fase de bonding curve da
pump.fun (antes de "graduar" para um DEX como Raydium), é bem possível
que a Jupiter não encontre nenhuma rota de liquidez — isso é esperado e
normal, não é um bug. O swap via Jupiter só funciona depois que o token
tiver um par de liquidez real em algum DEX.

## Próximos passos sugeridos

- [ ] Testar localmente (`npm run dev`) e confirmar que o preço e as cotações aparecem corretamente
- [ ] Subir para o GitHub e publicar no Vercel
- [ ] Trocar a senha do admin antes de divulgar o link publicamente
- [ ] Acompanhar a contratação do dev Solana para o contrato de staking real
- [ ] Acompanhar a graduação do $BNC na pump.fun para o swap via Jupiter passar a encontrar rota
- [ ] Se o projeto crescer, considerar mover a chave da Jupiter para um backend (não exposta no front-end)
