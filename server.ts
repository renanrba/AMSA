// Configuração do Playwright (DEVE ser a primeira coisa no arquivo)
process.env.PLAYWRIGHT_BROWSERS_PATH = "/.cache/ms-playwright";

import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import multer from "multer";
import fs from "fs/promises";
import os from "os"; 
import { AirbnbScraper } from "./src/services/airbnbScraper.ts";
import { Conversation } from "./src/types.ts";
import ExcelJS from "exceljs";

console.log(`[SISTEMA] PLAYWRIGHT_BROWSERS_PATH definido como: ${process.env.PLAYWRIGHT_BROWSERS_PATH}`);

const upload = multer({ storage: multer.memoryStorage() });

// Salva o cache no diretório temporário do sistema
const PROGRESS_FILE = path.join(os.tmpdir(), "airbnb_scrape_progress_cache.json");

async function startServer() {
  try {
    const app = express();
    const PORT = 3000;

    console.log(`\n[SISTEMA] ==========================================`);
    console.log(`[SISTEMA] Iniciando servidor na porta ${PORT}...`);
    console.log(`[SISTEMA] NODE_ENV: ${process.env.NODE_ENV}`);
    console.log(`[SISTEMA] Arquivo de cache: ${PROGRESS_FILE}`);
    console.log(`[SISTEMA] ==========================================\n`);

    app.use(cors());
    
    // Aumenta o limite de payload para aceitar os cookies grandes
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ limit: '50mb', extended: true }));

    app.get("/api/health", (req, res) => {
      res.json({ status: "ok", env: process.env.NODE_ENV, time: new Date().toISOString() });
    });

    let currentScrape: {
      status: 'idle' | 'running' | 'completed' | 'error' | 'stopped';
      progress: number;
      conversations: Conversation[];
      error?: string;
    } = {
      status: 'idle',
      progress: 0,
      conversations: [],
    };

    try {
      const data = await fs.readFile(PROGRESS_FILE, "utf-8");
      const saved = JSON.parse(data);
      if (saved && saved.conversations) {
        currentScrape = {
          ...saved,
          status: saved.status === 'running' ? 'error' : saved.status 
        };
        console.log(`[SISTEMA] Progresso carregado: ${currentScrape.conversations.length} conversas encontradas.`);
      }
    } catch (e) {
      console.log("[SISTEMA] Nenhum progresso anterior encontrado.");
    }

    let isSaving = false;

    // Função de salvamento assíncrona mais inteligente (não enfileira infinitamente)
    async function saveProgress() {
      if (isSaving || currentScrape.conversations.length === 0) return;
      isSaving = true;
      try {
        await fs.writeFile(PROGRESS_FILE, JSON.stringify(currentScrape, null, 2));
      } catch (e) {
        console.error("[SISTEMA] Erro ao salvar progresso no disco:", e);
      } finally {
        isSaving = false;
      }
    }

    let cookies: any[] = [];
    let userAgent: string = '';
    let globalScraper: AirbnbScraper | null = null;

    async function getScraper() {
      if (!globalScraper) {
        globalScraper = new AirbnbScraper();
      }
      return globalScraper;
    }

    // ==========================================
    // ROTAS DE AUTENTICAÇÃO
    // ==========================================

    app.post("/api/auth/cookies", async (req, res) => {
      try {
        cookies = req.body.cookies || [];
        userAgent = req.body.userAgent || '';
        
        if (globalScraper) {
          if (typeof globalScraper.close === 'function') {
            await globalScraper.close().catch(() => {});
          }
          globalScraper = null;
        }
        
        res.json({ status: "ok", count: cookies.length });
      } catch (error: any) {
        res.status(400).json({ error: "Erro interno ao processar cookies", details: error.message });
      }
    });

    app.post("/api/scrape/check-session", async (req, res) => {
      try {
        const checkCookies = req.body.cookies || cookies;
        const checkUA = req.body.userAgent || userAgent;

        if (!checkCookies || checkCookies.length === 0) {
          return res.status(400).json({ status: 'error', error: "Nenhum cookie fornecido." });
        }

        console.log(`[SISTEMA] Validando sessão com ${checkCookies.length} cookies...`);
        const scraper = await getScraper();
        const result = await scraper.checkSession(checkCookies, checkUA);
        
        if (result.status === 'error') {
          return res.status(401).json(result);
        }
        res.json(result);
      } catch (error: any) {
        res.status(500).json({ status: 'error', error: 'Erro interno no servidor', details: error.message });
      }
    });

    // ==========================================
    // ROTAS DE SCRAPING
    // ==========================================

    app.post("/api/scrape/start", async (req, res) => {
      if (currentScrape.status === 'running') {
        return res.status(400).json({ error: "A coleta já está em execução" });
      }
      if (cookies.length === 0) {
        return res.status(400).json({ error: "Nenhum cookie fornecido" });
      }

      currentScrape = {
        status: 'running',
        progress: 0,
        conversations: [],
      };

      res.json({ status: "started" });

      // Inicia um salvamento periódico a cada 30 segundos (Evita travar o servidor)
      const saveInterval = setInterval(() => {
        if (currentScrape.status === 'running') saveProgress();
      }, 30000);

      try {
        const scraper = await getScraper();
        await scraper.init(cookies, userAgent);
        
        const queue: Conversation[] = [];
        let isDiscovering = true;
        let totalDiscovered = 0;
        let totalCompleted = 0;

        const mainPage = await scraper.context!.newPage();
        const baseUrl = `https://www.airbnb.com.br`;

        const producerTask = scraper.streamConversations(mainPage, (newId) => {
          totalDiscovered++;
          const newConv: Conversation = {
            id: newId,
            guestName: 'Hóspede',
            url: `${baseUrl}/hosting/messages/${newId}`,
            snippet: 'Aguardando processamento...',
            messages: [],
            status: 'pending',
          };
          
          queue.push(newConv);
          currentScrape.conversations.push(newConv); 
          // REMOVIDO: saveProgress() aqui. Deixamos o Timer fazer isso.
          
          console.log(`[FILA] Conversa ${newId} interceptada! Fila: ${queue.length}`);
        }).then(async () => {
          isDiscovering = false; 
          console.log(`[PRODUTOR] Encerrado. Total: ${totalDiscovered}`);
          await mainPage.close().catch(() => {});
        }).catch(async (err) => {
          console.error('[ERRO PRODUTOR]', err);
          isDiscovering = false;
          await mainPage.close().catch(() => {});
        });

        // Limite de Abas Paralelas (Mantenha 3 para bom balanço de velocidade/memória)
        const CONCURRENCY_LIMIT = 3; 

        const workerTask = async (workerId: number) => {
          while ((isDiscovering || queue.length > 0) && currentScrape.status === 'running') {
            
            if (queue.length === 0) {
              await new Promise(r => setTimeout(r, 1000));
              continue;
            }

            const conv = queue.shift();
            if (!conv) continue;

            conv.status = 'scraping';
            const threadPage = await scraper.context!.newPage();
            
            try {
              const startDate = new Date();
              startDate.setFullYear(startDate.getFullYear() - 3);
              
              const messages = await scraper.readThread(threadPage, conv, startDate, new Date());
              conv.messages = messages;
              
              if (messages.length > 0) {
                const lastMsg = messages[messages.length - 1];
                conv.snippet = lastMsg.text.substring(0, 100);
              }
              conv.status = 'completed';
              console.log(`[WORKER ${workerId}] ✅ Thread ${conv.id} extraída (${messages.length} msgs). Restam: ${queue.length}`);
              // REMOVIDO: saveProgress() aqui também.
            } catch (err: any) {
              console.error(`[WORKER ${workerId}] ❌ Erro ${conv.id}:`, err.message);
              conv.status = 'error';
            } finally {
              await threadPage.close().catch(() => {});
              totalCompleted++;
              
              if (totalDiscovered > 0) {
                const calcProg = Math.floor((totalCompleted / totalDiscovered) * 95);
                currentScrape.progress = Math.min(calcProg, 99);
              }
            }

            // Pausa de segurança anti-bot (1.5s a 2.5s)
            await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000));
          }
          console.log(`[WORKER ${workerId}] Finalizado.`);
        };

        const workers = Array.from({ length: CONCURRENCY_LIMIT }).map((_, index) => workerTask(index + 1));

        await Promise.all([producerTask, ...workers]);

        if (currentScrape.status === 'running') {
          currentScrape.status = 'completed';
          currentScrape.progress = 100;
          console.log('🎉 Coleta Completa finalizada com sucesso!');
        } else {
          console.log(`[SISTEMA] Coleta interrompida. Status: ${currentScrape.status}`);
        }
        
      } catch (error: any) {
        console.error('Erro fatal no scraper:', error.message);
        currentScrape.status = 'error';
        currentScrape.error = error.message;
      } finally {
        clearInterval(saveInterval); // Para o timer
        await saveProgress(); // Faz o backup final garantido
      }
    });

    app.post("/api/scrape/stop", async (req, res) => {
      if (currentScrape.status !== 'running') {
        return res.status(400).json({ error: "Nenhuma coleta em execução" });
      }

      try {
        const scraper = await getScraper();
        scraper.stop();
        currentScrape.status = 'stopped';
        await saveProgress();
        res.json({ status: "stopping" });
      } catch (error: any) {
        res.status(500).json({ error: "Erro ao parar", details: error.message });
      }
    });

    app.get("/api/scrape/status", (req, res) => {
      const responseData = currentScrape || { status: 'idle', progress: 0, conversations: [] };
      res.json(responseData);
    });

    // ==========================================
    // ROTA DE EXPORTAÇÃO
    // ==========================================

    app.get("/api/export/excel", async (req, res) => {
      if (currentScrape.conversations.length === 0) {
        return res.status(400).send("Vazio");
      }
      try {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Airbnb");
        sheet.columns = [
          { header: "ID", key: "id", width: 15 },
          { header: "Hóspede", key: "guest", width: 20 },
          { header: "Anúncio", key: "listing", width: 30 },
          { header: "Check-in", key: "checkIn", width: 15 },
          { header: "Check-out", key: "checkOut", width: 15 },
          { header: "Data Msg", key: "date", width: 15 },
          { header: "Remetente", key: "sender", width: 20 },
          { header: "Mensagem", key: "text", width: 50 },
        ];
        currentScrape.conversations.forEach(c => c.messages.forEach(m => {
          sheet.addRow({ id: c.id, guest: c.guestName, listing: c.listingName, checkIn: c.checkIn, checkOut: c.checkOut, date: m.timestamp, sender: m.senderName, text: m.text });
        }));
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", "attachment; filename=airbnb_messages.xlsx");
        await workbook.xlsx.write(res);
        res.end();
      } catch (error: any) {
        res.status(500).send(error.message);
      }
    });

    // ==========================================
    // VITE & FRONTEND SERVING
    // ==========================================
    
    app.all('/api/*', (req, res) => res.status(404).json({ error: "API Route Not Found" }));

    if (process.env.NODE_ENV !== "production") {
      const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
    }

    app.listen(PORT, "0.0.0.0", () => console.log(`[SISTEMA] Servidor rodando em http://localhost:${PORT}`));

  } catch (error: any) {
    console.error("[SISTEMA] Erro fatal:", error);
  }
}

startServer();