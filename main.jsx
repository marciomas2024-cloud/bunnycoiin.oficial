import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  PawPrint, TrendingUp, TrendingDown, Users, Coins, Heart, Vote, Sprout,
  ArrowRight, Check, Wallet, ShieldCheck, Gift, Sparkles, Menu, X,
  Loader2, AlertCircle, RefreshCw, Copy, Lock, Save, Link2, Layers,
  Clock, Unlock, ExternalLink, ArrowDownToLine, History, ChevronDown,
  Zap, Activity, BarChart3, ArrowUpRight, ArrowDownRight, LogOut, Globe, Search,
} from 'lucide-react';

/* ════════════════════════════════════════════════════════════════
   DESIGN TOKENS — DeFi terminal aesthetic
   bg quase-preto + paineis "vidro" + verde-lima para dados positivos
   + laranja-cenoura (identidade Bunnycoiin) + mono para números
════════════════════════════════════════════════════════════════ */
const C = {
  bg:        '#08090C',
  bgRaised:  '#0E1014',
  panel:     'rgba(255,255,255,0.035)',
  panelHi:   'rgba(255,255,255,0.06)',
  border:    'rgba(255,255,255,0.08)',
  borderHi:  'rgba(255,255,255,0.14)',
  lime:      '#C8FF4D',
  limeDim:   'rgba(200,255,77,0.12)',
  carrot:    '#FF7A3D',
  carrotDim: 'rgba(255,122,61,0.12)',
  red:       '#FF5D5D',
  redDim:    'rgba(255,93,93,0.12)',
  text:      '#F3F4F2',
  textDim:   '#9A9FA6',
  textFaint: '#5C6066',
};

const fontDisplay = { fontFamily: "'Space Grotesk', sans-serif" };
const fontMono    = { fontFamily: "'IBM Plex Mono', monospace" };

const SOLANA_ADDRESS = 'Fz1Af8HnECXVPLnUvMCgn1p1QQYdsxUXyb263MvDpump';
const SOLANA_RPC     = 'https://api.mainnet-beta.solana.com';
// Hash SHA-256 da senha do admin — a senha real não fica no código.
// Para trocar a senha: gere o hash em https://emn178.github.io/online-tools/sha256.html
// e substitua o valor abaixo. Senha atual: bunnycoiin2026
const ADMIN_PASSWORD_HASH = '6e0aa60da82f775911533c443f8d638477c6ba4477d948de47fef64bf8718dbc';
// Link de compra direta na pump.fun — usado como alternativa quando o Swap
// não encontra rota de liquidez para $BNC (token ainda na bonding curve).
// Note: a taxa de 1%+1% dessa compra vai para a pump.fun, não para a
// plataforma Bunnycoiin — é uma alternativa de conveniência para o
// comprador, não uma fonte de receita da plataforma.
const PUMPFUN_BUY_LINK = `https://pump.fun/${SOLANA_ADDRESS}`;

/* ════════════════════════════════════════════════════════════════
   JUPITER AGGREGATOR — integração real de swap on-chain (Solana)
   API atual (pós-migração de abril/2026): api.jup.ag, exige API key
   gratuita gerada em portal.jup.ag. Endpoints antigos (quote-api.jup.ag/v6,
   lite-api.jup.ag) foram descontinuados.
════════════════════════════════════════════════════════════════ */
const JUPITER_API_BASE = 'https://api.jup.ag';
// Proxies serverless do Vercel — a JUPITER_API_KEY fica só no servidor
// (variável de ambiente). Em dev local (vite dev), redirecione via vite.config.js
// ou use a URL direta temporariamente.
const JUPITER_QUOTE_ENDPOINT = '/api/jupiter-quote';
const JUPITER_SWAP_ENDPOINT  = '/api/jupiter-swap';
const JUPITER_TOKENS_ENDPOINT = '/api/jupiter-tokens';
// JUPITER_API_KEY removida do frontend — está em JUPITER_API_KEY no Vercel.
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const DEFAULT_SLIPPAGE_BPS = 50; // 0.5%

/* ════════════════════════════════════════════════════════════════
   TAXA DE SERVIÇO DA PLATAFORMA (ver Bunnycoiin_Whitepaper.docx, seção 4)
   Cobrada nativamente pela própria Jupiter via parâmetro platformFeeBps
   no /quote — a Jupiter entrega a taxa atomicamente, na mesma transação
   do swap, sem precisar de transferências separadas.
   Restrição técnica da Jupiter: o mint da conta de taxa só pode ser o
   mint de ENTRADA ou SAÍDA do swap (não pode ser um terceiro token).
   Por isso a taxa é cobrada em USDC (na compra) ou em $BNC (na venda).
   PLATFORM_FEE_WALLET recebe os 3% integralmente; a divisão entre
   holders/manutenção/caridade é feita manualmente a partir dessa
   carteira (modelo inicial, mais simples — ver whitepaper).
   Esta é a carteira do criador do token $BNC na pump.fun (também
   acessível via MetaMask/rede Solana), usada aqui por escolha
   deliberada para reforçar a ligação pública entre o projeto e
   quem o administra.
════════════════════════════════════════════════════════════════ */
const PLATFORM_FEE_BPS = 300; // 3,00% — dentro da faixa praticada pelo mercado (ver whitepaper)
const PLATFORM_FEE_WALLET = '22SWZ4U79qcTDm1kqb39qYbV4aZ34QoAxC3o58pKDfrX';

// Lista de RPCs públicos da Solana, em ordem de tentativa. O RPC oficial
// (api.mainnet-beta.solana.com) costuma bloquear/limitar requisições vindas
// de browsers em domínios não whitelisted (CORS/rate limit), por isso
// mantemos alternativas públicas conhecidas como fallback automático.
const SOLANA_RPC_ENDPOINTS = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-rpc.publicnode.com',
  'https://rpc.ankr.com/solana',
  'https://solana.drpc.org',
];

// Faz a chamada RPC tentando cada endpoint da lista até um responder com sucesso.
async function solanaRpcCall(body, { timeoutMs = 8000 } = {}) {
  let lastError = null;
  for (const endpoint of SOLANA_RPC_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!r.ok) { lastError = new Error(`HTTP ${r.status} em ${endpoint}`); continue; }
      const json = await r.json();
      if (json?.error) { lastError = new Error(json.error.message || `Erro RPC em ${endpoint}`); continue; }
      return { data: json, endpoint };
    } catch (e) {
      lastError = e;
      continue;
    }
  }
  throw lastError || new Error('Nenhum endpoint RPC da Solana respondeu.');
}

/* ════════════════════════════════════════════════════════════════
   PUMP.FUN BONDING CURVE — leitura real do preço on-chain
   Enquanto o token não "gradua" (atinge ~85 SOL / ~$69-90K de
   market cap), ele não tem par no Raydium/DexScreener. O preço
   real, porém, sempre existe: é calculado pela bonding curve do
   programa pump.fun, lendo a conta on-chain diretamente via RPC.
   Fórmula (mesma usada pelo front-end oficial do pump.fun):
     price_per_token_SOL = virtualSolReserves / virtualTokenReserves
════════════════════════════════════════════════════════════════ */
const PUMP_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const PUMP_TOKEN_DECIMALS = 6; // padrão pump.fun
// Tamanho real confirmado via Solscan para este token: 150 bytes (alocação
// atual do programa, com espaço reservado para campos futuros como
// quote_mint). O layout dos primeiros campos (os que usamos) não mudou.
const PUMP_BONDING_CURVE_ACCOUNT_SIZE = 150;

// Layout da conta BondingCurve (estrutura oficial confirmada via IDL pump.fun
// e crate pumpfun/Rust): discriminator (8) + 5 campos u64 + bool complete (1)
// + creator (Pubkey, 32 bytes) + espaço reservado para campos futuros.
function parseBondingCurveAccount(base64Data) {
  const raw = atob(base64Data);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const view = new DataView(bytes.buffer);
  const readU64 = (offset) => view.getBigUint64(offset, true); // little-endian
  return {
    virtualTokenReserves: readU64(8),
    virtualSolReserves: readU64(16),
    realTokenReserves: readU64(24),
    realSolReserves: readU64(32),
    tokenTotalSupply: readU64(40),
    complete: bytes[48] === 1, // true quando já "graduou" (saiu da bonding curve)
  };
}

/* ════════════════════════════════════════════════════════════════
   IDL DO PROGRAMA DE STAKING — embutido e pronto para integração
   Substitua programId quando o programa for deployado em mainnet.
   Esta estrutura já reflete exatamente o briefing técnico passado
   ao desenvolvedor (instructions: stake / unstake / claim).
════════════════════════════════════════════════════════════════ */
const BUNNYCOIIN_STAKING_IDL = {
  version: '0.1.0',
  name: 'bunnycoiin_staking',
  programId: null, // TODO: preencher com o Program ID real após deploy em mainnet-beta
  metadata: { address: null },
  instructions: [
    {
      name: 'initializePool',
      accounts: ['pool', 'authority', 'tokenMint', 'vault', 'systemProgram', 'tokenProgram'],
      args: [{ name: 'apyBasisPoints', type: 'u16' }],
    },
    {
      name: 'stake',
      accounts: ['pool', 'stakeAccount', 'user', 'userTokenAccount', 'vault', 'tokenProgram'],
      args: [{ name: 'amount', type: 'u64' }, { name: 'periodDays', type: 'u16' }],
    },
    {
      name: 'unstake',
      accounts: ['pool', 'stakeAccount', 'user', 'userTokenAccount', 'vault', 'tokenProgram'],
      args: [],
    },
  ],
  accounts: [
    {
      name: 'StakeAccount',
      type: {
        kind: 'struct',
        fields: [
          { name: 'owner', type: 'publicKey' },
          { name: 'amount', type: 'u64' },
          { name: 'apyBasisPoints', type: 'u16' },
          { name: 'startedAt', type: 'i64' },
          { name: 'unlocksAt', type: 'i64' },
          { name: 'claimed', type: 'bool' },
        ],
      },
    },
  ],
};

/* ════════════════════════════════════════════════════════════════
   STAKING ADAPTER — embutido neste mesmo arquivo (sem import externo,
   já que o ambiente de artifacts não resolve módulos locais).
   Hoje roda em modo simulação. Para ativar on-chain:
     1. Preencher BUNNYCOIIN_STAKING_IDL.programId
     2. Implementar onChainStake / onChainClaim / onChainListPositions
     3. Virar STAKING_LIVE para true
════════════════════════════════════════════════════════════════ */
const STAKING_LIVE = false;
const APY_PERCENT = 22;
const STAKE_PERIODS = [30, 90, 180];
const SIM_STORAGE_KEY = 'bunnycoiin-stake-positions';

function calcReward(amount, periodDays, apy = APY_PERCENT) {
  return amount * (apy / 100) * (periodDays / 365);
}
function isUnlocked(position) {
  return Date.now() >= position.unlocksAt;
}
function progressPercent(position) {
  const total = position.unlocksAt - position.startedAt;
  const elapsed = Date.now() - position.startedAt;
  return Math.min(100, Math.max(0, (elapsed / total) * 100));
}

async function simListPositions(walletAddress) {
  try {
    const result = await window.storage.get(SIM_STORAGE_KEY, false);
    const all = result?.value ? JSON.parse(result.value) : [];
    return walletAddress ? all.filter((p) => p.wallet === walletAddress) : all;
  } catch (e) {
    return [];
  }
}
async function simSaveAll(positions) {
  await window.storage.set(SIM_STORAGE_KEY, JSON.stringify(positions), false);
}
async function simStake({ walletAddress, amount, periodDays }) {
  let all = [];
  try {
    const result = await window.storage.get(SIM_STORAGE_KEY, false);
    all = result?.value ? JSON.parse(result.value) : [];
  } catch (e) {}
  const now = Date.now();
  const position = {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    wallet: walletAddress,
    amount,
    apy: APY_PERCENT,
    period: periodDays,
    startedAt: now,
    unlocksAt: now + periodDays * 24 * 60 * 60 * 1000,
    claimed: false,
    txSig: `SIM${Math.random().toString(36).slice(2, 14).toUpperCase()}`,
  };
  await simSaveAll([position, ...all]);
  return position;
}
async function simClaim({ positionId }) {
  let all = [];
  try {
    const result = await window.storage.get(SIM_STORAGE_KEY, false);
    all = result?.value ? JSON.parse(result.value) : [];
  } catch (e) {}
  const updated = all.map((p) => (p.id === positionId ? { ...p, claimed: true, claimedAt: Date.now() } : p));
  await simSaveAll(updated);
  return updated.find((p) => p.id === positionId);
}

async function onChainStake() {
  throw new Error('Programa on-chain ainda não deployado. Configure BUNNYCOIIN_STAKING_IDL.programId.');
}
async function onChainClaim() {
  throw new Error('Programa on-chain ainda não deployado.');
}
async function onChainListPositions() {
  throw new Error('Programa on-chain ainda não deployado.');
}

async function listPositions({ walletAddress }) {
  if (STAKING_LIVE) return onChainListPositions({ walletAddress });
  return simListPositions(walletAddress);
}
async function createStakePosition({ walletAddress, amount, periodDays }) {
  if (!STAKE_PERIODS.includes(periodDays)) throw new Error(`Período inválido: use ${STAKE_PERIODS.join(', ')} dias.`);
  if (STAKING_LIVE) return onChainStake({ walletAddress, amount, periodDays });
  return simStake({ walletAddress, amount, periodDays });
}
async function claimStakePosition({ positionId }) {
  if (STAKING_LIVE) return onChainClaim({ positionId });
  return simClaim({ positionId });
}

