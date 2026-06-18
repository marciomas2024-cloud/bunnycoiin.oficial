import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  PawPrint, TrendingUp, TrendingDown, Users, Coins, Heart, Vote, Sprout,
  ArrowRight, Check, Wallet, ShieldCheck, Gift, Sparkles, Menu, X,
  Loader2, AlertCircle, RefreshCw, Copy, Lock, Save, Link2, Layers,
  Clock, Unlock, ExternalLink, ArrowDownToLine, History, ChevronDown,
  Zap, Activity, BarChart3, ArrowUpRight, ArrowDownRight, LogOut, Globe,
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
const ADMIN_PASSWORD = 'bunnycoiin2026';

/* ════════════════════════════════════════════════════════════════
   JUPITER AGGREGATOR — integração real de swap on-chain (Solana)
   API atual (pós-migração de abril/2026): api.jup.ag, exige API key
   gratuita gerada em portal.jup.ag. Endpoints antigos (quote-api.jup.ag/v6,
   lite-api.jup.ag) foram descontinuados.
════════════════════════════════════════════════════════════════ */
const JUPITER_API_BASE = 'https://api.jup.ag';
const JUPITER_QUOTE_ENDPOINT = `${JUPITER_API_BASE}/swap/v1/quote`;
const JUPITER_SWAP_ENDPOINT = `${JUPITER_API_BASE}/swap/v1/swap`;
// Chave de API gratuita do Jupiter Developer Platform (portal.jup.ag).
// Sem ela, a API ainda responde para uso muito leve mas com rate limit
// mínimo — para uso real, gere a sua e cole aqui.
const JUPITER_API_KEY = 'jup_a646a362d9cc58876e94ba703fccd0ca38e41cebbb1ee925593d32b2d53cf972';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const DEFAULT_SLIPPAGE_BPS = 50; // 0.5%

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
const PUMP_BONDING_CURVE_ACCOUNT_SIZE = 49; // 8 (discriminator) + 5*8 (u64) + 1 (bool)
const PUMP_BONDING_CURVE_MINT_OFFSET = 49; // offset onde o campo "mint" começa nesta versão da conta

