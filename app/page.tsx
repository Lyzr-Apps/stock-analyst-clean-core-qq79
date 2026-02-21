'use client'

import { useState, useEffect, useCallback } from 'react'
import { callAIAgent } from '@/lib/aiAgent'
import {
  RiDashboardLine,
  RiHistoryLine,
  RiSettings4Line,
  RiStockLine,
  RiArrowUpLine,
  RiAlertLine,
  RiMailSendLine,
  RiCloseLine,
  RiAddLine,
  RiSearchLine,
  RiRefreshLine,
  RiDownloadLine,
  RiCheckLine,
  RiErrorWarningLine,
  RiTimeLine,
  RiBarChartLine,
  RiLineChartLine,
  RiPulseLine,
} from 'react-icons/ri'
import { FiChevronDown, FiChevronUp, FiTrendingUp, FiTrendingDown, FiMinus } from 'react-icons/fi'

// ─── Agent IDs ───────────────────────────────────────────────────────────────
const ANALYSIS_COORDINATOR_ID = '6999621e8cfc4d116987bcb7'
const EMAIL_ALERT_AGENT_ID = '69996230730bbd74d53e8a63'

// ─── TypeScript Interfaces ───────────────────────────────────────────────────
interface StockAnalysis {
  ticker: string
  company_name: string
  current_price: string
  technical_score: string
  technical_signal: string
  fundamental_score: string
  fundamental_assessment: string
  overall_score: string
  recommendation: string
  confidence: string
  technical_highlights: string[]
  fundamental_highlights: string[]
  risk_factors: string[]
  conflicting_signals: string
}

interface AnalysisResult {
  stocks: StockAnalysis[]
  analysis_summary: string
  market_context: string
  timestamp?: string
}

interface AlertHistoryItem {
  id: string
  date: string
  analysis: AnalysisResult
  emailSent: boolean
  emailRecipient?: string
}

interface AppSettings {
  recipientEmail: string
  emailFormat: 'detailed' | 'summary'
  defaultCriteria: {
    rsiThreshold: number
    maCrossover: string
    volumeSpike: number
    maxPE: number
    minRevenueGrowth: number
    maxDebtToEquity: number
  }
}

type ActiveScreen = 'dashboard' | 'history' | 'settings'

// ─── Robust JSON Parsing ─────────────────────────────────────────────────────
function parseAgentResponse(result: any): any {
  try {
    if (!result) return null
    let data = result?.response?.result
    if (!data && result?.response?.message) {
      try {
        data = JSON.parse(result.response.message)
      } catch (_e) {
        /* ignore */
      }
    }
    if (!data && result?.raw_response) {
      try {
        const raw = JSON.parse(result.raw_response)
        data = raw?.response?.result || raw?.result || raw
      } catch (_e) {
        /* ignore */
      }
    }
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data)
      } catch (_e) {
        /* keep as string */
      }
    }
    if (data?.result && typeof data.result === 'object' && !Array.isArray(data.result)) {
      data = data.result
    }
    if (data?.response?.result) {
      data = data.response.result
    }
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data)
      } catch (_e) {
        /* keep as string */
      }
    }
    return data
  } catch (_e) {
    return null
  }
}

function safeArray(val: any): string[] {
  if (Array.isArray(val)) return val.filter((v) => typeof v === 'string')
  return []
}

function safeNumber(val: any): number {
  if (typeof val === 'number') return val
  const n = parseFloat(String(val || '0').replace(/[^0-9.\-]/g, ''))
  return isNaN(n) ? 0 : n
}

// ─── Default Settings ────────────────────────────────────────────────────────
const DEFAULT_SETTINGS: AppSettings = {
  recipientEmail: '',
  emailFormat: 'detailed',
  defaultCriteria: {
    rsiThreshold: 30,
    maCrossover: 'Any',
    volumeSpike: 50,
    maxPE: 25,
    minRevenueGrowth: 10,
    maxDebtToEquity: 1.5,
  },
}