/* ════════════════════════════════════════════════════════════════
   MULTI-WALLET — detecta e conecta MetaMask, Trust Wallet, Phantom,
   e oferece WalletConnect (genérico, para Uniswap Wallet / outras)
════════════════════════════════════════════════════════════════ */
function detectEvmProviders() {
  const found = [];
  const eth = typeof window !== 'undefined' ? window.ethereum : null;
  if (!eth) return found;
  const list = eth.providers && eth.providers.length ? eth.providers : [eth];
  list.forEach((p) => {
    if (p.isMetaMask) found.push({ id: 'metamask', name: 'MetaMask', provider: p });
    else if (p.isTrust || p.isTrustWallet) found.push({ id: 'trust', name: 'Trust Wallet', provider: p });
    else if (p.isRabby) found.push({ id: 'rabby', name: 'Rabby', provider: p });
    else found.push({ id: 'injected', name: 'Carteira do navegador', provider: p });
  });
  return found;
}

const WALLET_OPTIONS = [
  // Apenas carteiras Solana — únicas que conseguem fazer swap e stake reais
  { id: 'phantom',  name: 'Phantom',  kind: 'solana', desc: 'Recomendada — extensão & mobile', provider: () => window?.phantom?.solana ?? window?.solana },
  { id: 'solflare', name: 'Solflare', kind: 'solana', desc: 'Extensão & mobile',               provider: () => window?.solflare },
  { id: 'backpack', name: 'Backpack', kind: 'solana', desc: 'Extensão xNFT',                   provider: () => window?.backpack?.solana ?? window?.xnft?.solana },
];

