import React, { useState, useEffect } from 'react';
import { 
  Download, Play, Settings, MessageSquare, FileSpreadsheet, 
  AlertCircle, CheckCircle2, Loader2, Database, Search,
  BrainCircuit, HelpCircle, TrendingUp, Lightbulb, X, Calendar, Home, Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageAnalyzer } from './services/analyzer';
import { Conversation, AnalysisResult } from './types';

interface ScrapeStatus {
  status: 'idle' | 'running' | 'completed' | 'error' | 'stopped';
  progress: number;
  conversations: Conversation[];
  error?: string;
}

// Substitua pelo seu array real se necessário
const cookiesFromPrompt = `[]`;

export default function App() {
  const [status, setStatus] = useState<ScrapeStatus>({ status: 'idle', progress: 0, conversations: [] });
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [cookies, setCookies] = useState('');

  const selectedConversation = status.conversations.find(c => c.id === selectedConversationId) || null;
  const [isValidating, setIsValidating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'messages' | 'faq'>('dashboard');

  const validateCookies = (jsonStr: string) => {
    try {
      const parsed = JSON.parse(jsonStr);
      if (!Array.isArray(parsed)) return { valid: false, error: 'O JSON deve ser um array de cookies.' };
      const required = ['_airbed_session_id', '_aat', 'bev'];
      const found = parsed.map(c => c.name);
      const missing = required.filter(r => !found.includes(r));
      if (missing.length > 0) return { valid: false, error: `Faltam cookies essenciais: ${missing.join(', ')}.` };
      return { valid: true };
    } catch (e) {
      return { valid: false, error: 'JSON inválido.' };
    }
  };

  const handleValidateSession = async () => {
    const validation = validateCookies(cookies);
    if (!validation.valid) return alert(validation.error);

    setIsValidating(true);
    try {
      const cookieJson = JSON.parse(cookies);
      const authRes = await fetch('/api/auth/cookies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookies: cookieJson, userAgent: navigator.userAgent })
      });

      if (!authRes.ok) throw new Error('Erro ao salvar cookies.');

      const checkRes = await fetch('/api/scrape/check-session', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookies: cookieJson, userAgent: navigator.userAgent })
      });
      const data = await checkRes.json();

      if (data.status === 'ok') {
        alert('Sessão válida! O scraper conseguiu acessar a inbox do Airbnb.');
      } else {
        throw new Error(data.details ? `${data.error}\n\nDetalhes: ${data.details}` : data.error);
      }
    } catch (e: any) {
      alert(`Falha na validação:\n${e.message}`);
    } finally {
      setIsValidating(false);
    }
  };

  useEffect(() => {
    // Reduzido para 5 segundos para não causar 429 (Rate Limit) no Cloud Provider
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/scrape/status');
        
        // Ignora silenciosamente erros de Rate Limit (429) ou instabilidades temporárias
        if (!res.ok) return;
        
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
          const data = await res.json();
          setStatus(data);
        }
      } catch (e) {
        // Silencia falhas de rede no frontend para não poluir o console
      }
    }, 5000); 
    
    return () => clearInterval(interval);
  }, []);

  const handleStartScrape = async () => {
    if (!cookies) return alert('Por favor, cole os cookies primeiro.');
    try {
      const cookieJson = JSON.parse(cookies);
      const authRes = await fetch('/api/auth/cookies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookies: cookieJson, userAgent: navigator.userAgent })
      });
      if (!authRes.ok) throw new Error('Erro ao salvar cookies no servidor.');

      const scrapeRes = await fetch('/api/scrape/start', { method: 'POST' });
      if (!scrapeRes.ok) throw new Error('Erro ao iniciar a coleta.');
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleStopScrape = async () => {
    try {
      const res = await fetch('/api/scrape/stop', { method: 'POST' });
      if (!res.ok) throw new Error('Erro ao parar a coleta.');
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleAnalyze = async () => {
    console.log("[FRONTEND] Iniciando handleAnalyze...");
    if (status.conversations.length === 0) {
      alert("Nenhuma conversa para analisar.");
      return;
    }

    setIsAnalyzing(true);
    try {
      console.log("[FRONTEND] Iniciando análise de IA no cliente...");
      const analyzer = new MessageAnalyzer();
      const data = await analyzer.analyzeMessages(status.conversations);
      
      console.log("[FRONTEND] Dados da análise recebidos:", data);
      setAnalysis(data);
      setActiveTab('faq');
    } catch (e: any) {
      console.error("[FRONTEND ERROR] Falha na análise:", e);
      alert(e.message);
    } finally {
      setIsAnalyzing(false);
      console.log("[FRONTEND] handleAnalyze finalizado.");
    }
  };

  const handleDownload = () => window.open('/api/export/excel', '_blank');

  return (
    <div className="min-h-screen bg-[#F7F7F7] text-[#222222] font-sans">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#FF385C] rounded-lg flex items-center justify-center text-white">
              <Database size={20} />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Airbnb Scraper Pro</h1>
          </div>
          
          <nav className="flex items-center gap-6">
            <button onClick={() => setActiveTab('dashboard')} className={`text-sm font-medium transition-colors ${activeTab === 'dashboard' ? 'text-[#FF385C]' : 'text-gray-500 hover:text-gray-900'}`}>Dashboard</button>
            <button onClick={() => setActiveTab('messages')} className={`text-sm font-medium transition-colors ${activeTab === 'messages' ? 'text-[#FF385C]' : 'text-gray-500 hover:text-gray-900'}`}>Mensagens</button>
            <button onClick={() => setActiveTab('faq')} className={`text-sm font-medium transition-colors ${activeTab === 'faq' ? 'text-[#FF385C]' : 'text-gray-500 hover:text-gray-900'}`}>FAQ & Insights</button>
          </nav>

          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${
              status.status === 'running' ? 'bg-green-100 text-green-700' : 
              status.status === 'stopped' ? 'bg-yellow-100 text-yellow-700' :
              status.status === 'error' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
            }`}>
              <div className={`w-2 h-2 rounded-full ${status.status === 'running' ? 'bg-green-500 animate-pulse' : status.status === 'stopped' ? 'bg-yellow-500' : status.status === 'error' ? 'bg-red-500' : 'bg-gray-400'}`} />
              {status.status === 'running' ? 'A recolher...' : status.status === 'stopped' ? 'Interrompido' : status.status === 'completed' ? 'Finalizado' : 'Inativo'}
            </div>

            {status.status === 'running' && (
              <button onClick={handleStopScrape} className="flex items-center gap-2 bg-white border border-red-200 text-red-600 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-red-50 transition-colors shadow-sm">
                <div className="w-2 h-2 bg-red-600 rounded-sm" /> Parar
              </button>
            )}

            <button onClick={handleStartScrape} disabled={status.status === 'running'} className={`flex items-center gap-2 bg-[#FF385C] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#E31C5F] transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed`}>
              <Play size={16} fill="currentColor" /> {status.status === 'running' ? 'Em Execução' : 'Iniciar Recolha'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div key="dashboard" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-bold flex items-center gap-2"><Settings size={20} className="text-gray-400" /> Configuração da Sessão</h2>
                  </div>
                  <textarea 
                    value={cookies} onChange={(e) => setCookies(e.target.value)}
                    placeholder='[{"name": "_airbed_session_id", "value": "...", "domain": ".airbnb.com.br"}, ...]'
                    className="w-full h-48 p-4 bg-gray-50 border border-gray-200 rounded-xl font-mono text-xs focus:ring-2 focus:ring-[#FF385C] outline-none"
                  />
                  <div className="flex mt-4 justify-end gap-2">
                    <button onClick={handleValidateSession} disabled={!cookies || isValidating || status.status === 'running'} className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-bold hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50">
                      {isValidating ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} className="text-green-500" />} Validar
                    </button>
                    <button onClick={handleStartScrape} disabled={status.status === 'running' || !cookies} className="bg-[#FF385C] hover:bg-[#E31C5F] text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 disabled:opacity-50">
                      <Play size={18} /> Iniciar Coleta
                    </button>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm flex flex-col">
                  <h2 className="text-lg font-bold mb-6 flex items-center gap-2"><TrendingUp size={20} className="text-gray-400" /> Status</h2>
                  <div className="flex-1 flex flex-col justify-center items-center text-center space-y-4">
                    <div className="relative w-32 h-32">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-gray-100" />
                        <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray={364.4} strokeDashoffset={364.4 - (364.4 * status.progress) / 100} className="text-[#FF385C] transition-all" />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center"><span className="text-2xl font-bold">{status.progress}%</span></div>
                    </div>
                    <p className="text-sm font-bold">{status.conversations.length} conversas</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'messages' && (
            <motion.div key="messages" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-xl font-bold">Histórico de Mensagens</h2>
                <button onClick={handleDownload} className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm font-bold hover:bg-gray-50"><Download size={16} /> Exportar Excel</button>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-[10px] font-bold uppercase text-gray-500 border-b border-gray-100">
                      <th className="px-6 py-4">Hóspede</th>
                      <th className="px-6 py-4">Anúncio / Datas</th>
                      <th className="px-6 py-4">Última Mensagem</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {status.conversations.map((conv) => (
                      <tr key={conv.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-[#FF385C] bg-opacity-10 text-[#FF385C] rounded-full flex items-center justify-center font-bold text-xs overflow-hidden">
                              {conv.guestPhoto ? <img src={conv.guestPhoto} className="w-full h-full object-cover" /> : conv.guestName[0]}
                            </div>
                            <span className="text-sm font-bold">{conv.guestName}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-semibold text-gray-800 flex items-center gap-1"><Home size={12}/> {conv.listingName || 'Buscando...'}</span>
                            <span className="text-[10px] text-gray-500 flex items-center gap-1"><Calendar size={12}/> {conv.checkIn || '-'} até {conv.checkOut || '-'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4"><p className="text-xs text-gray-600 line-clamp-2 max-w-sm">{conv.snippet}</p></td>
                        <td className="px-6 py-4">
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase ${conv.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{conv.status}</span>
                        </td>
                        <td className="px-6 py-4">
                          <button onClick={() => setSelectedConversationId(conv.id)} className="text-xs font-bold text-[#FF385C] hover:underline">Ver Chat</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
          
          {activeTab === 'faq' && (
            <motion.div key="faq" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-8">
              {!analysis ? (
                <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
                  <BrainCircuit size={64} className="mx-auto mb-6 text-[#FF385C] opacity-20" />
                  <h2 className="text-2xl font-bold mb-2">Pronto para a Inteligência Artificial?</h2>
                  <p className="text-gray-500 mb-8 max-w-md mx-auto">Após concluir a recolha, podemos usar IA para analisar os dados.</p>
                  <button 
                    onClick={handleAnalyze} 
                    disabled={isAnalyzing || status.conversations.length === 0} 
                    title={status.conversations.length === 0 ? "Você precisa coletar conversas primeiro antes de analisar." : ""}
                    className="bg-[#FF385C] hover:bg-[#E31C5F] text-white px-8 py-3 rounded-2xl font-bold flex items-center gap-2 mx-auto disabled:opacity-50"
                  >
                    {isAnalyzing ? <Loader2 className="animate-spin" /> : <BrainCircuit size={20} />} Analisar
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                      <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                        <h2 className="text-lg font-bold flex items-center gap-2"><HelpCircle size={20} className="text-[#FF385C]" /> Perguntas Frequentes (FAQ)</h2>
                      </div>
                      <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
                        {analysis.faq.map((item, i) => (
                          <div key={i} className="p-6 hover:bg-gray-50 transition-colors">
                            <div className="flex items-start gap-3 mb-3">
                              <div className="w-6 h-6 bg-red-100 text-[#FF385C] rounded-full flex items-center justify-center shrink-0 text-xs font-bold">Q</div>
                              <h3 className="text-sm font-bold text-gray-900 leading-tight">{item.question}</h3>
                              <span className="ml-auto text-[10px] bg-gray-100 text-gray-600 px-2 py-1 rounded-full font-bold">{item.count}x</span>
                            </div>
                            <div className="flex items-start gap-3">
                              <div className="w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center shrink-0 text-xs font-bold">A</div>
                              <p className="text-sm text-gray-600 leading-relaxed">{item.answer}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    {/* Padrões e Gaps */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                      <h2 className="text-sm font-bold mb-4 flex items-center gap-2"><TrendingUp size={16} className="text-blue-500" /> Padrões Identificados</h2>
                      <ul className="space-y-3">
                        {analysis.patterns.map((p, i) => (
                          <li key={i} className="text-xs text-gray-600 flex gap-2">
                            <span className="text-blue-500 font-bold">•</span> {p}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                      <h2 className="text-sm font-bold mb-4 flex items-center gap-2"><AlertCircle size={16} className="text-orange-500" /> Gaps de Informação</h2>
                      <ul className="space-y-3">
                        {analysis.gaps.map((g, i) => (
                          <li key={i} className="text-xs text-gray-600 flex gap-2">
                            <span className="text-orange-500 font-bold">•</span> {g}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                      <h2 className="text-sm font-bold mb-4 flex items-center gap-2"><Lightbulb size={16} className="text-yellow-500" /> Dicas de Comunicação</h2>
                      <ul className="space-y-3">
                        {analysis.communication_tips.map((t, i) => (
                          <li key={i} className="text-xs text-gray-600 flex gap-2">
                            <span className="text-yellow-500 font-bold">•</span> {t}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 bg-gradient-to-br from-red-50 to-white">
                      <h2 className="text-sm font-bold mb-4 flex items-center gap-2"><Zap size={16} className="text-[#FF385C]" /> Automações Sugeridas</h2>
                      <ul className="space-y-3">
                        {analysis.suggested_automations.map((a, i) => (
                          <li key={i} className="text-xs text-gray-800 font-medium flex gap-2">
                            <span className="text-[#FF385C]">⚡</span> {a}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {selectedConversation && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="bg-white rounded-3xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="text-lg font-bold">{selectedConversation.guestName}</h2>
                  <button onClick={() => setSelectedConversationId(null)} className="p-2 hover:bg-gray-100 rounded-full"><X className="text-gray-500" size={20} /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50">
                  {selectedConversation.messages.map((msg, i) => (
                    <div key={i} className={`flex flex-col ${msg.role === 'host' ? 'items-end' : 'items-start'}`}>
                      <span className="text-[10px] font-bold text-gray-400 mb-1">{msg.senderName} • {msg.timestamp}</span>
                      <div className={`max-w-[80%] p-4 rounded-2xl text-sm ${msg.role === 'host' ? 'bg-[#FF385C] text-white rounded-tr-none' : 'bg-white text-gray-800 rounded-tl-none border border-gray-100'}`}>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}