// ─── Score Gauge Component ───────────────────────────────────────────────────
function ScoreGauge({ score, label }: { score: number; label: string }) {
  const getColor = (s: number) => {
    if (s >= 67) return 'bg-green-500'
    if (s >= 34) return 'bg-yellow-500'
    return 'bg-red-500'
  }
  const getBgColor = (s: number) => {
    if (s >= 67) return 'bg-green-500/20'
    if (s >= 34) return 'bg-yellow-500/20'
    return 'bg-red-500/20'
  }

  return (
    <div className="flex-1">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
        <span className="text-xs font-semibold text-foreground">{score}/100</span>
      </div>
      <div className={`w-full h-2.5 rounded-full ${getBgColor(score)}`}>
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${getColor(score)}`}
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>
    </div>
  )
}

// ─── Recommendation Badge ────────────────────────────────────────────────────
function RecommendationBadge({ recommendation }: { recommendation: string }) {
  const rec = recommendation?.toLowerCase() || ''
  if (rec.includes('buy')) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/30">
        <FiTrendingUp className="w-3.5 h-3.5" /> BUY
      </span>
    )
  }
  if (rec.includes('sell')) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">
        <FiTrendingDown className="w-3.5 h-3.5" /> SELL
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
      <FiMinus className="w-3.5 h-3.5" /> HOLD
    </span>
  )
}

// ─── Skeleton Loader ─────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-card p-6 animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="h-7 bg-muted rounded w-28" />
        <div className="h-7 bg-muted rounded-full w-20" />
      </div>
      <div className="h-4 bg-muted rounded w-32 mb-4" />
      <div className="flex gap-4 mb-4">
        <div className="flex-1 h-10 bg-muted rounded" />
        <div className="flex-1 h-10 bg-muted rounded" />
      </div>
      <div className="space-y-2">
        <div className="h-3 bg-muted rounded w-full" />
        <div className="h-3 bg-muted rounded w-3/4" />
        <div className="h-3 bg-muted rounded w-5/6" />
      </div>
    </div>
  )
}

// ─── Loading Messages ────────────────────────────────────────────────────────
const LOADING_MESSAGES = [
  'Analyzing technical patterns...',
  'Evaluating moving averages & RSI...',
  'Scanning MACD signals...',
  'Researching fundamentals...',
  'Comparing P/E ratios...',
  'Evaluating revenue growth...',
  'Assessing debt levels...',
  'Generating recommendations...',
  'Aggregating analysis results...',
]

// ─── Collapsible Section ─────────────────────────────────────────────────────
function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-secondary/50 hover:bg-secondary transition-colors text-sm font-semibold text-foreground"
      >
        {title}
        {open ? <FiChevronUp className="w-4 h-4" /> : <FiChevronDown className="w-4 h-4" />}
      </button>
      {open && <div className="px-4 py-3 space-y-3">{children}</div>}
    </div>
  )
}

// ─── Main Page Component ─────────────────────────────────────────────────────
export default function Page() {
  // Navigation
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('dashboard')

  // Dashboard state
  const [tickers, setTickers] = useState<string[]>([])
  const [tickerInput, setTickerInput] = useState('')
  const [rsiThreshold, setRsiThreshold] = useState(30)
  const [maCrossover, setMaCrossover] = useState('Any')
  const [volumeSpike, setVolumeSpike] = useState(50)
  const [maxPE, setMaxPE] = useState(25)
  const [minRevenueGrowth, setMinRevenueGrowth] = useState(10)
  const [maxDebtToEquity, setMaxDebtToEquity] = useState(1.5)

  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0)

  // Email state
  const [emailingTicker, setEmailingTicker] = useState<string | null>(null)
  const [emailInput, setEmailInput] = useState('')
  const [emailStatus, setEmailStatus] = useState<Record<string, { status: string; message: string }>>({})
  const [showEmailInput, setShowEmailInput] = useState<string | null>(null)

  // History
  const [alertHistory, setAlertHistory] = useState<AlertHistoryItem[]>([])
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null)
  const [historyFilter, setHistoryFilter] = useState({ ticker: '', recommendation: 'All', from: '', to: '' })

  // Settings
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [settingsSaved, setSettingsSaved] = useState(false)

  // ─── Load from localStorage ──────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem('stockpulse_history')
      if (saved) setAlertHistory(JSON.parse(saved))
    } catch (_e) { /* ignore */ }
    try {
      const savedSettings = localStorage.getItem('stockpulse_settings')
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings)
        setSettings(parsed)
        setRsiThreshold(parsed.defaultCriteria?.rsiThreshold ?? 30)
        setMaCrossover(parsed.defaultCriteria?.maCrossover ?? 'Any')
        setVolumeSpike(parsed.defaultCriteria?.volumeSpike ?? 50)
        setMaxPE(parsed.defaultCriteria?.maxPE ?? 25)
        setMinRevenueGrowth(parsed.defaultCriteria?.minRevenueGrowth ?? 10)
        setMaxDebtToEquity(parsed.defaultCriteria?.maxDebtToEquity ?? 1.5)
        if (parsed.recipientEmail) setEmailInput(parsed.recipientEmail)
      }
    } catch (_e) { /* ignore */ }
  }, [])

  // ─── Save history to localStorage ────────────────────────────────────────
  useEffect(() => {
    try {
      localStorage.setItem('stockpulse_history', JSON.stringify(alertHistory))
    } catch (_e) { /* ignore */ }
  }, [alertHistory])

  // ─── Loading message rotation ────────────────────────────────────────────
  useEffect(() => {
    if (!isAnalyzing) return
    const interval = setInterval(() => {
      setLoadingMsgIndex((prev) => (prev + 1) % LOADING_MESSAGES.length)
    }, 2500)
    return () => clearInterval(interval)
  }, [isAnalyzing])

  // ─── Add Ticker ──────────────────────────────────────────────────────────
  const addTicker = useCallback(() => {
    const t = tickerInput.trim().toUpperCase()
    if (t && !tickers.includes(t)) {
      setTickers((prev) => [...prev, t])
    }
    setTickerInput('')
  }, [tickerInput, tickers])

  const removeTicker = useCallback((ticker: string) => {
    setTickers((prev) => prev.filter((t) => t !== ticker))
  }, [])

  // ─── Run Analysis ────────────────────────────────────────────────────────
  const runAnalysis = useCallback(async () => {
    if (tickers.length === 0) {
      setAnalysisError('Please add at least one stock ticker to analyze.')
      return
    }
    setIsAnalyzing(true)
    setAnalysisError(null)
    setAnalysisResult(null)
    setLoadingMsgIndex(0)

    const message = `Analyze the following stocks: ${tickers.join(', ')}.
Technical criteria: RSI below ${rsiThreshold}, look for ${maCrossover} crossover patterns, volume spike above ${volumeSpike}%.
Fundamental criteria: P/E under ${maxPE}, revenue growth above ${minRevenueGrowth}%, debt-to-equity below ${maxDebtToEquity}.
Provide a comprehensive analysis with buy/hold/sell recommendations for each stock.`

    try {
      const result = await callAIAgent(message, ANALYSIS_COORDINATOR_ID)
      const data = parseAgentResponse(result)

      if (data && data.stocks) {
        const analysisData: AnalysisResult = {
          stocks: Array.isArray(data.stocks) ? data.stocks.map((s: any) => ({
            ticker: s.ticker || '',
            company_name: s.company_name || s.ticker || '',
            current_price: s.current_price || 'N/A',
            technical_score: s.technical_score || '0',
            technical_signal: s.technical_signal || 'Neutral',
            fundamental_score: s.fundamental_score || '0',
            fundamental_assessment: s.fundamental_assessment || 'N/A',
            overall_score: s.overall_score || '0',
            recommendation: s.recommendation || 'Hold',
            confidence: s.confidence || '0',
            technical_highlights: safeArray(s.technical_highlights),
            fundamental_highlights: safeArray(s.fundamental_highlights),
            risk_factors: safeArray(s.risk_factors),
            conflicting_signals: s.conflicting_signals || '',
          })) : [],
          analysis_summary: data.analysis_summary || '',
          market_context: data.market_context || '',
          timestamp: new Date().toISOString(),
        }
        setAnalysisResult(analysisData)
        // Save to history
        const historyItem: AlertHistoryItem = {
          id: Date.now().toString(),
          date: new Date().toISOString(),
          analysis: analysisData,
          emailSent: false,
        }
        setAlertHistory((prev) => [historyItem, ...prev])
      } else {
        setAnalysisError('Unable to parse analysis results. The agent returned an unexpected format. Please try again.')
      }
    } catch (err: any) {
      setAnalysisError(err?.message || 'Analysis failed. Please try again.')
    } finally {
      setIsAnalyzing(false)
    }
  }, [tickers, rsiThreshold, maCrossover, volumeSpike, maxPE, minRevenueGrowth, maxDebtToEquity])

  // ─── Send Email Alert ────────────────────────────────────────────────────
  const sendEmailAlert = useCallback(async (stock: StockAnalysis, email: string) => {
    if (!email.trim()) return
    setEmailingTicker(stock.ticker)
    setEmailStatus((prev) => ({
      ...prev,
      [stock.ticker]: { status: 'sending', message: 'Sending email...' },
    }))

    const message = `Send the following stock analysis alert to ${email}:

Stock: ${stock.ticker} (${stock.company_name})
Current Price: ${stock.current_price}
Recommendation: ${stock.recommendation}
Confidence: ${stock.confidence}
Technical Score: ${stock.technical_score}/100 - Signal: ${stock.technical_signal}
Fundamental Score: ${stock.fundamental_score}/100 - Assessment: ${stock.fundamental_assessment}
Overall Score: ${stock.overall_score}/100

Technical Highlights:
${safeArray(stock.technical_highlights).map((h) => `- ${h}`).join('\n')}

Fundamental Highlights:
${safeArray(stock.fundamental_highlights).map((h) => `- ${h}`).join('\n')}

Risk Factors:
${safeArray(stock.risk_factors).map((r) => `- ${r}`).join('\n')}

${stock.conflicting_signals ? `Conflicting Signals: ${stock.conflicting_signals}` : ''}

Please format this as a professional investment alert email and send it to ${email}.`

    try {
      const result = await callAIAgent(message, EMAIL_ALERT_AGENT_ID)
      if (result.success) {
        setEmailStatus((prev) => ({
          ...prev,
          [stock.ticker]: { status: 'success', message: `Alert sent to ${email}` },
        }))
        // Update history
        setAlertHistory((prev) =>
          prev.map((item) => {
            if (item.analysis.stocks.some((s) => s.ticker === stock.ticker) && !item.emailSent) {
              return { ...item, emailSent: true, emailRecipient: email }
            }
            return item
          })
        )
      } else {
        setEmailStatus((prev) => ({
          ...prev,
          [stock.ticker]: { status: 'error', message: result.error || 'Failed to send email' },
        }))
      }
    } catch (err: any) {
      setEmailStatus((prev) => ({
        ...prev,
        [stock.ticker]: { status: 'error', message: err?.message || 'Failed to send email' },
      }))
    } finally {
      setEmailingTicker(null)
      setShowEmailInput(null)
    }
  }, [])

  // ─── Save Settings ───────────────────────────────────────────────────────
  const saveSettings = useCallback(() => {
    try {
      localStorage.setItem('stockpulse_settings', JSON.stringify(settings))
      setSettingsSaved(true)
      setTimeout(() => setSettingsSaved(false), 3000)
    } catch (_e) { /* ignore */ }
  }, [settings])

  // ─── Export History as CSV ─────────────────────────────────────────────────
  const exportCSV = useCallback(() => {
    const rows = [['Date', 'Ticker', 'Company', 'Recommendation', 'Confidence', 'Overall Score', 'Email Sent']]
    alertHistory.forEach((item) => {
      if (Array.isArray(item.analysis.stocks)) {
        item.analysis.stocks.forEach((s) => {
          rows.push([
            new Date(item.date).toLocaleDateString(),
            s.ticker,
            s.company_name,
            s.recommendation,
            s.confidence,
            s.overall_score,
            item.emailSent ? 'Yes' : 'No',
          ])
        })
      }
    })
    const csv = rows.map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `stockpulse_history_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [alertHistory])

  // ─── Filter History ────────────────────────────────────────────────────────
  const filteredHistory = alertHistory.filter((item) => {
    if (historyFilter.ticker) {
      const match = Array.isArray(item.analysis.stocks)
        ? item.analysis.stocks.some((s) => s.ticker.toLowerCase().includes(historyFilter.ticker.toLowerCase()))
        : false
      if (!match) return false
    }
    if (historyFilter.recommendation !== 'All') {
      const match = Array.isArray(item.analysis.stocks)
        ? item.analysis.stocks.some((s) => s.recommendation?.toLowerCase().includes(historyFilter.recommendation.toLowerCase()))
        : false
      if (!match) return false
    }
    if (historyFilter.from) {
      if (new Date(item.date) < new Date(historyFilter.from)) return false
    }
    if (historyFilter.to) {
      if (new Date(item.date) > new Date(historyFilter.to + 'T23:59:59')) return false
    }
    return true
  })

  // ─── Sidebar Navigation ────────────────────────────────────────────────────
  const navItems: { id: ActiveScreen; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <RiDashboardLine className="w-5 h-5" /> },
    { id: 'history', label: 'Alert History', icon: <RiHistoryLine className="w-5 h-5" /> },
    { id: 'settings', label: 'Settings', icon: <RiSettings4Line className="w-5 h-5" /> },
  ]

  return (
    <div className="flex min-h-screen bg-background">
      {/* ─── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className="w-[260px] min-h-screen bg-[hsl(160,30%,5%)] border-r border-[hsl(160,22%,12%)] flex flex-col fixed left-0 top-0 z-30">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-[hsl(160,22%,12%)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[hsl(160,70%,40%)] flex items-center justify-center">
              <RiPulseLine className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">StockPulse</h1>
              <p className="text-[10px] text-muted-foreground tracking-wider uppercase">AI Market Analysis</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveScreen(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeScreen === item.id
                  ? 'bg-[hsl(160,22%,12%)] text-[hsl(160,70%,40%)]'
                  : 'text-muted-foreground hover:text-foreground hover:bg-[hsl(160,22%,12%)]/50'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[hsl(160,22%,12%)]">
          <p className="text-[10px] text-muted-foreground">Powered by AI Analysis</p>
        </div>
      </aside>

      {/* ─── Main Content ─────────────────────────────────────────────────── */}
      <main className="flex-1 ml-[260px]">
        {/* Top Header */}
        <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RiStockLine className="w-5 h-5 text-[hsl(160,70%,40%)]" />
            <h2 className="text-sm font-semibold text-foreground">
              {activeScreen === 'dashboard' && 'Dashboard'}
              {activeScreen === 'history' && 'Alert History'}
              {activeScreen === 'settings' && 'Settings'}
            </h2>
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <RiTimeLine className="w-3.5 h-3.5" />
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        </header>

        <div className="p-6">
          {/* ═══════════════════════════════════════════════════════════════════
              DASHBOARD SCREEN
              ═══════════════════════════════════════════════════════════════════ */}
          {activeScreen === 'dashboard' && (
            <div className="flex gap-6">
              {/* Left Column: Watchlist & Criteria */}
              <div className="w-[40%] space-y-4 flex-shrink-0">
                {/* Watchlist */}
                <div className="rounded-xl border border-border bg-card p-5">
                  <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                    <RiBarChartLine className="w-4 h-4 text-[hsl(160,70%,40%)]" />
                    Watchlist
                  </h3>
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      value={tickerInput}
                      onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === 'Enter' && addTicker()}
                      placeholder="Enter ticker (e.g. AAPL)"
                      className="flex-1 px-3 py-2 rounded-lg bg-[hsl(160,22%,20%)] border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(160,70%,40%)] transition-all"
                    />
                    <button
                      onClick={addTicker}
                      className="px-3 py-2 rounded-lg bg-[hsl(160,70%,40%)] text-white text-sm font-medium hover:opacity-90 transition-opacity flex items-center gap-1"
                    >
                      <RiAddLine className="w-4 h-4" /> Add
                    </button>
                  </div>
                  {tickers.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {tickers.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-[hsl(160,70%,40%)]/15 text-[hsl(160,70%,40%)] border border-[hsl(160,70%,40%)]/30"
                        >
                          {t}
                          <button onClick={() => removeTicker(t)} className="hover:text-red-400 transition-colors">
                            <RiCloseLine className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No tickers added yet. Start by adding stock symbols above.</p>
                  )}
                </div>

                {/* Technical Criteria */}
                <CollapsibleSection title="Technical Criteria">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">RSI Threshold (Oversold Below)</label>
                    <input
                      type="number"
                      value={rsiThreshold}
                      onChange={(e) => setRsiThreshold(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg bg-[hsl(160,22%,20%)] border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(160,70%,40%)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">MA Crossover Type</label>
                    <select
                      value={maCrossover}
                      onChange={(e) => setMaCrossover(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-[hsl(160,22%,20%)] border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(160,70%,40%)]"
                    >
                      <option value="Any">Any</option>
                      <option value="Golden Cross">Golden Cross</option>
                      <option value="Death Cross">Death Cross</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Volume Spike %</label>
                    <input
                      type="number"
                      value={volumeSpike}
                      onChange={(e) => setVolumeSpike(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg bg-[hsl(160,22%,20%)] border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(160,70%,40%)]"
                    />
                  </div>
                </CollapsibleSection>

                {/* Fundamental Criteria */}
                <CollapsibleSection title="Fundamental Criteria">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Max P/E Ratio</label>
                    <input
                      type="number"
                      value={maxPE}
                      onChange={(e) => setMaxPE(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg bg-[hsl(160,22%,20%)] border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(160,70%,40%)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Min Revenue Growth %</label>
                    <input
                      type="number"
                      value={minRevenueGrowth}
                      onChange={(e) => setMinRevenueGrowth(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg bg-[hsl(160,22%,20%)] border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(160,70%,40%)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Max Debt-to-Equity</label>
                    <input
                      type="number"
                      step="0.1"
                      value={maxDebtToEquity}
                      onChange={(e) => setMaxDebtToEquity(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg bg-[hsl(160,22%,20%)] border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(160,70%,40%)]"
                    />
                  </div>
                </CollapsibleSection>

                {/* Run Analysis Button */}
                <button
                  onClick={runAnalysis}
                  disabled={isAnalyzing || tickers.length === 0}
                  className="w-full py-3.5 rounded-xl bg-[hsl(160,70%,40%)] text-white font-bold text-sm hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-[hsl(160,70%,40%)]/20"
                >
                  {isAnalyzing ? (
                    <>
                      <RiRefreshLine className="w-4 h-4 animate-spin" /> Analyzing...
                    </>
                  ) : (
                    <>
                      <RiSearchLine className="w-4 h-4" /> Run Analysis
                    </>
                  )}
                </button>

                {analysisError && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                    <RiErrorWarningLine className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>{analysisError}</span>
                  </div>
                )}
              </div>

              {/* Right Column: Analysis Results */}
              <div className="flex-1 min-w-0">
                {/* Loading State */}
                {isAnalyzing && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm text-[hsl(160,70%,40%)] font-medium mb-2">
                      <RiRefreshLine className="w-4 h-4 animate-spin" />
                      {LOADING_MESSAGES[loadingMsgIndex]}
                    </div>
                    <SkeletonCard />
                    <SkeletonCard />
                  </div>
                )}

                {/* Empty State */}
                {!isAnalyzing && !analysisResult && !analysisError && (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mb-4">
                      <RiLineChartLine className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">No Analysis Yet</h3>
                    <p className="text-sm text-muted-foreground max-w-sm">
                      Add stock tickers to your watchlist and configure your criteria, then click &quot;Run Analysis&quot; to get AI-powered recommendations.
                    </p>
                  </div>
                )}

                {/* Results */}
                {!isAnalyzing && analysisResult && (
                  <div className="space-y-4">
                    {/* Summary Bar */}
                    {analysisResult.analysis_summary && (
                      <div className="rounded-xl border border-border bg-card p-4">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Analysis Summary</h4>
                        <p className="text-sm text-foreground leading-relaxed">{analysisResult.analysis_summary}</p>
                        {analysisResult.market_context && (
                          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{analysisResult.market_context}</p>
                        )}
                      </div>
                    )}

                    {/* Stock Cards */}
                    {Array.isArray(analysisResult.stocks) && analysisResult.stocks.map((stock) => (
                      <div key={stock.ticker} className="rounded-xl border border-border bg-card p-5 hover:border-[hsl(160,70%,40%)]/30 transition-colors">
                        {/* Header */}
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <h3 className="text-xl font-bold text-foreground">{stock.ticker}</h3>
                              <RecommendationBadge recommendation={stock.recommendation} />
                            </div>
                            <p className="text-xs text-muted-foreground">{stock.company_name}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-foreground">{stock.current_price}</p>
                            <p className="text-xs text-muted-foreground">Current Price</p>
                          </div>
                        </div>

                        {/* Scores */}
                        <div className="flex gap-4 mb-4">
                          <ScoreGauge score={safeNumber(stock.technical_score)} label="Technical Score" />
                          <ScoreGauge score={safeNumber(stock.fundamental_score)} label="Fundamental Score" />
                        </div>

                        {/* Confidence */}
                        <div className="mb-4">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-muted-foreground font-medium">Confidence</span>
                            <span className="text-xs font-semibold text-[hsl(160,70%,40%)]">{stock.confidence}%</span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-secondary">
                            <div
                              className="h-full rounded-full bg-[hsl(160,70%,40%)] transition-all duration-700"
                              style={{ width: `${Math.min(100, safeNumber(stock.confidence))}%` }}
                            />
                          </div>
                        </div>

                        {/* Signals */}
                        <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
                          <div className="p-2.5 rounded-lg bg-secondary/50">
                            <span className="text-muted-foreground">Technical Signal:</span>{' '}
                            <span className="font-semibold text-foreground">{stock.technical_signal}</span>
                          </div>
                          <div className="p-2.5 rounded-lg bg-secondary/50">
                            <span className="text-muted-foreground">Fundamental:</span>{' '}
                            <span className="font-semibold text-foreground">{stock.fundamental_assessment}</span>
                          </div>
                        </div>

                        {/* Highlights */}
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          {safeArray(stock.technical_highlights).length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                                <RiLineChartLine className="w-3.5 h-3.5" /> Technical Highlights
                              </h4>
                              <ul className="space-y-1">
                                {safeArray(stock.technical_highlights).map((h, i) => (
                                  <li key={i} className="flex items-start gap-1.5 text-xs text-foreground">
                                    <RiArrowUpLine className="w-3 h-3 text-[hsl(160,70%,40%)] mt-0.5 flex-shrink-0" />
                                    <span>{h}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {safeArray(stock.fundamental_highlights).length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                                <RiBarChartLine className="w-3.5 h-3.5" /> Fundamental Highlights
                              </h4>
                              <ul className="space-y-1">
                                {safeArray(stock.fundamental_highlights).map((h, i) => (
                                  <li key={i} className="flex items-start gap-1.5 text-xs text-foreground">
                                    <RiArrowUpLine className="w-3 h-3 text-[hsl(142,65%,45%)] mt-0.5 flex-shrink-0" />
                                    <span>{h}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>

                        {/* Risk Factors */}
                        {safeArray(stock.risk_factors).length > 0 && (
                          <div className="mb-4">
                            <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                              <RiAlertLine className="w-3.5 h-3.5 text-yellow-500" /> Risk Factors
                            </h4>
                            <ul className="space-y-1">
                              {safeArray(stock.risk_factors).map((r, i) => (
                                <li key={i} className="flex items-start gap-1.5 text-xs text-foreground">
                                  <RiErrorWarningLine className="w-3 h-3 text-yellow-500 mt-0.5 flex-shrink-0" />
                                  <span>{r}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Conflicting Signals */}
                        {stock.conflicting_signals && stock.conflicting_signals.toLowerCase() !== 'none' && (
                          <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-400 mb-4 flex items-start gap-2">
                            <RiAlertLine className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                            <span>{stock.conflicting_signals}</span>
                          </div>
                        )}

                        {/* Send Email Button / Input */}
                        <div className="border-t border-border pt-3 mt-2">
                          {showEmailInput === stock.ticker ? (
                            <div className="flex gap-2">
                              <input
                                type="email"
                                value={emailInput}
                                onChange={(e) => setEmailInput(e.target.value)}
                                placeholder="Enter email address"
                                className="flex-1 px-3 py-2 rounded-lg bg-[hsl(160,22%,20%)] border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(160,70%,40%)]"
                              />
                              <button
                                onClick={() => sendEmailAlert(stock, emailInput)}
                                disabled={emailingTicker === stock.ticker || !emailInput.trim()}
                                className="px-4 py-2 rounded-lg bg-[hsl(160,70%,40%)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center gap-1"
                              >
                                {emailingTicker === stock.ticker ? (
                                  <RiRefreshLine className="w-4 h-4 animate-spin" />
                                ) : (
                                  <RiMailSendLine className="w-4 h-4" />
                                )}
                                Send
                              </button>
                              <button
                                onClick={() => setShowEmailInput(null)}
                                className="px-2 py-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                              >
                                <RiCloseLine className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setShowEmailInput(stock.ticker)
                                if (settings.recipientEmail) setEmailInput(settings.recipientEmail)
                              }}
                              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-sm text-foreground font-medium hover:bg-secondary/80 transition-colors"
                            >
                              <RiMailSendLine className="w-4 h-4" /> Send Alert to Email
                            </button>
                          )}

                          {/* Email Status */}
                          {emailStatus[stock.ticker] && (
                            <div
                              className={`mt-2 flex items-center gap-2 text-xs p-2 rounded-lg ${
                                emailStatus[stock.ticker].status === 'success'
                                  ? 'bg-green-500/10 text-green-400'
                                  : emailStatus[stock.ticker].status === 'error'
                                  ? 'bg-red-500/10 text-red-400'
                                  : 'bg-blue-500/10 text-blue-400'
                              }`}
                            >
                              {emailStatus[stock.ticker].status === 'success' && <RiCheckLine className="w-3.5 h-3.5" />}
                              {emailStatus[stock.ticker].status === 'error' && <RiErrorWarningLine className="w-3.5 h-3.5" />}
                              {emailStatus[stock.ticker].status === 'sending' && <RiRefreshLine className="w-3.5 h-3.5 animate-spin" />}
                              {emailStatus[stock.ticker].message}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              ALERT HISTORY SCREEN
              ═══════════════════════════════════════════════════════════════════ */}
          {activeScreen === 'history' && (
            <div className="space-y-4">
              {/* Filter Bar */}
              <div className="rounded-xl border border-border bg-card p-4 flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[140px]">
                  <label className="block text-xs text-muted-foreground mb-1">From</label>
                  <input
                    type="date"
                    value={historyFilter.from}
                    onChange={(e) => setHistoryFilter((p) => ({ ...p, from: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-[hsl(160,22%,20%)] border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(160,70%,40%)]"
                  />
                </div>
                <div className="flex-1 min-w-[140px]">
                  <label className="block text-xs text-muted-foreground mb-1">To</label>
                  <input
                    type="date"
                    value={historyFilter.to}
                    onChange={(e) => setHistoryFilter((p) => ({ ...p, to: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-[hsl(160,22%,20%)] border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(160,70%,40%)]"
                  />
                </div>
                <div className="flex-1 min-w-[140px]">
                  <label className="block text-xs text-muted-foreground mb-1">Ticker</label>
                  <input
                    type="text"
                    value={historyFilter.ticker}
                    onChange={(e) => setHistoryFilter((p) => ({ ...p, ticker: e.target.value }))}
                    placeholder="Filter by ticker"
                    className="w-full px-3 py-2 rounded-lg bg-[hsl(160,22%,20%)] border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(160,70%,40%)]"
                  />
                </div>
                <div className="flex-1 min-w-[140px]">
                  <label className="block text-xs text-muted-foreground mb-1">Recommendation</label>
                  <select
                    value={historyFilter.recommendation}
                    onChange={(e) => setHistoryFilter((p) => ({ ...p, recommendation: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-[hsl(160,22%,20%)] border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(160,70%,40%)]"
                  >
                    <option value="All">All</option>
                    <option value="Buy">Buy</option>
                    <option value="Hold">Hold</option>
                    <option value="Sell">Sell</option>
                  </select>
                </div>
                <button
                  onClick={exportCSV}
                  disabled={alertHistory.length === 0}
                  className="px-4 py-2 rounded-lg bg-secondary text-sm text-foreground font-medium hover:bg-secondary/80 transition-colors disabled:opacity-40 flex items-center gap-1.5"
                >
                  <RiDownloadLine className="w-4 h-4" /> Export CSV
                </button>
              </div>

              {/* History Table */}
              {filteredHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mb-4">
                    <RiHistoryLine className="w-7 h-7 text-muted-foreground" />
                  </div>
                  <h3 className="text-base font-semibold text-foreground mb-1">No History Yet</h3>
                  <p className="text-sm text-muted-foreground">Run your first analysis from the Dashboard to see history here.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  {/* Table Header */}
                  <div className="grid grid-cols-[120px_100px_1fr_100px_80px_80px] gap-2 px-4 py-3 bg-secondary/50 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">
                    <span>Date</span>
                    <span>Ticker</span>
                    <span>Company</span>
                    <span>Rating</span>
                    <span>Score</span>
                    <span>Email</span>
                  </div>

                  {/* Table Rows */}
                  {filteredHistory.map((item) =>
                    Array.isArray(item.analysis.stocks) ? item.analysis.stocks.map((stock, sIdx) => (
                      <div key={`${item.id}-${sIdx}`}>
                        <button
                          onClick={() => setExpandedHistoryId(expandedHistoryId === `${item.id}-${sIdx}` ? null : `${item.id}-${sIdx}`)}
                          className="w-full grid grid-cols-[120px_100px_1fr_100px_80px_80px] gap-2 px-4 py-3 text-sm text-foreground hover:bg-secondary/30 transition-colors border-b border-border items-center text-left"
                        >
                          <span className="text-xs text-muted-foreground">
                            {new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                          <span className="font-semibold">{stock.ticker}</span>
                          <span className="text-xs text-muted-foreground truncate">{stock.company_name}</span>
                          <span><RecommendationBadge recommendation={stock.recommendation} /></span>
                          <span className="text-xs font-medium">{stock.overall_score}</span>
                          <span>
                            {item.emailSent ? (
                              <RiCheckLine className="w-4 h-4 text-green-400" />
                            ) : (
                              <RiCloseLine className="w-4 h-4 text-muted-foreground" />
                            )}
                          </span>
                        </button>

                        {/* Expanded Details */}
                        {expandedHistoryId === `${item.id}-${sIdx}` && (
                          <div className="px-6 py-4 bg-secondary/20 border-b border-border space-y-3">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">Price: <span className="text-foreground font-medium">{stock.current_price}</span></p>
                                <p className="text-xs text-muted-foreground mb-1">Technical: <span className="text-foreground font-medium">{stock.technical_score}/100 ({stock.technical_signal})</span></p>
                                <p className="text-xs text-muted-foreground">Fundamental: <span className="text-foreground font-medium">{stock.fundamental_score}/100 ({stock.fundamental_assessment})</span></p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">Confidence: <span className="text-foreground font-medium">{stock.confidence}%</span></p>
                                {item.emailRecipient && (
                                  <p className="text-xs text-muted-foreground">Sent to: <span className="text-foreground font-medium">{item.emailRecipient}</span></p>
                                )}
                              </div>
                            </div>
                            {safeArray(stock.technical_highlights).length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground mb-1">Technical Highlights</p>
                                <ul className="space-y-0.5">
                                  {safeArray(stock.technical_highlights).map((h, i) => (
                                    <li key={i} className="text-xs text-foreground flex items-start gap-1">
                                      <span className="text-[hsl(160,70%,40%)]">-</span> {h}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {safeArray(stock.fundamental_highlights).length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground mb-1">Fundamental Highlights</p>
                                <ul className="space-y-0.5">
                                  {safeArray(stock.fundamental_highlights).map((h, i) => (
                                    <li key={i} className="text-xs text-foreground flex items-start gap-1">
                                      <span className="text-[hsl(142,65%,45%)]">-</span> {h}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )) : null
                  )}
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              SETTINGS SCREEN
              ═══════════════════════════════════════════════════════════════════ */}
          {activeScreen === 'settings' && (
            <div className="max-w-2xl space-y-6">
              {/* Email Configuration */}
              <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                  <RiMailSendLine className="w-4 h-4 text-[hsl(160,70%,40%)]" />
                  Email Configuration
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1.5">Recipient Email Address</label>
                    <input
                      type="email"
                      value={settings.recipientEmail}
                      onChange={(e) => setSettings((p) => ({ ...p, recipientEmail: e.target.value }))}
                      placeholder="you@example.com"
                      className="w-full px-3 py-2.5 rounded-lg bg-[hsl(160,22%,20%)] border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(160,70%,40%)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1.5">Email Format</label>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setSettings((p) => ({ ...p, emailFormat: 'detailed' }))}
                        className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                          settings.emailFormat === 'detailed'
                            ? 'bg-[hsl(160,70%,40%)] text-white'
                            : 'bg-secondary text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Detailed
                      </button>
                      <button
                        onClick={() => setSettings((p) => ({ ...p, emailFormat: 'summary' }))}
                        className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                          settings.emailFormat === 'summary'
                            ? 'bg-[hsl(160,70%,40%)] text-white'
                            : 'bg-secondary text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Summary
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Default Criteria */}
              <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                  <RiSettings4Line className="w-4 h-4 text-[hsl(160,70%,40%)]" />
                  Default Analysis Criteria
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1.5">RSI Threshold</label>
                    <input
                      type="number"
                      value={settings.defaultCriteria.rsiThreshold}
                      onChange={(e) =>
                        setSettings((p) => ({
                          ...p,
                          defaultCriteria: { ...p.defaultCriteria, rsiThreshold: Number(e.target.value) },
                        }))
                      }
                      className="w-full px-3 py-2.5 rounded-lg bg-[hsl(160,22%,20%)] border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(160,70%,40%)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1.5">MA Crossover Type</label>
                    <select
                      value={settings.defaultCriteria.maCrossover}
                      onChange={(e) =>
                        setSettings((p) => ({
                          ...p,
                          defaultCriteria: { ...p.defaultCriteria, maCrossover: e.target.value },
                        }))
                      }
                      className="w-full px-3 py-2.5 rounded-lg bg-[hsl(160,22%,20%)] border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(160,70%,40%)]"
                    >
                      <option value="Any">Any</option>
                      <option value="Golden Cross">Golden Cross</option>
                      <option value="Death Cross">Death Cross</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1.5">Volume Spike %</label>
                    <input
                      type="number"
                      value={settings.defaultCriteria.volumeSpike}
                      onChange={(e) =>
                        setSettings((p) => ({
                          ...p,
                          defaultCriteria: { ...p.defaultCriteria, volumeSpike: Number(e.target.value) },
                        }))
                      }
                      className="w-full px-3 py-2.5 rounded-lg bg-[hsl(160,22%,20%)] border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(160,70%,40%)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1.5">Max P/E Ratio</label>
                    <input
                      type="number"
                      value={settings.defaultCriteria.maxPE}
                      onChange={(e) =>
                        setSettings((p) => ({
                          ...p,
                          defaultCriteria: { ...p.defaultCriteria, maxPE: Number(e.target.value) },
                        }))
                      }
                      className="w-full px-3 py-2.5 rounded-lg bg-[hsl(160,22%,20%)] border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(160,70%,40%)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1.5">Min Revenue Growth %</label>
                    <input
                      type="number"
                      value={settings.defaultCriteria.minRevenueGrowth}
                      onChange={(e) =>
                        setSettings((p) => ({
                          ...p,
                          defaultCriteria: { ...p.defaultCriteria, minRevenueGrowth: Number(e.target.value) },
                        }))
                      }
                      className="w-full px-3 py-2.5 rounded-lg bg-[hsl(160,22%,20%)] border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(160,70%,40%)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1.5">Max Debt-to-Equity</label>
                    <input
                      type="number"
                      step="0.1"
                      value={settings.defaultCriteria.maxDebtToEquity}
                      onChange={(e) =>
                        setSettings((p) => ({
                          ...p,
                          defaultCriteria: { ...p.defaultCriteria, maxDebtToEquity: Number(e.target.value) },
                        }))
                      }
                      className="w-full px-3 py-2.5 rounded-lg bg-[hsl(160,22%,20%)] border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(160,70%,40%)]"
                    />
                  </div>
                </div>
              </div>

              {/* Save */}
              <div className="flex items-center gap-3">
                <button
                  onClick={saveSettings}
                  className="px-6 py-2.5 rounded-xl bg-[hsl(160,70%,40%)] text-white font-bold text-sm hover:opacity-90 transition-opacity flex items-center gap-2"
                >
                  <RiCheckLine className="w-4 h-4" /> Save Settings
                </button>
                {settingsSaved && (
                  <span className="flex items-center gap-1.5 text-xs text-green-400 font-medium">
                    <RiCheckLine className="w-4 h-4" /> Settings saved successfully
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