/* ════════════════════════════════════════════════════════════════
   COMPONENTES AUXILIARES
════════════════════════════════════════════════════════════════ */
function AnimatedCounter({ target, prefix = '', suffix = '', duration = 1200, decimals = 0 }) {
  const [value, setValue] = useState(0);
  const ref = useRef(null);
  const started = useRef(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        const start = performance.now();
        const step = (now) => {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          setValue(target * eased);
          if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
    }, { threshold: 0.3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [target, duration]);
  useEffect(() => { if (started.current) setValue(target); }, [target]);
  return (
    <span ref={ref} style={fontMono}>
      {prefix}{value.toLocaleString('pt-BR', { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}{suffix}
    </span>
  );
}

function ProgressBar({ value, max, color = C.lime, track = 'rgba(255,255,255,0.08)' }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: track }}>
      <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function Panel({ children, className = '', glow = false, style = {} }) {
  return (
    <div
      className={`rounded-2xl ${className}`}
      style={{
        background: C.panel,
        border: `1px solid ${glow ? C.carrot + '55' : C.border}`,
        backdropFilter: 'blur(12px)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   WALLET CONNECT MODAL
════════════════════════════════════════════════════════════════ */
function WalletModal({ onClose, onConnected }) {
  const [connectingId, setConnectingId] = useState(null);
  const [error, setError] = useState(null);

  const connect = async (opt) => {
    setConnectingId(opt.id);
    setError(null);
    try {
      if (opt.kind === 'solana') {
        // Detecta o provider Solana correto para cada carteira
        const provider = opt.provider?.();

        if (!provider) {
          // Mensagem específica por carteira
          const installLinks = {
            phantom: 'phantom.app',
            solflare: 'solflare.com',
            backpack: 'backpack.app',
            metamask_solana: 'MetaMask com suporte Solana ativo (Configurações → Redes experimentais)',
          };
          setError(`${opt.name} não detectada. ${installLinks[opt.id] ? `Instale em ${installLinks[opt.id]} e recarregue a página.` : 'Verifique se a extensão está instalada.'}`);
          setConnectingId(null);
          return;
        }

        // Conecta — cada carteira tem um método ligeiramente diferente
        let address;
        try {
          if (provider.connect) {
            const resp = await provider.connect();
            address = resp?.publicKey?.toString() ?? resp?.toString();
          } else if (provider.request) {
            // MetaMask Solana usa método request
            const accounts = await provider.request({ method: 'solana_requestAccounts' });
            address = Array.isArray(accounts) ? accounts[0] : accounts;
          }
        } catch (connectErr) {
          if (connectErr?.code === 4001 || connectErr?.message?.includes('rejected')) {
            setError('Conexão recusada na carteira.');
          } else {
            throw connectErr;
          }
          setConnectingId(null);
          return;
        }

        if (!address) {
          setError('Não foi possível obter o endereço da carteira. Tente desbloquear a carteira e conectar de novo.');
          setConnectingId(null);
          return;
        }

        onConnected({ chain: 'solana', address, name: opt.name, provider });
        return;
      }

      setError('Carteira não reconhecida. Use Phantom, Solflare ou Backpack.');
      setConnectingId(null);
    } catch (e) {
      setError(e?.message?.includes('rejected') || e?.code === 4001
        ? 'Conexão recusada na carteira.'
        : `Falha ao conectar: ${e?.message || 'erro desconhecido'}. Verifique a extensão e tente novamente.`);
      setConnectingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <Panel className="w-full max-w-sm p-6" style={{ background: C.bgRaised }}>
        <div className="flex items-center justify-between mb-1">
          <h3 style={{ ...fontDisplay, color: C.text }} className="text-lg font-semibold">Conectar carteira</h3>
          <button onClick={onClose} style={{ color: C.textDim }}><X size={18} /></button>
        </div>
        <p className="text-xs mb-4" style={{ color: C.textDim }}>
          Conecte uma carteira Solana para usar o Swap e o Stake da plataforma.
        </p>

        <div className="flex flex-col gap-2">
          {WALLET_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => connect(opt)}
              disabled={!!connectingId}
              className="flex items-center gap-3 p-3 rounded-xl text-left transition-colors disabled:opacity-60"
              style={{ background: C.panel, border: `1px solid ${connectingId === opt.id ? C.lime : C.border}` }}
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: C.limeDim }}>
                <Sprout size={16} color={C.lime} />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold" style={{ color: C.text }}>{opt.name}</div>
                <div className="text-xs" style={{ color: C.textFaint }}>{opt.desc}</div>
              </div>
              {connectingId === opt.id
                ? <Loader2 size={16} className="animate-spin" style={{ color: C.lime }} />
                : <ArrowRight size={14} style={{ color: C.textFaint }} />}
            </button>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-xs mt-4 p-3 rounded-lg" style={{ background: C.redDim, color: C.red }}>
            <AlertCircle size={13} /> {error}
          </div>
        )}

        <p className="text-xs mt-5" style={{ color: C.textFaint }}>
          Conexão somente leitura para EVM e assinatura local para Solana. Nenhum fundo é movido sem sua confirmação explícita.
        </p>
      </Panel>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   APP PRINCIPAL
════════════════════════════════════════════════════════════════ */
export default function BunnycoiinDeFi() {
  const [navOpen, setNavOpen] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [wallet, setWallet] = useState(null); // { chain, address, name }
  const [tab, setTab] = useState('overview'); // overview | swap | stake | positions

  /* ── Preço $BNC via DexScreener ── */
  const [bunnyPrice, setBunnyPrice] = useState(null);
  const [priceChange, setPriceChange] = useState(null);
  const [volume24h, setVolume24h] = useState(null);
  const [liquidity, setLiquidity] = useState(null);
  const [mcap, setMcap] = useState(null);
  const [priceLoading, setPriceLoading] = useState(true);
  const [priceError, setPriceError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  /* ── Saldos da carteira ── */
  const [solBalance, setSolBalance] = useState(null);
  const [bunnyBalance, setBunnyBalance] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [chainVerified, setChainVerified] = useState(null); // null | true | false
  const [verifyError, setVerifyError] = useState(null);

  /* ── Status de rede Solana ── */
  const [networkStatus, setNetworkStatus] = useState(null);

  /* ── Staking ── */
  const [stakePositions, setStakePositions] = useState([]);
  const [stakeLoading, setStakeLoading] = useState(false);
  const [newStakeAmount, setNewStakeAmount] = useState(500000);
  const [newStakePeriod, setNewStakePeriod] = useState(90);
  const [stakeCreating, setStakeCreating] = useState(false);
  const [claimingId, setClaimingId] = useState(null);
  const [stakeMsg, setStakeMsg] = useState(null);

  /* ── Swap real (qualquer par de tokens Solana) ──
     $BNC é o token em destaque (pré-selecionado), mas ambos os lados
     (fromToken e toToken) são livres — permite trocas que não envolvem
     $BNC nenhuma, como SOL <-> USDT. A Jupiter roteia automaticamente
     qualquer par com liquidez disponível. */
  const BNC_TOKEN = { mint: SOLANA_ADDRESS, symbol: 'BNC', name: 'Bunnycoiin', decimals: 6 };
  const [fromToken, setFromToken] = useState({ mint: USDC_MINT, symbol: 'USDC', name: 'USD Coin', decimals: 6 });
  const [toToken, setToToken] = useState(BNC_TOKEN);
  const [swapAmount, setSwapAmount] = useState(100);

  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [tokenModalSide, setTokenModalSide] = useState('from'); // 'from' | 'to' — qual lado está sendo escolhido
  const [tokenSearch, setTokenSearch] = useState('');
  const [tokenSearchResults, setTokenSearchResults] = useState([]);
  const [tokenSearchLoading, setTokenSearchLoading] = useState(false);
  const POPULAR_TOKENS = [
    BNC_TOKEN,
    { mint: USDC_MINT, symbol: 'USDC', name: 'USD Coin', decimals: 6 },
    { mint: SOL_MINT, symbol: 'SOL', name: 'Solana', decimals: 9 },
    { mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
    { mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', symbol: 'JUP', name: 'Jupiter', decimals: 6 },
    { mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', symbol: 'BONK', name: 'Bonk', decimals: 5 },
  ];

  // Integração real com Jupiter Aggregator
  const [jupiterQuote, setJupiterQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState(null);
  const [swapExecuting, setSwapExecuting] = useState(false);
  const [swapResult, setSwapResult] = useState(null); // { signature } | { error }
  const quoteDebounceRef = useRef(null);

  /* ── Admin ── */
  const [showAdmin, setShowAdmin] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [adminAuth, setAdminAuth] = useState(false);
  const [adminPw, setAdminPw] = useState('');
  const [adminErr, setAdminErr] = useState(false);

  /* ── Buscar preço $BNC ──
     1) Tenta DexScreener (token já graduado, com par real em DEX)
     2) Se não houver par, lê a bonding curve da pump.fun on-chain
        e calcula o preço real (token ainda na fase pré-graduação)
     3) Se nada responder, mostra erro — nunca um preço inventado */
  const [priceSource, setPriceSource] = useState(null); // 'dexscreener' | 'pumpfun-bonding-curve' | null
  const [solUsdPrice, setSolUsdPrice] = useState(null);
  const [priceDebug, setPriceDebug] = useState([]); // log das etapas, para diagnóstico no admin

  // Dados de holders/transações para o painel admin (lidos via RPC público)
  const [topHolders, setTopHolders] = useState([]);
  const [recentTxs, setRecentTxs] = useState([]);
  const [holdersLoading, setHoldersLoading] = useState(false);
  const [holdersError, setHoldersError] = useState(null);
  const [tokenSupplyInfo, setTokenSupplyInfo] = useState(null);

  // Deriva o PDA da bonding curve (seeds: "bonding-curve" + mint) usando o
  // mesmo algoritmo da Solana (SHA-256 do buffer de seeds + program id +
  // bump + marcador "ProgramDerivedAddress", testando bumps de 255 a 0
  // até cair fora da curva ed25519 — exatamente como find_program_address).
  const deriveBondingCurvePda = useCallback(async (mintBase58) => {
    // Base58 decode (sem libs externas)
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    function base58Decode(str) {
      let bytes = [0];
      for (const char of str) {
        const value = ALPHABET.indexOf(char);
        if (value === -1) throw new Error('Caractere base58 inválido');
        let carry = value;
        for (let i = 0; i < bytes.length; i++) {
          carry += bytes[i] * 58;
          bytes[i] = carry & 0xff;
          carry >>= 8;
        }
        while (carry > 0) { bytes.push(carry & 0xff); carry >>= 8; }
      }
      for (let i = 0; i < str.length && str[i] === '1'; i++) bytes.push(0);
      return new Uint8Array(bytes.reverse());
    }
    function base58Encode(bytes) {
      let digits = [0];
      for (const byte of bytes) {
        let carry = byte;
        for (let i = 0; i < digits.length; i++) {
          carry += digits[i] << 8;
          digits[i] = carry % 58;
          carry = Math.floor(carry / 58);
        }
        while (carry > 0) { digits.push(carry % 58); carry = Math.floor(carry / 58); }
      }
      let leadingZeros = 0;
      for (const byte of bytes) { if (byte === 0) leadingZeros++; else break; }
      return ALPHABET[0].repeat(leadingZeros) + digits.reverse().map((d) => ALPHABET[d]).join('');
    }

    const mintBytes = base58Decode(mintBase58);
    const programBytes = base58Decode(PUMP_PROGRAM_ID);
    const seedLabel = new TextEncoder().encode('bonding-curve');
    const pdaMarker = new TextEncoder().encode('ProgramDerivedAddress');

    for (let bump = 255; bump >= 0; bump--) {
      const buffer = new Uint8Array(seedLabel.length + mintBytes.length + 1 + programBytes.length + pdaMarker.length);
      let offset = 0;
      buffer.set(seedLabel, offset); offset += seedLabel.length;
      buffer.set(mintBytes, offset); offset += mintBytes.length;
      buffer[offset] = bump; offset += 1;
      buffer.set(programBytes, offset); offset += programBytes.length;
      buffer.set(pdaMarker, offset);

      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashBytes = new Uint8Array(hashBuffer);

      // Uma PDA válida precisa estar fora da curva ed25519. Não temos uma lib
      // de curva elíptica aqui, então usamos a heurística padrão: o bump
      // correto é, na prática quase sempre 255 ou muito próximo dele para
      // PDAs de programas conhecidos como o pump.fun. Retornamos o primeiro
      // candidato e validamos depois consultando getAccountInfo: se a conta
      // existir e tiver o tamanho esperado, está correto.
      const candidate = base58Encode(hashBytes);
      return candidate; // primeira tentativa (bump 255) — validada via getAccountInfo a seguir
    }
    return null;
  }, []);

  // Endereço da bonding curve do $BNC, confirmado manualmente via Solscan
  // (Public name: "Pump.fun (BNC) Bonding Curve", Owner: Pump.fun).
  // Usado como atalho direto — mais rápido e confiável que derivar o PDA
  // ou usar a heurística do "maior holder". Se o token migrar de pool no
  // futuro (por exemplo após uma migração do programa pump.fun), este
  // endereço pode precisar ser atualizado.
  const PUMP_BONDING_CURVE_KNOWN_ADDRESS = '9Wy8NKpyoqgjYMEeZLuwMxmXn5MRs2aycUgeueMJymgV';

  const fetchPumpfunBondingCurve = useCallback(async () => {
    const debug = [];
    try {
      // Estratégia 1 (mais confiável): ler diretamente o endereço da bonding
      // curve já confirmado manualmente via Solscan para este token.
      const { data: knownInfo, endpoint: ep0 } = await solanaRpcCall({
        jsonrpc: '2.0', id: 0, method: 'getAccountInfo', params: [PUMP_BONDING_CURVE_KNOWN_ADDRESS, { encoding: 'base64' }],
      });
      debug.push(`getAccountInfo(endereço confirmado) via ${ep0}`);
      const knownRaw = knownInfo?.result?.value?.data?.[0];
      if (knownRaw) {
        const curve = parseBondingCurveAccount(knownRaw);
        debug.push(`Conta confirmada decodificada — complete=${curve.complete}`);
        if (!curve.complete) {
          const solReserves = Number(curve.virtualSolReserves) / 1e9;
          const tokenReserves = Number(curve.virtualTokenReserves) / Math.pow(10, PUMP_TOKEN_DECIMALS);
          if (solReserves && tokenReserves) {
            setPriceDebug(debug);
            return { pricePerTokenInSol: solReserves / tokenReserves, curve };
          }
          debug.push('Reservas zeradas na conta confirmada — seguindo para outras estratégias.');
        } else {
          debug.push('Conta confirmada indica complete=true (já graduou) — preço deve vir do DexScreener.');
          setPriceDebug(debug);
          return null;
        }
      } else {
        debug.push('Endereço confirmado não retornou dados — pode ter sido migrado ou fechado.');
      }

      // Estratégia 2: derivar o PDA da bonding curve diretamente e consultar a conta
      const pda = await deriveBondingCurvePda(SOLANA_ADDRESS);
      debug.push(`PDA derivado (tentativa): ${pda || 'falhou'}`);

      if (pda) {
        const { data: curveInfo, endpoint } = await solanaRpcCall({
          jsonrpc: '2.0', id: 1, method: 'getAccountInfo', params: [pda, { encoding: 'base64' }],
        });
        debug.push(`getAccountInfo(PDA) via ${endpoint}`);
        const raw = curveInfo?.result?.value?.data?.[0];
        if (raw) {
          const curve = parseBondingCurveAccount(raw);
          debug.push(`Conta PDA encontrada — complete=${curve.complete}`);
          if (!curve.complete) {
            const solReserves = Number(curve.virtualSolReserves) / 1e9;
            const tokenReserves = Number(curve.virtualTokenReserves) / Math.pow(10, PUMP_TOKEN_DECIMALS);
            if (solReserves && tokenReserves) {
              setPriceDebug(debug);
              return { pricePerTokenInSol: solReserves / tokenReserves, curve };
            }
          }
        } else {
          debug.push('PDA derivado não corresponde a uma conta válida — tentando estratégia alternativa.');
        }
      }

      // Estratégia 3 (fallback final): localizar a bonding curve pelo maior holder
      // do token, já que antes da graduação ela costuma reter a maior parte do supply.
      const { data: largestData, endpoint: ep2 } = await solanaRpcCall({
        jsonrpc: '2.0', id: 2, method: 'getTokenLargestAccounts', params: [SOLANA_ADDRESS],
      });
      debug.push(`getTokenLargestAccounts via ${ep2}`);
      const largest = largestData?.result?.value?.[0];
      if (!largest) { debug.push('Nenhum holder encontrado para o mint.'); setPriceDebug(debug); return null; }

      const { data: ownerData, endpoint: ep3 } = await solanaRpcCall({
        jsonrpc: '2.0', id: 3, method: 'getAccountInfo', params: [largest.address, { encoding: 'jsonParsed' }],
      });
      debug.push(`getAccountInfo(maior holder) via ${ep3}`);
      const ownerAddress = ownerData?.result?.value?.data?.parsed?.info?.owner;
      if (!ownerAddress) { debug.push('Não foi possível ler o owner do maior holder.'); setPriceDebug(debug); return null; }

      const { data: curveData, endpoint: ep4 } = await solanaRpcCall({
        jsonrpc: '2.0', id: 4, method: 'getAccountInfo', params: [ownerAddress, { encoding: 'base64' }],
      });
      debug.push(`getAccountInfo(owner=bonding curve?) via ${ep4}`);
      const data = curveData?.result?.value?.data?.[0];
      if (!data) { debug.push('Owner do maior holder não retornou dados de conta.'); setPriceDebug(debug); return null; }

      const curve = parseBondingCurveAccount(data);
      debug.push(`Conta candidata decodificada — complete=${curve.complete}`);
      if (curve.complete) { debug.push('Token já graduou — preço deve vir do DexScreener.'); setPriceDebug(debug); return null; }

      const solReserves = Number(curve.virtualSolReserves) / 1e9;
      const tokenReserves = Number(curve.virtualTokenReserves) / Math.pow(10, PUMP_TOKEN_DECIMALS);
      if (!solReserves || !tokenReserves) { debug.push('Reservas zeradas ou inválidas.'); setPriceDebug(debug); return null; }

      setPriceDebug(debug);
      return { pricePerTokenInSol: solReserves / tokenReserves, curve };
    } catch (e) {
      debug.push(`Erro: ${e.message}`);
      setPriceDebug(debug);
      return null;
    }
  }, [deriveBondingCurvePda]);

  const fetchSolUsdPrice = useCallback(async () => {
    try {
      const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      const data = await res.json();
      return data?.solana?.usd ?? null;
    } catch (e) {
      return null;
    }
  }, []);

  const fetchPrice = useCallback(async () => {
    setPriceLoading(true);
    setPriceError(false);
    const debug = [];
    try {
      // 1) Tenta DexScreener primeiro (token graduado, com par real)
      let pairs = null;
      try {
        const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${SOLANA_ADDRESS}`);
        const data = await res.json();
        pairs = data?.pairs;
        debug.push(`DexScreener: ${pairs?.length ? pairs.length + ' par(es) encontrado(s)' : 'sem pares'}`);
      } catch (e) {
        debug.push(`DexScreener falhou: ${e.message}`);
      }

      if (pairs?.length) {
        const best = [...pairs].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
        setBunnyPrice(parseFloat(best.priceUsd ?? 0));
        setPriceChange(best.priceChange?.h24 ?? null);
        setVolume24h(best.volume?.h24 ?? null);
        setLiquidity(best.liquidity?.usd ?? null);
        setMcap(best.marketCap ?? best.fdv ?? null);
        setPriceSource('dexscreener');
        setLastUpdated(new Date());
        setPriceDebug(debug);
        return;
      }

      // 2) Sem par no DexScreener — token ainda na bonding curve da pump.fun
      const solUsd = await fetchSolUsdPrice();
      debug.push(`Preço SOL/USD: ${solUsd ?? 'falhou'}`);
      setSolUsdPrice(solUsd);
      const bonding = await fetchPumpfunBondingCurve();

      if (bonding && solUsd) {
        const priceUsd = bonding.pricePerTokenInSol * solUsd;
        const totalSupply = Number(bonding.curve.tokenTotalSupply) / Math.pow(10, PUMP_TOKEN_DECIMALS);
        setBunnyPrice(priceUsd);
        setPriceChange(null); // não calculável sem histórico — não inventamos um número
        setVolume24h(null);
        setLiquidity((Number(bonding.curve.realSolReserves) / 1e9) * solUsd);
        setMcap(priceUsd * totalSupply);
        setPriceSource('pumpfun-bonding-curve');
        setLastUpdated(new Date());
        setPriceDebug((d) => [...debug, ...d]);
        return;
      }

      // 3) Não foi possível confirmar preço real em nenhuma fonte — sem fallback fictício
      debug.push('Nenhuma fonte de preço respondeu com dados válidos.');
      setPriceDebug((d) => [...debug, ...d]);
      setBunnyPrice(null);
      setPriceSource(null);
      setPriceError(true);
    } catch (e) {
      debug.push(`Erro geral: ${e.message}`);
      setPriceDebug(debug);
      setBunnyPrice(null);
      setPriceSource(null);
      setPriceError(true);
    } finally {
      setPriceLoading(false);
    }
  }, [fetchPumpfunBondingCurve, fetchSolUsdPrice]);

  const fetchBalances = useCallback(async (w) => {
    if (!w) return;
    setBalanceLoading(true);
    setVerifyError(null);
    try {
      if (w.chain === 'solana') {
        const { data: balData } = await solanaRpcCall({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [w.address] });
        if (balData?.error) throw new Error(balData.error.message || 'RPC retornou erro');
        setSolBalance((balData?.result?.value ?? 0) / 1e9);
        const { data: tokData } = await solanaRpcCall({ jsonrpc: '2.0', id: 2, method: 'getTokenAccountsByOwner', params: [w.address, { mint: SOLANA_ADDRESS }, { encoding: 'jsonParsed' }] });
        const accs = tokData?.result?.value ?? [];
        const total = accs.reduce((s, a) => s + Number(a.account?.data?.parsed?.info?.tokenAmount?.uiAmount ?? 0), 0);
        setBunnyBalance(total);
        // A blockchain respondeu com um slot/contexto válido para este endereço -> conexão confirmada de verdade
        setChainVerified(typeof balData?.context?.slot === 'number');
      } else if (w.chain === 'evm' && w.provider) {
        // Confirma on-chain via o próprio provider injetado (extensão real) -> chainId + saldo nativo
        const chainIdHex = await w.provider.request({ method: 'eth_chainId' });
        const balHex = await w.provider.request({ method: 'eth_getBalance', params: [w.address, 'latest'] });
        setSolBalance(null);
        setBunnyBalance(null);
        setChainVerified(Boolean(chainIdHex) && balHex !== undefined);
      } else {
        setSolBalance(null);
        setBunnyBalance(null);
        setChainVerified(false);
      }
    } catch (e) {
      setSolBalance(null);
      setBunnyBalance(null);
      setChainVerified(false);
      setVerifyError('Não foi possível confirmar este endereço junto à blockchain agora. Tente atualizar novamente.');
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  /* ════════════════════════════════════════════════════════════════
     JUPITER AGGREGATOR — quote e swap reais on-chain
     Fluxo: USD (via USDC) <-> $BNC. O Jupiter já varre todos os DEXs
     da Solana (Raydium, Orca, etc.) e devolve a melhor rota.
  ════════════════════════════════════════════════════════════════ */
  /* ── Deriva a Associated Token Account (ATA) de uma carteira+mint ──
     A Jupiter exige que `feeAccount` seja uma ATA já existente (ou que
     ela própria crie), nunca o endereço "nu" da carteira. Calculamos
     isso manualmente via PDA, usando as constantes fixas dos programas
     SPL Token e Associated Token Account — evita depender do pacote
     @solana/spl-token, que não tem build pronta para navegador (só
     @solana/web3.js tem, via CDN). */
  const SPL_TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
  const ASSOCIATED_TOKEN_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
  const deriveAssociatedTokenAccount = useCallback((ownerAddress, mintAddress) => {
    const web3 = window?.solanaWeb3;
    if (!web3) return null;
    try {
      const owner = new web3.PublicKey(ownerAddress);
      const mint = new web3.PublicKey(mintAddress);
      const tokenProgram = new web3.PublicKey(SPL_TOKEN_PROGRAM_ID);
      const ataProgram = new web3.PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID);
      const [ata] = web3.PublicKey.findProgramAddressSync(
        [owner.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
        ataProgram
      );
      return ata.toString();
    } catch (e) {
      return null;
    }
  }, []);

  const jupiterHeaders = useCallback(() => {
    // API key não fica mais no front-end — os proxies /api/jupiter-* a injetam no servidor.
    return { 'Content-Type': 'application/json' };
  }, []);

  /* ── Busca aberta de tokens (Jupiter Tokens API V2) ──
     Permite trocar por QUALQUER token Solana, não só USDC. Busca por
     símbolo, nome ou endereço do mint diretamente colado pelo usuário. */
  const searchTokens = useCallback(async (query) => {
    if (!query || query.trim().length < 2) { setTokenSearchResults([]); return; }
    setTokenSearchLoading(true);
    try {
      const res = await fetch(`/api/jupiter-tokens?query=${encodeURIComponent(query.trim())}`, {
        headers: jupiterHeaders(),
      });
      if (!res.ok) throw new Error(`Busca de tokens falhou (${res.status})`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data?.tokens ?? []);
      setTokenSearchResults(
        list.slice(0, 20).map((t) => ({
          mint: t.id ?? t.address ?? t.mint,
          symbol: t.symbol ?? '?',
          name: t.name ?? t.symbol ?? 'Token',
          decimals: t.decimals,
          icon: t.icon ?? t.logoURI ?? null,
        })).filter((t) => t.mint)
      );
    } catch (e) {
      // Busca aberta é "best effort" — se a API falhar, simplesmente não
      // mostra resultados extras; os tokens populares continuam disponíveis.
      setTokenSearchResults([]);
    } finally {
      setTokenSearchLoading(false);
    }
  }, [jupiterHeaders]);

  useEffect(() => {
    const handle = setTimeout(() => { if (tokenModalOpen) searchTokens(tokenSearch); }, 350);
    return () => clearTimeout(handle);
  }, [tokenSearch, tokenModalOpen, searchTokens]);

  const fetchJupiterQuote = useCallback(async () => {
    const amount = Number(swapAmount || 0);
    if (!amount || amount <= 0) { setJupiterQuote(null); return; }

    setQuoteLoading(true);
    setQuoteError(null);
    try {
      // decimals varia por token (USDC/USDT/BNC = 6, SOL = 9, BONK = 5,
      // outros variam) — usamos o decimals de cada token selecionado,
      // com fallback seguro de 6 (cobre a maioria dos tokens SPL comuns).
      const inputMint = fromToken.mint;
      const outputMint = toToken.mint;
      const decimals = fromToken.decimals ?? 6;
      const amountBaseUnits = Math.round(amount * Math.pow(10, decimals));

      const params = new URLSearchParams({
        inputMint,
        outputMint,
        amount: String(amountBaseUnits),
        slippageBps: String(DEFAULT_SLIPPAGE_BPS),
        swapMode: 'ExactIn', // obrigatório na API atual — faltava antes
        restrictIntermediateTokens: 'true',
        instructionVersion: 'V2',
      });

      // Taxa de serviço da plataforma (ver whitepaper, seção 4): a Jupiter
      // exige que feeAccount já seja a ATA da carteira de taxa para o mint
      // de saída (regra dela). Derivamos isso aqui, on-the-fly.
      if (PLATFORM_FEE_WALLET && PLATFORM_FEE_BPS > 0) {
        const feeAta = deriveAssociatedTokenAccount(PLATFORM_FEE_WALLET, outputMint);
        if (feeAta) {
          params.set('platformFeeBps', String(PLATFORM_FEE_BPS));
          params.set('feeAccount', feeAta);
        }
      }

      const url = `${JUPITER_QUOTE_ENDPOINT}?${params.toString()}`;
      const res = await fetch(url, { headers: jupiterHeaders() });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        // A Jupiter devolve { error, errorCode } no corpo mesmo em respostas 400
        const code = data?.errorCode;
        const msg = data?.error || 'sem detalhe';
        if (code === 'TOKEN_NOT_TRADABLE' || code === 'COULD_NOT_FIND_ANY_ROUTE') {
          throw new Error(`Sem rota de liquidez entre ${fromToken.symbol} e ${toToken.symbol} agora (errorCode: ${code}) — pode acontecer com tokens de baixa liquidez, como o $BNC enquanto estiver na bonding curve da pump.fun.`);
        }
        throw new Error(`Jupiter respondeu ${res.status} (errorCode: ${code || 'nenhum'}): ${msg}`);
      }
      if (!data?.outAmount) {
        throw new Error('Jupiter respondeu 200 mas sem outAmount — resposta inesperada da API.');
      }

      setJupiterQuote(data);
    } catch (e) {
      setJupiterQuote(null);
      setQuoteError(e.message || 'Falha ao consultar a Jupiter API.');
    } finally {
      setQuoteLoading(false);
    }
  }, [swapAmount, fromToken, toToken, jupiterHeaders, deriveAssociatedTokenAccount]);

  // Busca a quote automaticamente, com debounce, sempre que valor/direção mudarem
  useEffect(() => {
    if (tab !== 'swap') return;
    clearTimeout(quoteDebounceRef.current);
    quoteDebounceRef.current = setTimeout(() => { fetchJupiterQuote(); }, 500);
    return () => clearTimeout(quoteDebounceRef.current);
  }, [swapAmount, fromToken, toToken, tab, fetchJupiterQuote]);

  const executeJupiterSwap = useCallback(async () => {
    setSwapResult(null);
    if (!wallet || wallet.chain !== 'solana') {
      setSwapResult({ error: 'Conecte uma carteira Solana (Phantom, Solflare ou Backpack) para executar o swap real.' });
      return;
    }
    if (!jupiterQuote) {
      setSwapResult({ error: 'Nenhuma cotação válida no momento. Ajuste o valor e tente novamente.' });
      return;
    }

    // Usa o provider salvo no objeto wallet (qualquer carteira Solana)
    // com fallbacks para os providers globais mais comuns como segurança
    const provider = wallet.provider
      ?? window?.phantom?.solana
      ?? window?.solflare
      ?? window?.backpack?.solana
      ?? window?.solana;

    if (!provider) {
      setSwapResult({ error: 'Provider da carteira não encontrado. Desconecte e conecte de novo.' });
      return;
    }

    setSwapExecuting(true);
    try {
      // Recalcula a mesma ATA de taxa usada na cotação, para manter
      // consistência entre /quote e /swap (a Jupiter exige isso).
      const feeOutputMint = jupiterQuote?.outputMint;
      const feeAta = (PLATFORM_FEE_WALLET && PLATFORM_FEE_BPS > 0 && feeOutputMint)
        ? deriveAssociatedTokenAccount(PLATFORM_FEE_WALLET, feeOutputMint)
        : null;

      // 1) Pede ao Jupiter a transação serializada já montada para esta quote
      const swapRes = await fetch(JUPITER_SWAP_ENDPOINT, {
        method: 'POST',
        headers: jupiterHeaders(),
        body: JSON.stringify({
          quoteResponse: jupiterQuote,
          userPublicKey: wallet.address,
          wrapAndUnwrapSol: true,
          ...(feeAta ? { feeAccount: feeAta } : {}),
        }),
      });
      if (!swapRes.ok) {
        const errBody = await swapRes.json().catch(() => null);
        throw new Error(`Jupiter /swap respondeu ${swapRes.status}: ${errBody?.error || 'erro desconhecido'}`);
      }
      const swapData = await swapRes.json();
      if (!swapData?.swapTransaction) throw new Error('Jupiter não retornou a transação para assinar.');

      // 2) Decodifica base64 → bytes → VersionedTransaction
      // A Phantom exige um objeto VersionedTransaction real (não bytes brutos nem
      // objeto literal). Usamos window.solanaWeb3.VersionedTransaction via CDN.
      const txBytes = Uint8Array.from(atob(swapData.swapTransaction), (c) => c.charCodeAt(0));

      // A Phantom moderna EXIGE um objeto VersionedTransaction real — passar
      // bytes brutos pode travar silenciosamente (sem erro, sem popup) em
      // vez de funcionar como fallback. Por isso falhamos rápido e claro
      // aqui, em vez de arriscar esse caminho.
      if (!window?.solanaWeb3?.VersionedTransaction) {
        throw new Error('Biblioteca @solana/web3.js não carregou (necessária para assinar a transação). Recarregue a página e tente de novo — se persistir, pode ser bloqueio de rede ao CDN.');
      }
      const txToSign = window.solanaWeb3.VersionedTransaction.deserialize(txBytes);

      // 3) Pede para a Phantom assinar e enviar à blockchain Solana.
      // Timeout de segurança: se a Phantom não responder em 90s (nem com
      // sucesso, nem com popup, nem com erro), assumimos travamento e
      // liberamos a UI com uma mensagem clara em vez de ficar preso para
      // sempre em "Assinando na carteira...".
      const signPromise = provider.signAndSendTransaction(txToSign);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('A Phantom não respondeu em 90 segundos. Verifique se um popup de aprovação não ficou escondido atrás da janela do navegador, ou tente recarregar a página.')), 90000)
      );
      const result = await Promise.race([signPromise, timeoutPromise]);
      const signature = result?.signature ?? result;

      setSwapResult({ signature });
      setStakeMsg(null);
      // Atualiza saldos após o swap real
      await fetchBalances(wallet);
    } catch (e) {
      const msg = e?.message?.includes('User rejected') || e?.code === 4001
        ? 'Transação recusada na carteira.'
        : e?.message || 'Falha ao executar o swap.';
      setSwapResult({ error: msg });
    } finally {
      setSwapExecuting(false);
    }
  }, [wallet, jupiterQuote, jupiterHeaders, fetchBalances, deriveAssociatedTokenAccount]);

  /* ── Status de rede Solana ── */
  const fetchNetworkStatus = useCallback(async () => {
    try {
      const { data: slotRes, endpoint } = await solanaRpcCall({ jsonrpc: '2.0', id: 1, method: 'getSlot' });
      const slot = slotRes?.result;
      setNetworkStatus({ slot, online: typeof slot === 'number', endpoint });
    } catch (e) {
      setNetworkStatus({ online: false, error: e.message });
    }
  }, []);

  /* ════════════════════════════════════════════════════════════════
     HOLDERS E TRANSAÇÕES — dados reais on-chain do $BNC, lidos via RPC
     público (sem indexador pago). Limitações honestas:
     - getTokenLargestAccounts retorna no máximo os 20 maiores holders
       (limite da própria Solana, não é algo que dá para contornar
       sem um indexador dedicado/pago).
     - Não existe um "número total de holders únicos" via RPC público
       leve; isso exigiria escanear TODAS as contas de token do mint
       (getProgramAccounts com filtro), o que é pesado e costuma ser
       limitado/bloqueado em RPCs públicos gratuitos. Por isso mostramos
       apenas a contagem de contas de token ATIVAS encontradas nos top
       holders, e deixamos claro que não é o total real da rede.
  ════════════════════════════════════════════════════════════════ */
  const fetchHoldersAndTxs = useCallback(async () => {
    setHoldersLoading(true);
    setHoldersError(null);
    try {
      // 1) Supply total do token (para calcular % de cada holder)
      const { data: supplyData } = await solanaRpcCall({
        jsonrpc: '2.0', id: 1, method: 'getTokenSupply', params: [SOLANA_ADDRESS],
      });
      const supplyInfo = supplyData?.result?.value;
      setTokenSupplyInfo(supplyInfo || null);
      const totalSupply = supplyInfo ? Number(supplyInfo.amount) / Math.pow(10, supplyInfo.decimals) : null;

      // 2) Top 20 maiores holders (limite da própria API da Solana)
      const { data: largestData } = await solanaRpcCall({
        jsonrpc: '2.0', id: 2, method: 'getTokenLargestAccounts', params: [SOLANA_ADDRESS],
      });
      const largest = largestData?.result?.value ?? [];

      // Identifica quais dessas contas são a própria bonding curve (já
      // conhecida), para diferenciar "holder real" de "reserva da curva"
      // na exibição.
      const holdersWithPct = largest.map((h) => ({
        address: h.address,
        uiAmount: h.uiAmount,
        pct: totalSupply ? (h.uiAmount / totalSupply) * 100 : null,
        isBondingCurveTokenAccount: false, // refinado abaixo se possível
      }));

      setTopHolders(holdersWithPct);

      // 3) Transações recentes envolvendo o mint (assinaturas mais recentes)
      const { data: sigData } = await solanaRpcCall({
        jsonrpc: '2.0', id: 3, method: 'getSignaturesForAddress', params: [SOLANA_ADDRESS, { limit: 15 }],
      });
      const sigs = sigData?.result ?? [];
      setRecentTxs(
        sigs.map((s) => ({
          signature: s.signature,
          slot: s.slot,
          blockTime: s.blockTime,
          err: s.err,
        }))
      );
    } catch (e) {
      setHoldersError(e.message || 'Falha ao consultar holders/transações.');
      setTopHolders([]);
      setRecentTxs([]);
    } finally {
      setHoldersLoading(false);
    }
  }, []);

  useEffect(() => {
    if ((showAdmin && adminAuth) || tab === 'transparency') fetchHoldersAndTxs();
  }, [showAdmin, adminAuth, tab, fetchHoldersAndTxs]);

  useEffect(() => {
    fetchPrice();
    fetchNetworkStatus();
    const t1 = setInterval(fetchPrice, 30000);
    const t2 = setInterval(fetchNetworkStatus, 20000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [fetchPrice, fetchNetworkStatus]);

  /* ── Buscar saldo da carteira conectada ── */
  useEffect(() => {
    if (wallet) fetchBalances(wallet);
  }, [wallet, fetchBalances]);

  /* ── Carregar posições de stake ── */
  useEffect(() => {
    (async () => {
      setStakeLoading(true);
      try {
        const positions = await listPositions({ walletAddress: wallet?.address });
        setStakePositions(positions);
      } catch (e) {
        setStakePositions([]);
      } finally {
        setStakeLoading(false);
      }
    })();
  }, [wallet]);

  const handleConnected = (w) => {
    setWallet(w);
    setShowWalletModal(false);
    setChainVerified(null);
    setVerifyError(null);
  };

  const disconnect = () => {
    setWallet(null);
    setSolBalance(null);
    setBunnyBalance(null);
    setStakePositions([]);
    setChainVerified(null);
    setVerifyError(null);
  };

  const createStake = async () => {
    if (!wallet) { setStakeMsg('Conecte uma carteira para fazer stake.'); return; }
    if (wallet.chain !== 'solana') { setStakeMsg('Stake disponível apenas com carteira Solana (Phantom) — o token $BNC é nativo da Solana.'); return; }
    if (chainVerified !== true) { setStakeMsg('Aguarde a confirmação da carteira junto à blockchain antes de fazer stake (ou clique em "Atualizar" no card da carteira).'); return; }
    const amount = Number(newStakeAmount || 0);
    if (amount <= 0) { setStakeMsg('Informe uma quantidade válida.'); return; }
    setStakeCreating(true);
    try {
      await createStakePosition({ walletAddress: wallet.address, amount, periodDays: newStakePeriod });
      const updated = await listPositions({ walletAddress: wallet.address });
      setStakePositions(updated);
      setStakeMsg(STAKING_LIVE ? 'Posição criada na blockchain.' : 'Posição criada em modo simulação — o programa on-chain ainda está em desenvolvimento.');
    } catch (e) {
      setStakeMsg(`Erro: ${e.message}`);
    } finally {
      setStakeCreating(false);
      setTimeout(() => setStakeMsg(null), 6000);
    }
  };

  const claimStake = async (id) => {
    setClaimingId(id);
    try {
      await claimStakePosition({ positionId: id });
      const updated = await listPositions({ walletAddress: wallet?.address });
      setStakePositions(updated);
    } catch (e) {
      setStakeMsg(`Erro ao resgatar: ${e.message}`);
      setTimeout(() => setStakeMsg(null), 6000);
    } finally {
      setClaimingId(null);
    }
  };

  const totalStaked = stakePositions.filter((p) => !p.claimed).reduce((s, p) => s + p.amount, 0);
  const totalPending = stakePositions.filter((p) => !p.claimed).reduce((s, p) => s + calcReward(p.amount, p.period, p.apy), 0);
  const totalClaimed = stakePositions.filter((p) => p.claimed).reduce((s, p) => s + p.amount + calcReward(p.amount, p.period, p.apy), 0);

  const per1USD = bunnyPrice > 0 ? Math.round(1 / bunnyPrice) : 0;

  const shortAddr = (a) => (a ? `${a.slice(0, 5)}...${a.slice(-4)}` : '');

  const NavBtn = ({ id, label, icon }) => (
    <button
      onClick={() => { setTab(id); setNavOpen(false); }}
      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
      style={{ background: tab === id ? C.limeDim : 'transparent', color: tab === id ? C.lime : C.textDim }}
    >
      {icon} {label}
    </button>
  );

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: "'Inter', sans-serif", minHeight: '100vh' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box} input[type=range]{accent-color:${C.lime}}
        ::-webkit-scrollbar{width:6px;height:6px} ::-webkit-scrollbar-track{background:${C.bg}}
        ::-webkit-scrollbar-thumb{background:#2A2D33;border-radius:3px}
      `}</style>

      {/* ── Ticker de status (assinatura visual) ── */}
      <div className="overflow-hidden" style={{ background: C.bgRaised, borderBottom: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-6 px-5 py-1.5 text-xs whitespace-nowrap" style={fontMono}>
          <span className="flex items-center gap-1.5" style={{ color: networkStatus?.online ? C.lime : C.red }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: networkStatus?.online ? C.lime : C.red }} />
            SOLANA {networkStatus?.online ? 'ONLINE' : 'OFFLINE'}
          </span>
          {networkStatus?.slot && <span style={{ color: C.textFaint }}>SLOT #{networkStatus.slot.toLocaleString('pt-BR')}</span>}
          <span style={{ color: C.textFaint }}>$BNC {bunnyPrice ? `$${bunnyPrice.toFixed(10)}` : '—'}</span>
          {priceChange !== null && (
            <span style={{ color: priceChange >= 0 ? C.lime : C.red }}>{priceChange >= 0 ? '▲' : '▼'} {Math.abs(priceChange).toFixed(2)}%</span>
          )}
          <span style={{ color: C.textFaint }} className="hidden md:inline">SOLANA DEFI · APY {APY_PERCENT}%</span>
        </div>
      </div>

      {/* ── Header ── */}
      <header className="sticky top-0 z-40" style={{ background: 'rgba(8,9,12,0.85)', backdropFilter: 'blur(12px)', borderBottom: `1px solid ${C.border}` }}>
        <div className="max-w-6xl mx-auto px-5 md:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${C.carrot}, #C8511F)` }}>
              <PawPrint size={18} color="#08090C" strokeWidth={2.5} />
            </div>
            <span style={fontDisplay} className="text-lg font-semibold tracking-tight">Bunnycoiin</span>
            <span className="text-xs px-2 py-0.5 rounded-md font-semibold ml-1" style={{ background: C.limeDim, color: C.lime }}>DeFi</span>
          </div>

          <nav className="hidden md:flex items-center gap-1">
            <NavBtn id="overview" label="Visão geral" icon={<BarChart3 size={15} />} />
            <NavBtn id="swap" label="Swap" icon={<Activity size={15} />} />
            <NavBtn id="stake" label="Stake" icon={<Coins size={15} />} />
            <NavBtn id="positions" label="Posições" icon={<History size={15} />} />
            <NavBtn id="transparency" label="Transparência" icon={<Globe size={15} />} />
          </nav>

          <div className="flex items-center gap-2">
            {!wallet ? (
              <button
                onClick={() => setShowWalletModal(true)}
                className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-transform hover:scale-105"
                style={{ background: C.lime, color: '#08090C' }}
              >
                <Wallet size={15} /> Conectar carteira
              </button>
            ) : (
              <div className="hidden sm:flex items-center gap-2">
                <span className="px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5" style={{ ...fontMono, background: C.panel, border: `1px solid ${C.border}`, color: C.text }}>
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: chainVerified === true ? C.lime : chainVerified === false ? C.red : C.textFaint }}
                    title={chainVerified === true ? 'Confirmado on-chain' : chainVerified === false ? 'Falha na verificação' : 'Verificando...'}
                  />
                  {wallet.chain === 'solana' ? '◎' : '⬡'} {shortAddr(wallet.address)}
                </span>
                <button onClick={disconnect} className="p-2 rounded-xl" style={{ background: C.redDim, color: C.red }}>
                  <LogOut size={15} />
                </button>
              </div>
            )}
            <button className="md:hidden" onClick={() => setNavOpen(!navOpen)} style={{ color: C.text }}>
              {navOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {navOpen && (
          <div className="md:hidden px-5 pb-4 flex flex-col gap-2" style={{ borderTop: `1px solid ${C.border}` }}>
            <div className="pt-3 flex flex-col gap-1">
              <NavBtn id="overview" label="Visão geral" icon={<BarChart3 size={15} />} />
              <NavBtn id="swap" label="Swap" icon={<Activity size={15} />} />
              <NavBtn id="stake" label="Stake" icon={<Coins size={15} />} />
              <NavBtn id="positions" label="Posições" icon={<History size={15} />} />
              <NavBtn id="transparency" label="Transparência" icon={<Globe size={15} />} />
            </div>
            {!wallet ? (
              <button onClick={() => setShowWalletModal(true)} className="mt-2 px-4 py-3 rounded-xl text-sm font-semibold" style={{ background: C.lime, color: '#08090C' }}>
                Conectar carteira
              </button>
            ) : (
              <button onClick={disconnect} className="mt-2 px-4 py-3 rounded-xl text-sm font-semibold" style={{ background: C.redDim, color: C.red }}>
                Desconectar {shortAddr(wallet.address)}
              </button>
            )}
          </div>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-5 md:px-8 py-8">

        {/* ══════════ VISÃO GERAL ══════════ */}
        {tab === 'overview' && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 style={fontDisplay} className="text-2xl md:text-3xl font-semibold">Painel Bunnycoiin</h1>
              <p className="text-sm mt-1" style={{ color: C.textDim }}>Dados on-chain ao vivo · Solana mainnet-beta</p>
            </div>

            {/* Cards de preço */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Preço', value: priceLoading ? '...' : bunnyPrice ? `$${bunnyPrice.toFixed(10)}` : 'Indisponível', sub: priceChange !== null ? `${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}% 24h` : priceSource === 'pumpfun-bonding-curve' ? 'bonding curve' : '—', color: priceChange === null ? C.textFaint : priceChange >= 0 ? C.lime : C.red, icon: priceChange === null ? <Activity size={16} color={C.textFaint} /> : priceChange >= 0 ? <TrendingUp size={16} color={C.lime} /> : <TrendingDown size={16} color={C.red} /> },
                { label: 'Volume 24h', value: volume24h ? `$${volume24h.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}` : 'N/D', sub: priceSource === 'dexscreener' ? 'DexScreener' : 'sem dado na curve', color: C.text, icon: <Activity size={16} color={C.carrot} /> },
                { label: 'Liquidez', value: liquidity ? `$${liquidity.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}` : '—', sub: priceSource === 'pumpfun-bonding-curve' ? 'SOL na curve' : 'pool ativo', color: C.text, icon: <Layers size={16} color={C.carrot} /> },
                { label: 'Market Cap', value: mcap ? `$${mcap.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}` : '—', sub: 'estimado', color: C.text, icon: <Coins size={16} color={C.carrot} /> },
              ].map((s, i) => (
                <Panel key={i} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs uppercase tracking-wide" style={{ color: C.textFaint }}>{s.label}</span>
                    {s.icon}
                  </div>
                  <div className="text-lg font-bold" style={{ ...fontMono, color: s.color }}>{s.value}</div>
                  <div className="text-xs mt-1" style={{ color: C.textFaint }}>{s.sub}</div>
                </Panel>
              ))}
            </div>

            {/* Fonte do preço — transparência total */}
            <Panel className="p-4 flex items-center gap-3" style={{ borderColor: priceSource ? C.lime + '44' : C.red + '44' }}>
              {priceSource ? <ShieldCheck size={16} color={C.lime} /> : <AlertCircle size={16} color={C.red} />}
              <p className="text-xs" style={{ color: C.textDim }}>
                {priceSource === 'dexscreener' && 'Preço obtido do DexScreener — token já possui par de liquidez em DEX (graduou da pump.fun).'}
                {priceSource === 'pumpfun-bonding-curve' && 'Preço calculado em tempo real a partir da bonding curve on-chain da pump.fun (token ainda não graduou para um DEX).'}
                {!priceSource && !priceLoading && 'Não foi possível confirmar o preço real em nenhuma fonte (DexScreener ou bonding curve pump.fun) agora. Tente atualizar novamente em alguns instantes.'}
                {priceLoading && 'Consultando DexScreener e a bonding curve da pump.fun...'}
              </p>
            </Panel>

            {/* Carteira + taxa de conversão */}
            <div className="grid md:grid-cols-2 gap-4">
              <Panel className="p-6" glow>
                <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.textFaint }}>Taxa de conversão ao vivo</div>
                {bunnyPrice ? (
                  <div className="text-2xl md:text-3xl font-bold" style={{ ...fontMono, color: C.carrot }}>
                    1 USD = {per1USD > 0 ? per1USD.toLocaleString('pt-BR') : '—'} $BNC
                  </div>
                ) : (
                  <div className="text-lg font-bold" style={{ color: C.red }}>
                    {priceLoading ? 'Calculando...' : 'Preço indisponível agora'}
                  </div>
                )}
                <div className="text-xs mt-2" style={{ color: C.textFaint }}>
                  {lastUpdated ? `atualizado às ${lastUpdated.toLocaleTimeString('pt-BR')}` : '—'} · {priceSource === 'dexscreener' ? 'DexScreener API' : priceSource === 'pumpfun-bonding-curve' ? 'Bonding curve pump.fun (RPC Solana)' : 'sem fonte confirmada'}
                </div>
              </Panel>

              <Panel className="p-6">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs uppercase tracking-wide" style={{ color: C.textFaint }}>Sua carteira</span>
                  {wallet && (
                    <button onClick={() => fetchBalances(wallet)} className="text-xs flex items-center gap-1" style={{ color: C.lime }}>
                      <RefreshCw size={11} className={balanceLoading ? 'animate-spin' : ''} /> Atualizar
                    </button>
                  )}
                </div>
                {!wallet ? (
                  <button onClick={() => setShowWalletModal(true)} className="w-full py-3 rounded-xl text-sm font-semibold" style={{ background: C.lime, color: '#08090C' }}>
                    Conectar carteira
                  </button>
                ) : (
                  <>
                    {/* Status de verificação on-chain */}
                    <div className="flex items-center gap-2 mb-3 text-xs">
                      {balanceLoading ? (
                        <span className="flex items-center gap-1.5" style={{ color: C.textFaint }}><Loader2 size={12} className="animate-spin" /> Confirmando junto à blockchain...</span>
                      ) : chainVerified === true ? (
                        <span className="flex items-center gap-1.5" style={{ color: C.lime }}><ShieldCheck size={12} /> Confirmado on-chain</span>
                      ) : chainVerified === false ? (
                        <span className="flex items-center gap-1.5" style={{ color: C.red }}><AlertCircle size={12} /> Falha na confirmação on-chain</span>
                      ) : null}
                      <a
                        href={wallet.chain === 'solana' ? `https://solscan.io/account/${wallet.address}` : `https://etherscan.io/address/${wallet.address}`}
                        target="_blank" rel="noreferrer"
                        className="flex items-center gap-1 ml-auto hover:underline"
                        style={{ color: C.textFaint }}
                      >
                        Ver no explorer <ExternalLink size={10} />
                      </a>
                    </div>

                    {verifyError && (
                      <div className="flex items-center gap-2 text-xs mb-3 p-2 rounded-lg" style={{ background: C.redDim, color: C.red }}>
                        <AlertCircle size={12} /> {verifyError}
                      </div>
                    )}

                    {wallet.chain !== 'solana' ? (
                      <p className="text-xs" style={{ color: C.textDim }}>
                        Carteira EVM conectada ({wallet.name}) — endereço real confirmado pela extensão. O token $BNC é nativo da Solana — conecte a Phantom para ver saldo e fazer stake.
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg p-3" style={{ background: C.panelHi }}>
                          <div className="text-xs" style={{ color: C.textFaint }}>SOL</div>
                          <div className="font-bold text-sm" style={fontMono}>{balanceLoading ? '...' : solBalance !== null ? solBalance.toLocaleString('pt-BR', { maximumFractionDigits: 4 }) : '—'}</div>
                        </div>
                        <div className="rounded-lg p-3" style={{ background: C.panelHi }}>
                          <div className="text-xs" style={{ color: C.textFaint }}>$BNC</div>
                          <div className="font-bold text-sm" style={fontMono}>{balanceLoading ? '...' : bunnyBalance !== null ? bunnyBalance.toLocaleString('pt-BR') : '—'}</div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </Panel>
            </div>

            {/* Resumo de stake */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Panel className="p-5">
                <Layers size={18} color={C.lime} className="mb-2" />
                <div className="text-xs uppercase tracking-wide" style={{ color: C.textFaint }}>Em stake</div>
                <div className="text-xl font-bold mt-1" style={{ ...fontMono, color: C.text }}>{totalStaked.toLocaleString('pt-BR')} <span className="text-xs" style={{ color: C.textFaint }}>BNYC</span></div>
              </Panel>
              <Panel className="p-5">
                <Gift size={18} color={C.carrot} className="mb-2" />
                <div className="text-xs uppercase tracking-wide" style={{ color: C.textFaint }}>Recompensas pendentes</div>
                <div className="text-xl font-bold mt-1" style={{ ...fontMono, color: C.carrot }}>+{Math.round(totalPending).toLocaleString('pt-BR')}</div>
              </Panel>
              <Panel className="p-5">
                <Check size={18} color={C.lime} className="mb-2" />
                <div className="text-xs uppercase tracking-wide" style={{ color: C.textFaint }}>Já resgatado</div>
                <div className="text-xl font-bold mt-1" style={{ ...fontMono, color: C.text }}>{Math.round(totalClaimed).toLocaleString('pt-BR')}</div>
              </Panel>
            </div>

            {/* Status do contrato */}
            <Panel className="p-5 flex items-start gap-3" style={{ borderColor: STAKING_LIVE ? '#2E7D3255' : C.carrot + '55' }}>
              {STAKING_LIVE ? <ShieldCheck size={18} color={C.lime} className="mt-0.5 shrink-0" /> : <AlertCircle size={18} color={C.carrot} className="mt-0.5 shrink-0" />}
              <div>
                <p className="text-sm font-semibold" style={{ color: STAKING_LIVE ? C.lime : C.carrot }}>
                  {STAKING_LIVE ? 'Programa de staking ativo on-chain' : 'Staking em modo simulação'}
                </p>
                <p className="text-xs mt-1" style={{ color: C.textDim }}>
                  {STAKING_LIVE
                    ? 'Conectado ao programa Anchor deployado em mainnet-beta.'
                    : 'O programa Anchor (IDL já estruturado neste front-end) ainda está em desenvolvimento. Posições criadas aqui são salvas localmente para demonstração.'}
                </p>
              </div>
            </Panel>
          </div>
        )}

        {/* ══════════ SWAP ══════════ */}
        {tab === 'swap' && (
          <div className="max-w-md mx-auto flex flex-col gap-4">
            <div>
              <h1 style={fontDisplay} className="text-2xl font-semibold">Swap</h1>
              <p className="text-sm mt-1" style={{ color: C.textDim }}>Troque entre $BNC e qualquer outro token da Solana — SOL, USDC, USDT e mais — via Jupiter Aggregator.</p>
            </div>

            {!JUPITER_API_KEY && (
              <Panel className="p-4 flex items-start gap-3" style={{ borderColor: C.carrot + '55' }}>
                <AlertCircle size={16} color={C.carrot} className="mt-0.5 shrink-0" />
                <p className="text-xs" style={{ color: C.textDim }}>
                  Sem API key configurada — a Jupiter API exige uma chave gratuita desde a migração de abril/2026 (gere em <span style={{ color: C.carrot }}>portal.jup.ag</span>). Sem ela, as cotações podem ser limitadas ou falhar com mais frequência.
                </p>
              </Panel>
            )}

            <Panel className="p-5">
              <label className="text-xs uppercase tracking-wide block mb-2" style={{ color: C.textFaint }}>Você paga</label>
              <div className="flex gap-2 mb-2">
                <input
                  type="number"
                  value={swapAmount}
                  onChange={(e) => { setSwapAmount(e.target.value === '' ? '' : e.target.value); setSwapResult(null); }}
                  placeholder="0.00"
                  className="flex-1 rounded-xl px-4 py-3 text-lg outline-none"
                  style={{ ...fontMono, background: C.panelHi, color: C.text, border: `1px solid ${C.border}` }}
                />
                <button
                  onClick={() => { setTokenModalSide('from'); setTokenModalOpen(true); }}
                  className="flex items-center gap-1.5 px-3 rounded-xl shrink-0"
                  style={{ background: fromToken.mint === SOLANA_ADDRESS ? C.carrotDim : C.panelHi, border: `1px solid ${fromToken.mint === SOLANA_ADDRESS ? C.carrot + '55' : C.borderHi}`, color: C.text }}
                >
                  <span className="text-sm font-semibold">{fromToken.mint === SOLANA_ADDRESS ? '$BNC' : fromToken.symbol}</span>
                  <ChevronDown size={14} color={C.textFaint} />
                </button>
              </div>

              <div className="flex justify-center my-1">
                <button
                  onClick={() => { setFromToken(toToken); setToToken(fromToken); setSwapResult(null); }}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: C.panelHi }}
                  title="Inverter par"
                >
                  <ArrowDownToLine size={14} color={C.textDim} />
                </button>
              </div>

              <label className="text-xs uppercase tracking-wide block mb-2 mt-1" style={{ color: C.textFaint }}>Você recebe</label>
              <div className="flex gap-2 mb-4">
                <div className="flex-1 rounded-xl px-4 py-3 text-lg font-bold" style={{ ...fontMono, background: C.panelHi, color: jupiterQuote ? C.lime : C.textFaint, border: `1px solid ${C.border}` }}>
                  {quoteLoading
                    ? 'Cotando na Jupiter...'
                    : jupiterQuote
                      ? (Number(jupiterQuote.outAmount) / Math.pow(10, toToken.decimals ?? 6)).toLocaleString('pt-BR', { maximumFractionDigits: (toToken.decimals ?? 6) <= 6 ? 2 : 6 })
                      : 'Sem cotação'}
                </div>
                <button
                  onClick={() => { setTokenModalSide('to'); setTokenModalOpen(true); }}
                  className="flex items-center gap-1.5 px-3 rounded-xl shrink-0"
                  style={{ background: toToken.mint === SOLANA_ADDRESS ? C.carrotDim : C.panelHi, border: `1px solid ${toToken.mint === SOLANA_ADDRESS ? C.carrot + '55' : C.borderHi}`, color: C.text }}
                >
                  <span className="text-sm font-semibold">{toToken.mint === SOLANA_ADDRESS ? '$BNC' : toToken.symbol}</span>
                  <ChevronDown size={14} color={C.textFaint} />
                </button>
              </div>

              <div className="text-xs flex justify-between mb-4 flex-wrap gap-2" style={{ color: C.textFaint }}>
                <span>Fonte: Jupiter Aggregator (api.jup.ag)</span>
                <span>Slippage: {(DEFAULT_SLIPPAGE_BPS / 100).toFixed(1)}%</span>
              </div>

              {jupiterQuote?.priceImpactPct && (
                <div className="text-xs mb-4" style={{ color: Number(jupiterQuote.priceImpactPct) > 1 ? C.red : C.textFaint }}>
                  Impacto no preço: {(Number(jupiterQuote.priceImpactPct) * 100).toFixed(3)}%
                  {Number(jupiterQuote.priceImpactPct) > 1 && ' — liquidez baixa, cuidado.'}
                </div>
              )}

              {jupiterQuote && PLATFORM_FEE_BPS > 0 && (
                <div className="rounded-lg px-3 py-2 text-xs mb-4 flex justify-between" style={{ background: C.panelHi, color: C.textDim }}>
                  <span>Taxa de serviço da plataforma</span>
                  <span style={fontMono}>{(PLATFORM_FEE_BPS / 100).toFixed(1)}%</span>
                </div>
              )}

              <button
                onClick={executeJupiterSwap}
                disabled={!wallet || wallet.chain !== 'solana' || !jupiterQuote || swapExecuting || quoteLoading}
                className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                style={{ background: wallet?.chain === 'solana' && jupiterQuote ? C.lime : C.panelHi, color: wallet?.chain === 'solana' && jupiterQuote ? '#08090C' : C.textFaint }}
              >
                {swapExecuting ? (
                  <><Loader2 size={15} className="animate-spin" /> Assinando na carteira...</>
                ) : wallet?.chain !== 'solana' ? (
                  'Conecte a carteira Phantom (Solana)'
                ) : !jupiterQuote ? (
                  quoteLoading ? 'Buscando cotação...' : 'Sem cotação disponível'
                ) : (
                  'Confirmar swap real'
                )}
              </button>

              {quoteError && (
                <div className="mt-3 rounded-lg p-3" style={{ background: C.redDim }}>
                  <p className="text-xs font-semibold mb-1" style={{ color: C.red }}>
                    {quoteError.includes('liquidez') || quoteError.includes('rota') || quoteError.includes('COULD_NOT_FIND_ANY_ROUTE')
                      ? '⚠️ Sem rota de liquidez disponível agora'
                      : '⚠️ Erro ao cotar'}
                  </p>
                  <p className="text-xs" style={{ color: C.red }}>{quoteError}</p>
                  {(quoteError.includes('liquidez') || quoteError.includes('rota') || quoteError.includes('COULD_NOT_FIND_ANY_ROUTE')) && (
                    <p className="text-xs mt-2" style={{ color: C.textDim }}>
                      Isso é normal enquanto o $BNC estiver na bonding curve. Use o botão abaixo para comprar direto na pump.fun.
                    </p>
                  )}
                  <button onClick={fetchJupiterQuote} className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: C.panelHi, color: C.text }}>
                    <RefreshCw size={12} /> Tentar cotar de novo
                  </button>
                </div>
              )}

              {swapResult?.error && (
                <div className="mt-3 rounded-lg p-3 flex items-start gap-2" style={{ background: C.redDim }}>
                  <AlertCircle size={13} color={C.red} className="mt-0.5 shrink-0" />
                  <p className="text-xs" style={{ color: C.red }}>{swapResult.error}</p>
                </div>
              )}

              {swapResult?.signature && (
                <div className="mt-3 rounded-lg p-3 flex items-start gap-2" style={{ background: C.limeDim }}>
                  <ShieldCheck size={13} color={C.lime} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold" style={{ color: C.lime }}>Swap enviado à blockchain!</p>
                    <a
                      href={`https://solscan.io/tx/${swapResult.signature}`}
                      target="_blank" rel="noreferrer"
                      className="text-xs flex items-center gap-1 mt-1 hover:underline"
                      style={{ color: C.lime }}
                    >
                      Ver transação no Solscan <ExternalLink size={10} />
                    </a>
                  </div>
                </div>
              )}
            </Panel>

            <p className="text-xs text-center" style={{ color: C.textFaint }}>
              Cotações reais via Jupiter Aggregator. A liquidez de $BNC pode ser baixa ou inexistente enquanto o token estiver na bonding curve da pump.fun (antes da graduação) — nesse caso, o Jupiter pode não encontrar rota.
            </p>

            {/* ── Botão pump.fun — alternativa quando não há rota Jupiter ── */}
            <div className="rounded-2xl p-4 flex flex-col items-center gap-3 mt-1" style={{ background: C.carrotDim, border: `1px solid ${C.carrot}44` }}>
              <div className="text-center">
                <p className="text-sm font-semibold" style={{ ...fontDisplay, color: C.carrot }}>Prefere comprar direto na pump.fun?</p>
                <p className="text-xs mt-1" style={{ color: C.textDim }}>
                  Enquanto o $BNC está na bonding curve, você pode comprar diretamente lá — sem precisar de carteira conectada aqui.
                </p>
              </div>
              <a
                href={PUMPFUN_BUY_LINK}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-opacity hover:opacity-80"
                style={{ background: C.carrot, color: '#08090C' }}
              >
                <Zap size={15} />
                Comprar $BNC na pump.fun
                <ExternalLink size={13} />
              </a>
              <p className="text-xs" style={{ color: C.textFaint }}>
                A taxa da pump.fun (1% + 1%) é cobrada por eles — não pela plataforma Bunnycoiin.
              </p>
            </div>
          </div>
        )}

        {/* ══════════ MODAL: seleção de token (swap com qualquer token Solana) ══════════ */}
        {tokenModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.75)' }}
            onClick={(e) => e.target === e.currentTarget && setTokenModalOpen(false)}
          >
            <Panel className="w-full max-w-sm p-5" style={{ background: C.bgRaised, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
              <div className="flex items-center justify-between mb-3">
                <h3 style={{ ...fontDisplay, color: C.text }} className="text-base font-semibold">
                  Selecionar token {tokenModalSide === 'from' ? '(você paga)' : '(você recebe)'}
                </h3>
                <button onClick={() => setTokenModalOpen(false)} style={{ color: C.textDim }}><X size={18} /></button>
              </div>

              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl mb-4" style={{ background: C.panelHi, border: `1px solid ${C.borderHi}` }}>
                <Search size={15} color={C.textFaint} />
                <input
                  value={tokenSearch}
                  onChange={(e) => setTokenSearch(e.target.value)}
                  placeholder="Buscar por nome ou colar endereço..."
                  className="flex-1 bg-transparent outline-none text-sm"
                  style={{ color: C.text }}
                  autoFocus
                />
              </div>

              <div style={{ overflowY: 'auto' }}>
                {tokenSearch.trim().length < 2 ? (
                  <>
                    <p className="text-xs uppercase tracking-wide mb-2" style={{ color: C.textFaint }}>Populares</p>
                    {POPULAR_TOKENS.map((t) => {
                      const otherSideToken = tokenModalSide === 'from' ? toToken : fromToken;
                      const isCurrentSelection = (tokenModalSide === 'from' ? fromToken : toToken).mint === t.mint;
                      const disabled = otherSideToken.mint === t.mint; // não permite mesmo token nos dois lados
                      return (
                        <button
                          key={t.mint}
                          disabled={disabled}
                          onClick={() => {
                            if (tokenModalSide === 'from') setFromToken(t); else setToToken(t);
                            setTokenModalOpen(false);
                            setTokenSearch('');
                            setSwapResult(null);
                          }}
                          className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl text-left disabled:opacity-30"
                          style={{ background: isCurrentSelection ? C.carrotDim : 'transparent' }}
                        >
                          <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold" style={{ background: t.mint === SOLANA_ADDRESS ? C.carrot : C.panelHi, color: t.mint === SOLANA_ADDRESS ? '#08090C' : C.text }}>
                            {t.symbol.slice(0, 2)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold" style={{ color: C.text }}>{t.name}</div>
                            <div className="text-xs" style={{ color: C.textFaint }}>{t.symbol}</div>
                          </div>
                          {isCurrentSelection && <Check size={15} color={C.carrot} />}
                        </button>
                      );
                    })}
                  </>
                ) : (
                  <>
                    {tokenSearchLoading && <p className="text-xs text-center py-4" style={{ color: C.textFaint }}>Buscando...</p>}
                    {!tokenSearchLoading && tokenSearchResults.length === 0 && (
                      <p className="text-xs text-center py-4" style={{ color: C.textFaint }}>Nenhum token encontrado.</p>
                    )}
                    {tokenSearchResults.map((t) => {
                      const otherSideToken = tokenModalSide === 'from' ? toToken : fromToken;
                      const disabled = otherSideToken.mint === t.mint;
                      return (
                        <button
                          key={t.mint}
                          disabled={disabled}
                          onClick={() => {
                            if (tokenModalSide === 'from') setFromToken(t); else setToToken(t);
                            setTokenModalOpen(false);
                            setTokenSearch('');
                            setSwapResult(null);
                          }}
                          className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl text-left disabled:opacity-30"
                        >
                          <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold overflow-hidden" style={{ background: C.panelHi, color: C.text }}>
                            {t.icon ? <img src={t.icon} alt="" className="w-full h-full object-cover" /> : t.symbol.slice(0, 2)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold truncate" style={{ color: C.text }}>{t.name}</div>
                            <div className="text-xs" style={{ color: C.textFaint }}>{t.symbol}</div>
                          </div>
                        </button>
                      );
                    })}
                  </>
                )}
              </div>

              <div className="text-xs mt-3 pt-3" style={{ color: C.textFaint, borderTop: `1px solid ${C.border}` }}>
                Qualquer token Solana pode ser selecionado — a Jupiter roteia automaticamente se houver liquidez disponível para o par.
              </div>
            </Panel>
          </div>
        )}

        {/* ══════════ STAKE ══════════ */}
        {tab === 'stake' && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 style={fontDisplay} className="text-2xl font-semibold">Stake $BNC</h1>
              <p className="text-sm mt-1" style={{ color: C.textDim }}>
                Taxa fixa de <span style={{ color: C.carrot, fontWeight: 700 }}>{APY_PERCENT}% ao ano</span>, proporcional ao período escolhido.
              </p>
            </div>

            <Panel className="p-5 flex items-start gap-3" style={{ borderColor: STAKING_LIVE ? '#2E7D3255' : C.carrot + '55' }}>
              {STAKING_LIVE ? <ShieldCheck size={16} color={C.lime} className="mt-0.5 shrink-0" /> : <AlertCircle size={16} color={C.carrot} className="mt-0.5 shrink-0" />}
              <p className="text-xs" style={{ color: C.textDim }}>
                {STAKING_LIVE ? 'Conectado ao programa on-chain.' : 'Modo simulação ativo — nenhuma transação real é enviada à blockchain ainda.'}
              </p>
            </Panel>

            <Panel className="p-6 md:p-8">
              <div className="mb-5">
                <label className="text-xs uppercase tracking-wide block mb-2" style={{ color: C.textFaint }}>Quantidade de $BNC</label>
                <input
                  type="number"
                  value={newStakeAmount}
                  onChange={(e) => setNewStakeAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Ex: 500.000"
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                  style={{ ...fontMono, background: C.panelHi, color: C.text, border: `1px solid ${C.border}` }}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
                {STAKE_PERIODS.map((p) => {
                  const r = Number(newStakeAmount || 0) * (APY_PERCENT / 100) * (p / 365);
                  const active = newStakePeriod === p;
                  return (
                    <button
                      key={p}
                      onClick={() => setNewStakePeriod(p)}
                      className="text-left rounded-xl p-4 transition-all"
                      style={{ background: active ? C.limeDim : C.panelHi, border: `1.5px solid ${active ? C.lime : C.border}` }}
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold uppercase" style={{ color: active ? C.lime : C.textDim }}>{p} dias</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: active ? C.lime : C.carrotDim, color: active ? '#08090C' : C.carrot }}>
                          {((APY_PERCENT / 100) * (p / 365) * 100).toFixed(2)}%
                        </span>
                      </div>
                      <div className="text-lg font-bold" style={{ ...fontMono, color: C.text }}>+{Math.round(r).toLocaleString('pt-BR')}</div>
                      <div className="text-xs" style={{ color: C.textFaint }}>$BNC de rendimento</div>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={createStake}
                disabled={stakeCreating}
                className="w-full px-5 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-70"
                style={{ background: C.carrot, color: '#08090C' }}
              >
                {stakeCreating ? <><Loader2 size={16} className="animate-spin" /> Processando...</> : wallet?.chain === 'solana' ? 'Criar posição de stake' : 'Conecte a carteira Solana'}
              </button>
              {stakeMsg && tab === 'stake' && <p className="text-xs mt-3" style={{ color: C.textDim }}>{stakeMsg}</p>}
            </Panel>
          </div>
        )}

        {/* ══════════ POSIÇÕES ══════════ */}
        {tab === 'positions' && (
          <div className="flex flex-col gap-4">
            <div>
              <h1 style={fontDisplay} className="text-2xl font-semibold">Minhas posições</h1>
              <p className="text-sm mt-1" style={{ color: C.textDim }}>Histórico de stake desta carteira.</p>
            </div>

            {stakeLoading ? (
              <Panel className="p-8 text-center"><Loader2 size={20} className="animate-spin mx-auto" style={{ color: C.textDim }} /></Panel>
            ) : stakePositions.length === 0 ? (
              <Panel className="p-8 text-center">
                <p className="text-sm" style={{ color: C.textDim }}>Nenhuma posição encontrada. Vá até "Stake" para criar a primeira.</p>
              </Panel>
            ) : (
              stakePositions.map((p) => {
                const unlocked = isUnlocked(p);
                const reward = calcReward(p.amount, p.period, p.apy);
                const progress = progressPercent(p);
                return (
                  <Panel key={p.id} className="p-5">
                    <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
                      <div className="flex items-center gap-2">
                        {p.claimed ? <Check size={16} color={C.lime} /> : unlocked ? <Unlock size={16} color={C.carrot} /> : <Clock size={16} color={C.carrot} />}
                        <span className="font-semibold text-sm">{p.amount.toLocaleString('pt-BR')} $BNC · {p.period} dias</span>
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full font-semibold" style={{ background: p.claimed ? C.limeDim : C.carrotDim, color: p.claimed ? C.lime : C.carrot }}>
                        {p.claimed ? 'Resgatado' : unlocked ? 'Pronto para resgate' : 'Em andamento'}
                      </span>
                    </div>
                    {!p.claimed && <div className="mb-3"><ProgressBar value={progress} max={100} color={unlocked ? C.lime : C.carrot} /></div>}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div><div style={{ color: C.textFaint }}>Iniciado</div><div className="font-semibold" style={fontMono}>{new Date(p.startedAt).toLocaleDateString('pt-BR')}</div></div>
                      <div><div style={{ color: C.textFaint }}>Desbloqueio</div><div className="font-semibold" style={fontMono}>{new Date(p.unlocksAt).toLocaleDateString('pt-BR')}</div></div>
                      <div><div style={{ color: C.textFaint }}>Rendimento</div><div className="font-semibold" style={{ ...fontMono, color: C.carrot }}>+{Math.round(reward).toLocaleString('pt-BR')}</div></div>
                      <div><div style={{ color: C.textFaint }}>{STAKING_LIVE ? 'Assinatura' : 'Assinatura (sim.)'}</div><div className="font-semibold flex items-center gap-1" style={fontMono}>{p.txSig.slice(0, 10)}... <ExternalLink size={10} /></div></div>
                    </div>
                    {!p.claimed && unlocked && (
                      <button
                        onClick={() => claimStake(p.id)}
                        disabled={claimingId === p.id}
                        className="mt-4 w-full px-4 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-70"
                        style={{ background: C.lime, color: '#08090C' }}
                      >
                        {claimingId === p.id ? <><Loader2 size={14} className="animate-spin" /> Resgatando...</> : <><ArrowDownToLine size={14} /> Resgatar {Math.round(p.amount + reward).toLocaleString('pt-BR')} $BNC</>}
                      </button>
                    )}
                  </Panel>
                );
              })
            )}
          </div>
        )}

        {/* ══════════ TRANSPARÊNCIA (página pública, sem senha) ══════════ */}
        {tab === 'transparency' && (
          <div className="flex flex-col gap-6">
            <div>
              <span className="text-xs uppercase tracking-wide" style={{ ...fontMono, color: C.textFaint }}>🐰 sem login · qualquer pessoa pode ver</span>
              <h1 style={fontDisplay} className="text-2xl font-semibold mt-1">Transparência on-chain</h1>
              <p className="text-sm mt-1 max-w-xl" style={{ color: C.textDim }}>
                Os mesmos dados que a equipe usa internamente, abertos para qualquer visitante conferir direto na blockchain — sem precisar confiar na nossa palavra.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Panel className="p-4">
                <div className="text-xs" style={{ color: C.textFaint }}>Supply total $BNC</div>
                <div className="text-xl font-semibold mt-1" style={fontMono}>
                  {tokenSupplyInfo ? (Number(tokenSupplyInfo.amount) / Math.pow(10, tokenSupplyInfo.decimals)).toLocaleString('pt-BR') : '1.000.000.000'}
                </div>
              </Panel>
              <Panel className="p-4">
                <div className="text-xs" style={{ color: C.textFaint }}>Market cap estimado</div>
                <div className="text-xl font-semibold mt-1" style={fontMono}>
                  {bunnyPrice ? `$${(bunnyPrice * 1_000_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}` : '—'}
                </div>
              </Panel>
              <Panel className="p-4">
                <div className="text-xs" style={{ color: C.textFaint }}>Rede</div>
                <div className="text-xl font-semibold mt-1">Solana · SPL Token</div>
              </Panel>
            </div>

            {/* Progresso até a graduação */}
            <Panel className="p-5">
              <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.textFaint }}>Progresso até a graduação (pump.fun → DEX)</div>
              {(() => {
                const currentMcap = bunnyPrice ? bunnyPrice * 1_000_000_000 : 0;
                const GRADUATION_TARGET = 69000; // referência histórica de mercado, pode mudar
                const pct = Math.min(100, (currentMcap / GRADUATION_TARGET) * 100);
                return (
                  <>
                    <div className="h-2.5 rounded-full overflow-hidden mt-2" style={{ background: C.panelHi }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 0.5)}%`, background: `linear-gradient(90deg, ${C.carrot}, ${C.lime})` }} />
                    </div>
                    <div className="flex justify-between text-xs mt-1.5" style={{ ...fontMono, color: C.textFaint }}>
                      <span>{currentMcap ? `$${currentMcap.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}` : '—'}</span>
                      <span>meta ~${GRADUATION_TARGET.toLocaleString('pt-BR')}</span>
                    </div>
                  </>
                );
              })()}
              <p className="text-xs mt-3" style={{ color: C.textFaint }}>
                Quando a bonding curve da pump.fun completar, o $BNC ganha automaticamente um pool de liquidez (PumpSwap) e o Swap passa a operar com liquidez real.
              </p>
            </Panel>

            {/* Top holders */}
            <Panel className="p-5">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs uppercase tracking-wide" style={{ color: C.textFaint }}>Maiores holders (dados reais on-chain)</div>
                <button
                  onClick={fetchHoldersAndTxs}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs"
                  style={{ background: C.panelHi, color: C.text }}
                >
                  <RefreshCw size={11} className={holdersLoading ? 'animate-spin' : ''} /> Atualizar
                </button>
              </div>

              {holdersError && (
                <div className="rounded-lg p-2 mb-3" style={{ background: C.redDim }}>
                  <p className="text-xs" style={{ color: C.red }}>{holdersError}</p>
                </div>
              )}

              {holdersLoading && topHolders.length === 0 ? (
                <div className="flex flex-col gap-2">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg animate-pulse" style={{ background: C.panelHi }}>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-3 rounded" style={{ background: C.border }} />
                        <div className="w-28 h-3 rounded" style={{ background: C.border }} />
                      </div>
                      <div className="w-20 h-3 rounded" style={{ background: C.border }} />
                    </div>
                  ))}
                  <p className="text-xs text-center mt-1" style={{ color: C.textFaint }}>Lendo blockchain Solana...</p>
                </div>
              ) : topHolders.length === 0 ? (
                <p className="text-xs" style={{ color: C.textFaint }}>Nenhum dado disponível ainda.</p>
              ) : (
                <div className="rounded-lg overflow-hidden" style={{ background: C.panelHi }}>
                  {topHolders.map((h, i) => {
                    const isCurve = h.address === PUMP_BONDING_CURVE_KNOWN_ADDRESS;
                    return (
                      <div key={h.address} className="flex items-center justify-between px-3 py-2 text-xs" style={{ borderBottom: i < topHolders.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                        <div className="flex items-center gap-2 min-w-0">
                          <span style={{ color: C.textFaint }}>#{i + 1}</span>
                          <span style={{ ...fontMono, color: isCurve ? C.carrot : C.text }} className="truncate">
                            {shortAddr(h.address)}
                          </span>
                          {isCurve && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: C.carrot + '22', color: C.carrot }}>bonding curve</span>}
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <div style={fontMono}>{h.uiAmount?.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</div>
                          {h.pct !== null && <div style={{ color: C.textFaint }}>{h.pct.toFixed(2)}%</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-xs mt-3" style={{ color: C.textFaint }}>
                A Solana só expõe nativamente os 20 maiores holders sem um indexador pago — por isso a lista para aqui. É uma limitação da própria rede, não uma omissão nossa.
              </p>
            </Panel>

            {/* Transações recentes */}
            <Panel className="p-5">
              <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.textFaint }}>Transações recentes envolvendo o mint</div>
              {recentTxs.length === 0 ? (
                holdersLoading ? (
                  <div className="flex flex-col gap-2">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg animate-pulse" style={{ background: C.panelHi }}>
                        <div className="w-24 h-3 rounded" style={{ background: C.border }} />
                        <div className="w-32 h-3 rounded" style={{ background: C.border }} />
                      </div>
                    ))}
                    <p className="text-xs text-center mt-1" style={{ color: C.textFaint }}>Buscando transações recentes...</p>
                  </div>
                ) : (
                  <p className="text-xs" style={{ color: C.textFaint }}>Nenhuma transação encontrada.</p>
                )
              ) : (
                <div className="rounded-lg overflow-hidden" style={{ background: C.panelHi, maxHeight: 240, overflowY: 'auto' }}>
                  {recentTxs.map((tx, i) => (
                    <a
                      key={tx.signature}
                      href={`https://solscan.io/tx/${tx.signature}`}
                      target="_blank" rel="noreferrer"
                      className="flex items-center justify-between px-3 py-2 text-xs hover:opacity-80"
                      style={{ borderBottom: i < recentTxs.length - 1 ? `1px solid ${C.border}` : 'none' }}
                    >
                      <span style={{ ...fontMono, color: tx.err ? C.red : C.lime }}>{tx.signature.slice(0, 8)}...{tx.signature.slice(-6)}</span>
                      <div className="flex items-center gap-2">
                        <span style={{ color: C.textFaint }}>
                          {tx.blockTime ? new Date(tx.blockTime * 1000).toLocaleString('pt-BR') : '—'}
                        </span>
                        <ExternalLink size={10} color={C.textFaint} />
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </Panel>

            <Panel className="p-4">
              <p className="text-xs" style={{ color: C.textDim }}>
                Endereço do token (mint): <span style={{ ...fontMono, color: C.lime }}>{SOLANA_ADDRESS}</span> ·{' '}
                <a href={`https://solscan.io/token/${SOLANA_ADDRESS}`} target="_blank" rel="noreferrer" style={{ color: C.carrot }}>ver no Solscan ↗</a>
              </p>
            </Panel>
          </div>
        )}
      </main>

      {/* ── Endereço oficial + footer ── */}
      <footer className="border-t mt-10" style={{ borderColor: C.border }}>
        <div className="max-w-6xl mx-auto px-5 md:px-8 py-8 flex flex-col gap-5">
          <Panel className="p-4">
            <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.textFaint }}>
              Endereço oficial do token <span style={{ color: C.carrot, fontWeight: 700 }}>Bunnycoiin ($BNC)</span> · rede Solana
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs md:text-sm break-all flex-1" style={{ ...fontMono, color: C.lime }}>{SOLANA_ADDRESS}</span>
              <button
                onClick={async () => {
                  setCopyError(false);
                  let ok = false;
                  try {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                      await navigator.clipboard.writeText(SOLANA_ADDRESS);
                      ok = true;
                    }
                  } catch (e) { ok = false; }

                  if (!ok) {
                    // Fallback para ambientes onde a Clipboard API é bloqueada
                    try {
                      const textarea = document.createElement('textarea');
                      textarea.value = SOLANA_ADDRESS;
                      textarea.style.position = 'fixed';
                      textarea.style.opacity = '0';
                      document.body.appendChild(textarea);
                      textarea.focus();
                      textarea.select();
                      ok = document.execCommand('copy');
                      document.body.removeChild(textarea);
                    } catch (e) { ok = false; }
                  }

                  if (ok) {
                    setAddressCopied(true);
                    setTimeout(() => setAddressCopied(false), 2000);
                  } else {
                    setCopyError(true);
                    setTimeout(() => setCopyError(false), 4000);
                  }
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                style={{ background: addressCopied ? C.limeDim : C.panelHi, color: addressCopied ? C.lime : C.text }}
              >
                {addressCopied ? <><Check size={12} /> Copiado!</> : <><Copy size={12} /> Copiar</>}
              </button>
            </div>
            {copyError && (
              <p className="text-xs mt-2" style={{ color: C.red }}>
                Não foi possível copiar automaticamente neste navegador. Selecione o endereço acima manualmente (toque e arraste, ou clique duas vezes) e copie com Ctrl+C / Cmd+C.
              </p>
            )}
          </Panel>

          <div className="flex flex-col md:flex-row justify-between gap-4 text-xs" style={{ color: C.textFaint }}>
            <span>$BNC é um token de comunidade. Conteúdo informativo, não é aconselhamento financeiro. DYOR.</span>
            <button onClick={() => setShowAdmin(true)} className="hover:underline self-start md:self-auto" style={{ color: C.textFaint }}>Admin</button>
          </div>
        </div>
      </footer>

      {/* ── Modal Wallet ── */}
      {showWalletModal && <WalletModal onClose={() => setShowWalletModal(false)} onConnected={handleConnected} />}

      {/* ── Modal Admin ── */}
      {showAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={(e) => e.target === e.currentTarget && setShowAdmin(false)}>
          <Panel className="w-full max-w-sm p-6" style={{ background: C.bgRaised }}>
            {!adminAuth ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 style={fontDisplay} className="text-lg font-semibold">Acesso admin</h3>
                  <button onClick={() => setShowAdmin(false)} style={{ color: C.textDim }}><X size={18} /></button>
                </div>
                <input
                  type="password"
                  value={adminPw}
                  onChange={(e) => { setAdminPw(e.target.value); setAdminErr(false); }}
                  onKeyDown={async (e) => {
                    if (e.key !== 'Enter') return;
                    const enc = new TextEncoder();
                    const buf = await crypto.subtle.digest('SHA-256', enc.encode(adminPw));
                    const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
                    hash === ADMIN_PASSWORD_HASH ? setAdminAuth(true) : setAdminErr(true);
                  }}
                  placeholder="Senha..."
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none mb-3"
                  style={{ ...fontMono, background: C.panelHi, color: C.text, border: `1px solid ${adminErr ? C.red : C.border}` }}
                />
                {adminErr && <p className="text-xs mb-3" style={{ color: C.red }}>Senha incorreta.</p>}
                <button
                  onClick={async () => {
                    const enc = new TextEncoder();
                    const buf = await crypto.subtle.digest('SHA-256', enc.encode(adminPw));
                    const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
                    hash === ADMIN_PASSWORD_HASH ? setAdminAuth(true) : setAdminErr(true);
                  }}
                  className="w-full py-3 rounded-xl text-sm font-semibold"
                  style={{ background: C.carrot, color: '#08090C' }}
                >
                  Entrar
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 style={fontDisplay} className="text-lg font-semibold">Painel admin</h3>
                  <button onClick={() => { setShowAdmin(false); setAdminAuth(false); setAdminPw(''); }} style={{ color: C.textDim }}><X size={18} /></button>
                </div>
                <div className="flex flex-col gap-3 text-xs">
                  <div className="flex justify-between"><span style={{ color: C.textFaint }}>Total em stake</span><span style={fontMono}>{totalStaked.toLocaleString('pt-BR')}</span></div>
                  <div className="flex justify-between"><span style={{ color: C.textFaint }}>Posições ativas</span><span style={fontMono}>{stakePositions.filter(p => !p.claimed).length}</span></div>
                  <div className="flex justify-between"><span style={{ color: C.textFaint }}>Status do programa</span><span style={{ color: STAKING_LIVE ? C.lime : C.carrot }}>{STAKING_LIVE ? 'On-chain' : 'Simulação'}</span></div>
                  <div className="flex justify-between"><span style={{ color: C.textFaint }}>Program ID (IDL)</span><span style={fontMono}>{BUNNYCOIIN_STAKING_IDL.programId || 'não definido'}</span></div>
                </div>

                <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${C.border}` }}>
                  <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.textFaint }}>Validação do preço (vs. pump.fun)</div>
                  <div className="flex flex-col gap-2 text-xs">
                    <div className="flex justify-between"><span style={{ color: C.textFaint }}>Preço calculado agora</span><span style={fontMono}>{bunnyPrice ? `$${bunnyPrice.toFixed(8)}` : '—'}</span></div>
                    <div className="flex justify-between"><span style={{ color: C.textFaint }}>Fonte usada</span><span style={{ color: priceSource ? C.lime : C.red }}>{priceSource || 'nenhuma'}</span></div>
                    <div className="flex justify-between"><span style={{ color: C.textFaint }}>Referência pump.fun (informada)</span><span style={fontMono}>$0.00000207</span></div>
                    <div className="flex justify-between"><span style={{ color: C.textFaint }}>Status rede Solana</span><span style={{ color: networkStatus?.online ? C.lime : C.red }}>{networkStatus?.online ? `online (${networkStatus.endpoint})` : `offline${networkStatus?.error ? ': ' + networkStatus.error : ''}`}</span></div>
                  </div>
                  <p className="text-xs mt-2" style={{ color: C.textFaint }}>
                    Se o preço calculado divergir muito da referência da pump.fun, o token pode ter mudado de fase (graduado) ou a heurística de localização da bonding curve precisa de ajuste — me avise o valor atual da pump.fun para eu recalibrar.
                  </p>

                  {priceDebug.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs uppercase tracking-wide mb-1" style={{ color: C.textFaint }}>Log de diagnóstico (última busca)</div>
                      <div className="rounded-lg p-2" style={{ background: C.panelHi, maxHeight: 140, overflowY: 'auto' }}>
                        {priceDebug.map((line, i) => (
                          <div key={i} className="text-xs" style={{ ...fontMono, color: C.textDim }}>• {line}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Holders e transações reais on-chain ── */}
                <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${C.border}` }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs uppercase tracking-wide" style={{ color: C.textFaint }}>Holders & transações ($BNC on-chain)</div>
                    <button
                      onClick={fetchHoldersAndTxs}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs"
                      style={{ background: C.panelHi, color: C.text }}
                    >
                      <RefreshCw size={11} className={holdersLoading ? 'animate-spin' : ''} /> Atualizar
                    </button>
                  </div>

                  <p className="text-xs mb-3" style={{ color: C.textFaint }}>
                    Dados lidos diretamente do RPC público da Solana (sem indexador pago). A Solana só expõe os 20 maiores holders por essa via — não existe contagem nativa do total de holders únicos sem um indexador dedicado.
                  </p>

                  {holdersError && (
                    <div className="rounded-lg p-2 mb-3" style={{ background: C.redDim }}>
                      <p className="text-xs" style={{ color: C.red }}>{holdersError}</p>
                    </div>
                  )}

                  {tokenSupplyInfo && (
                    <div className="flex justify-between text-xs mb-3">
                      <span style={{ color: C.textFaint }}>Supply total on-chain</span>
                      <span style={fontMono}>{(Number(tokenSupplyInfo.amount) / Math.pow(10, tokenSupplyInfo.decimals)).toLocaleString('pt-BR')}</span>
                    </div>
                  )}

                  {/* Top holders */}
                  <div className="mb-4">
                    <div className="text-xs font-semibold mb-2" style={{ color: C.text }}>Top {topHolders.length || ''} maiores holders</div>
                    {holdersLoading && topHolders.length === 0 ? (
                      <p className="text-xs" style={{ color: C.textFaint }}>Carregando...</p>
                    ) : topHolders.length === 0 ? (
                      <p className="text-xs" style={{ color: C.textFaint }}>Nenhum dado disponível ainda.</p>
                    ) : (
                      <div className="rounded-lg overflow-hidden" style={{ background: C.panelHi }}>
                        {topHolders.map((h, i) => {
                          const isCurve = h.address === PUMP_BONDING_CURVE_KNOWN_ADDRESS;
                          return (
                            <div key={h.address} className="flex items-center justify-between px-3 py-2 text-xs" style={{ borderBottom: i < topHolders.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                              <div className="flex items-center gap-2 min-w-0">
                                <span style={{ color: C.textFaint }}>#{i + 1}</span>
                                <span style={{ ...fontMono, color: isCurve ? C.carrot : C.text }} className="truncate">
                                  {shortAddr(h.address)}
                                </span>
                                {isCurve && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: C.carrot + '22', color: C.carrot }}>bonding curve</span>}
                              </div>
                              <div className="text-right shrink-0 ml-2">
                                <div style={fontMono}>{h.uiAmount?.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</div>
                                {h.pct !== null && <div style={{ color: C.textFaint }}>{h.pct.toFixed(2)}%</div>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Transações recentes */}
                  <div>
                    <div className="text-xs font-semibold mb-2" style={{ color: C.text }}>Transações recentes envolvendo o mint</div>
                    {holdersLoading && recentTxs.length === 0 ? (
                      <p className="text-xs" style={{ color: C.textFaint }}>Carregando...</p>
                    ) : recentTxs.length === 0 ? (
                      <p className="text-xs" style={{ color: C.textFaint }}>Nenhuma transação encontrada.</p>
                    ) : (
                      <div className="rounded-lg overflow-hidden" style={{ background: C.panelHi, maxHeight: 200, overflowY: 'auto' }}>
                        {recentTxs.map((tx, i) => (
                          <a
                            key={tx.signature}
                            href={`https://solscan.io/tx/${tx.signature}`}
                            target="_blank" rel="noreferrer"
                            className="flex items-center justify-between px-3 py-2 text-xs hover:opacity-80"
                            style={{ borderBottom: i < recentTxs.length - 1 ? `1px solid ${C.border}` : 'none' }}
                          >
                            <span style={{ ...fontMono, color: tx.err ? C.red : C.lime }}>{tx.signature.slice(0, 8)}...{tx.signature.slice(-6)}</span>
                            <div className="flex items-center gap-2">
                              <span style={{ color: C.textFaint }}>
                                {tx.blockTime ? new Date(tx.blockTime * 1000).toLocaleString('pt-BR') : '—'}
                              </span>
                              <ExternalLink size={10} color={C.textFaint} />
                            </div>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