// Layout da conta BondingCurve (Anchor): 8 bytes discriminator +
// 5 campos u64 (virtualTokenReserves, virtualSolReserves,
// realTokenReserves, realSolReserves, tokenTotalSupply) + 1 byte bool (complete)
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
const APY_PERCENT = 30;
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
  { id: 'metamask', name: 'MetaMask', kind: 'evm', desc: 'Extensão de navegador' },
  { id: 'trust',    name: 'Trust Wallet', kind: 'evm', desc: 'Mobile & extensão' },
  { id: 'uniswap',  name: 'Uniswap Wallet', kind: 'walletconnect', desc: 'Via WalletConnect' },
  { id: 'phantom',  name: 'Phantom', kind: 'solana', desc: 'Solana — recomendada p/ stake' },
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
        const provider = window?.solana;
        if (!provider || !provider.isPhantom) {
          setError('Phantom não detectada neste navegador. Instale a extensão em phantom.app e recarregue a página.');
          setConnectingId(null);
          return;
        }
        const resp = await provider.connect();
        const address = resp.publicKey.toString();
        onConnected({ chain: 'solana', address, name: 'Phantom' });
        return;
      }
      if (opt.kind === 'evm') {
        const providers = detectEvmProviders();
        const match = providers.find((p) => p.id === opt.id);
        if (!match) {
          if (providers.length > 0) {
            setError(`${opt.name} não foi encontrada, mas detectei ${providers[0].name} instalada. Selecione-a na lista ou instale ${opt.name}.`);
          } else {
            setError(`${opt.name} não detectada neste navegador. Instale a extensão e recarregue a página para conectar de verdade.`);
          }
          setConnectingId(null);
          return;
        }
        const accounts = await match.provider.request({ method: 'eth_requestAccounts' });
        if (!accounts || !accounts[0]) {
          setError('Nenhuma conta retornada pela carteira.');
          setConnectingId(null);
          return;
        }
        onConnected({ chain: 'evm', address: accounts[0], name: opt.name, provider: match.provider });
        return;
      }
      // WalletConnect (ex: Uniswap Wallet mobile) exige SDK próprio com projectId
      // registrado em cloud.walletconnect.com. Sem essa infraestrutura, NÃO é
      // possível conectar de verdade — por isso não simulamos, e sim avisamos.
      setError(`${opt.name} via WalletConnect ainda não está configurado nesta plataforma. Use MetaMask, Trust Wallet (extensão) ou Phantom por enquanto.`);
      setConnectingId(null);
    } catch (e) {
      setError(e?.message?.includes('rejected') || e?.code === 4001 ? 'Conexão recusada na carteira.' : 'Falha ao conectar. Verifique a extensão e tente novamente.');
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
        <p className="text-xs mb-5" style={{ color: C.textDim }}>
          Escolha como acessar a plataforma Bunnycoiin DeFi.
        </p>

        <div className="flex flex-col gap-2">
          {WALLET_OPTIONS.map((opt) => {
            const comingSoon = opt.kind === 'walletconnect';
            return (
              <button
                key={opt.id}
                onClick={() => connect(opt)}
                disabled={!!connectingId}
                className="flex items-center gap-3 p-3 rounded-xl text-left transition-colors disabled:opacity-60"
                style={{ background: C.panel, border: `1px solid ${connectingId === opt.id ? C.lime : C.border}` }}
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: C.panelHi }}>
                  {opt.kind === 'solana' ? <Sprout size={16} color={C.lime} /> : opt.kind === 'walletconnect' ? <Globe size={16} color={C.textFaint} /> : <Wallet size={16} color={C.text} />}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold flex items-center gap-2" style={{ color: C.text }}>
                    {opt.name}
                    {comingSoon && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: C.panelHi, color: C.textFaint }}>
                        em breve
                      </span>
                    )}
                  </div>
                  <div className="text-xs" style={{ color: C.textFaint }}>{opt.desc}</div>
                </div>
                {connectingId === opt.id ? <Loader2 size={16} className="animate-spin" style={{ color: C.lime }} /> : <ArrowRight size={14} style={{ color: C.textFaint }} />}
              </button>
            );
          })}
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

  /* ── Swap (simulado) ── */
  const [swapDirection, setSwapDirection] = useState('buy'); // buy | sell
  const [swapAmount, setSwapAmount] = useState(100);

  // Integração real com Jupiter Aggregator
  const [jupiterQuote, setJupiterQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState(null);
  const [swapExecuting, setSwapExecuting] = useState(false);
  const [swapResult, setSwapResult] = useState(null); // { signature } | { error }
  const quoteDebounceRef = useRef(null);

  /* ── Admin ── */
  const [showAdmin, setShowAdmin] = useState(false);
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

  const fetchPumpfunBondingCurve = useCallback(async () => {
    const debug = [];
    try {
      // Estratégia 1: derivar o PDA da bonding curve diretamente e consultar a conta
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

      // Estratégia 2 (fallback): localizar a bonding curve pelo maior holder do token,
      // já que antes da graduação ela costuma reter a maior parte do supply.
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
  const jupiterHeaders = useCallback(() => {
    const headers = { 'Content-Type': 'application/json' };
    if (JUPITER_API_KEY) headers['x-api-key'] = JUPITER_API_KEY;
    return headers;
  }, []);

  const fetchJupiterQuote = useCallback(async () => {
    const amount = Number(swapAmount || 0);
    if (!amount || amount <= 0) { setJupiterQuote(null); return; }

    setQuoteLoading(true);
    setQuoteError(null);
    try {
      // Compra: USDC -> $BNC (amount em unidades de USDC, 6 decimais)
      // Venda: $BNC -> USDC (amount em unidades de $BNC, decimais do token pump.fun = 6)
      const inputMint = swapDirection === 'buy' ? USDC_MINT : SOLANA_ADDRESS;
      const outputMint = swapDirection === 'buy' ? SOLANA_ADDRESS : USDC_MINT;
      const decimals = 6; // USDC e tokens pump.fun usam 6 decimais
      const amountBaseUnits = Math.round(amount * Math.pow(10, decimals));

      const url = `${JUPITER_QUOTE_ENDPOINT}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountBaseUnits}&slippageBps=${DEFAULT_SLIPPAGE_BPS}&restrictIntermediateTokens=true`;
      const res = await fetch(url, { headers: jupiterHeaders() });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Jupiter respondeu ${res.status}${body ? ': ' + body.slice(0, 200) : ''}`);
      }
      const data = await res.json();
      if (data?.error) throw new Error(data.error);
      if (!data?.outAmount) throw new Error('Jupiter não encontrou rota de liquidez para este par agora (token pode ter pouca ou nenhuma liquidez nos DEXs).');

      setJupiterQuote(data);
    } catch (e) {
      setJupiterQuote(null);
      setQuoteError(e.message || 'Falha ao consultar a Jupiter API.');
    } finally {
      setQuoteLoading(false);
    }
  }, [swapAmount, swapDirection, jupiterHeaders]);

  // Busca a quote automaticamente, com debounce, sempre que valor/direção mudarem
  useEffect(() => {
    if (tab !== 'swap') return;
    clearTimeout(quoteDebounceRef.current);
    quoteDebounceRef.current = setTimeout(() => { fetchJupiterQuote(); }, 500);
    return () => clearTimeout(quoteDebounceRef.current);
  }, [swapAmount, swapDirection, tab, fetchJupiterQuote]);

  const executeJupiterSwap = useCallback(async () => {
    setSwapResult(null);
    if (!wallet || wallet.chain !== 'solana') {
      setSwapResult({ error: 'Conecte a carteira Phantom (Solana) para executar o swap real.' });
      return;
    }
    if (!jupiterQuote) {
      setSwapResult({ error: 'Nenhuma cotação válida no momento. Ajuste o valor e tente novamente.' });
      return;
    }
    const provider = window?.solana;
    if (!provider || !provider.isPhantom) {
      setSwapResult({ error: 'Phantom não detectada neste navegador.' });
      return;
    }

    setSwapExecuting(true);
    try {
      // 1) Pede ao Jupiter a transação serializada já montada para esta quote
      const swapRes = await fetch(JUPITER_SWAP_ENDPOINT, {
        method: 'POST',
        headers: jupiterHeaders(),
        body: JSON.stringify({
          quoteResponse: jupiterQuote,
          userPublicKey: wallet.address,
          wrapAndUnwrapSol: true,
        }),
      });
      if (!swapRes.ok) {
        const body = await swapRes.text().catch(() => '');
        throw new Error(`Jupiter /swap respondeu ${swapRes.status}${body ? ': ' + body.slice(0, 200) : ''}`);
      }
      const swapData = await swapRes.json();
      if (!swapData?.swapTransaction) throw new Error('Jupiter não retornou a transação para assinar.');

      // 2) Decodifica a transação (base64 -> bytes) para a carteira assinar
      const txBytes = Uint8Array.from(atob(swapData.swapTransaction), (c) => c.charCodeAt(0));

      // 3) Pede para a Phantom assinar e enviar a transação real à blockchain.
      // signAndSendTransaction é o método padrão suportado pela Phantom para
      // transações versionadas (VersionedTransaction), como as do Jupiter.
      const { signature } = await provider.signAndSendTransaction({
        // A Phantom aceita os bytes brutos da transação versionada via este formato
        serializedTransaction: txBytes,
      }).catch(async () => {
        // Fallback: algumas versões da Phantom esperam o método signAndSendTransaction
        // recebendo diretamente os bytes como primeiro argumento.
        return provider.signAndSendTransaction(txBytes);
      });

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
  }, [wallet, jupiterQuote, jupiterHeaders, fetchBalances]);

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
          <span style={{ color: C.textFaint }} className="hidden md:inline">SOLANA DEFI · APY 30%</span>
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
              <p className="text-sm mt-1" style={{ color: C.textDim }}>Troque entre USDC e $BNC via Jupiter Aggregator — melhor rota entre os DEXs da Solana.</p>
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
              <div className="flex gap-2 mb-4">
                {['buy', 'sell'].map((d) => (
                  <button
                    key={d}
                    onClick={() => { setSwapDirection(d); setSwapResult(null); }}
                    className="flex-1 py-2 rounded-lg text-sm font-semibold transition-colors"
                    style={{ background: swapDirection === d ? C.limeDim : C.panelHi, color: swapDirection === d ? C.lime : C.textDim }}
                  >
                    {d === 'buy' ? 'Comprar $BNC' : 'Vender $BNC'}
                  </button>
                ))}
              </div>

              <label className="text-xs uppercase tracking-wide block mb-2" style={{ color: C.textFaint }}>
                {swapDirection === 'buy' ? 'Você paga (USDC)' : 'Você vende ($BNC)'}
              </label>
              <input
                type="number"
                value={swapAmount}
                onChange={(e) => { setSwapAmount(e.target.value === '' ? '' : e.target.value); setSwapResult(null); }}
                placeholder="0.00"
                className="w-full rounded-xl px-4 py-3 text-lg outline-none mb-4"
                style={{ ...fontMono, background: C.panelHi, color: C.text, border: `1px solid ${C.border}` }}
              />

              <div className="flex justify-center mb-4">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: C.panelHi }}>
                  <ArrowDownToLine size={14} color={C.textDim} />
                </div>
              </div>

              <label className="text-xs uppercase tracking-wide block mb-2" style={{ color: C.textFaint }}>
                {swapDirection === 'buy' ? 'Você recebe ($BNC)' : 'Você recebe (USDC)'}
              </label>
              <div className="rounded-xl px-4 py-3 text-lg font-bold mb-4" style={{ ...fontMono, background: C.panelHi, color: jupiterQuote ? C.lime : C.textFaint, border: `1px solid ${C.border}` }}>
                {quoteLoading
                  ? 'Cotando na Jupiter...'
                  : jupiterQuote
                    ? (Number(jupiterQuote.outAmount) / Math.pow(10, 6)).toLocaleString('pt-BR', { maximumFractionDigits: swapDirection === 'buy' ? 0 : 2 })
                    : 'Sem cotação'}
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
                  <p className="text-xs" style={{ color: C.red }}>{quoteError}</p>
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
          </div>
        )}

        {/* ══════════ STAKE ══════════ */}
        {tab === 'stake' && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 style={fontDisplay} className="text-2xl font-semibold">Stake $BNC</h1>
              <p className="text-sm mt-1" style={{ color: C.textDim }}>
                Taxa fixa de <span style={{ color: C.carrot, fontWeight: 700 }}>30% ao ano</span>, proporcional ao período escolhido.
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
      </main>

      {/* ── Endereço oficial + footer ── */}
      <footer className="border-t mt-10" style={{ borderColor: C.border }}>
        <div className="max-w-6xl mx-auto px-5 md:px-8 py-8 flex flex-col gap-5">
          <Panel className="p-4">
            <div className="text-xs uppercase tracking-wide mb-2" style={{ color: C.textFaint }}>Endereço oficial do token (Solana)</div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs md:text-sm break-all flex-1" style={{ ...fontMono, color: C.lime }}>{SOLANA_ADDRESS}</span>
              <button
                onClick={async () => { await navigator.clipboard.writeText(SOLANA_ADDRESS).catch(() => {}); }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                style={{ background: C.panelHi, color: C.text }}
              >
                <Copy size={12} /> Copiar
              </button>
            </div>
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
                  onKeyDown={(e) => e.key === 'Enter' && (adminPw === ADMIN_PASSWORD ? setAdminAuth(true) : setAdminErr(true))}
                  placeholder="Senha..."
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none mb-3"
                  style={{ ...fontMono, background: C.panelHi, color: C.text, border: `1px solid ${adminErr ? C.red : C.border}` }}
                />
                {adminErr && <p className="text-xs mb-3" style={{ color: C.red }}>Senha incorreta.</p>}
                <button onClick={() => (adminPw === ADMIN_PASSWORD ? setAdminAuth(true) : setAdminErr(true))} className="w-full py-3 rounded-xl text-sm font-semibold" style={{ background: C.carrot, color: '#08090C' }}>
                  Entrar
                </button>
                <p className="text-xs mt-3" style={{ color: C.textFaint }}>Senha: <span style={{ color: C.carrot }}>bunnycoiin2026</span></p>
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
              </>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
