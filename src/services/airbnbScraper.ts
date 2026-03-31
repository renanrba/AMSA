import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import { BrowserContext, Page } from 'playwright';
import path from 'path';
import { Conversation, AirbnbMessage } from '../types';

// Garantir que o caminho dos browsers está definido
process.env.PLAYWRIGHT_BROWSERS_PATH = "/.cache/ms-playwright";

chromium.use(stealth());

export class AirbnbScraper {
  public context: BrowserContext | null = null;
  private browser: any = null;
  private userDataDir: string | null = null;
  private isStopping = false;

  stop() {
    this.isStopping = true;
  }

  async init(cookies: any[], userAgent?: string) {
    const defaultUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
    let finalUA = userAgent || defaultUA;
    if (finalUA.includes('Chrome/')) {
      const versionMatch = finalUA.match(/Chrome\/(\d+)/);
      if (versionMatch && parseInt(versionMatch[1]) > 130) {
        finalUA = finalUA.replace(/Chrome\/\d+/, 'Chrome/122');
      }
    }

    this.userDataDir = `/tmp/playwright-profile`;
    if (this.context) return;

    // Tentar encontrar o executável do Chromium em caminhos conhecidos
    const possiblePaths = [
      '/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',
      '/.cache/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell',
      path.join(process.env.PLAYWRIGHT_BROWSERS_PATH || '', 'chromium-1208/chrome-linux64/chrome'),
    ];

    let executablePath: string | undefined = undefined;
    const fs = await import('fs');
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        executablePath = p;
        console.log(`[SISTEMA] Usando Chromium em: ${executablePath}`);
        break;
      }
    }

    const launchOptions: any = {
      headless: true,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
      viewport: { width: 1366, height: 768 },
      userAgent: finalUA,
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
    };

    if (executablePath) {
      launchOptions.executablePath = executablePath;
    }

    this.context = await chromium.launchPersistentContext(this.userDataDir, launchOptions);
    this.browser = this.context.browser();
    
    await this.context.route('**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf,otf,mp4,webm}', route => route.abort());

    const sanitizedCookies = cookies.map(c => {
      if (!c.name || !c.value) return null;
      let domain = c.domain;
      if (domain) {
        if (c.hostOnly) domain = domain.startsWith('.') ? domain.substring(1) : domain;
        else domain = domain.startsWith('.') ? domain : `.${domain}`;
      }
      return {
        name: c.name as string,
        value: c.value as string,
        path: (c.path as string) || '/',
        domain: (domain as string) || 'www.airbnb.com.br',
        httpOnly: (c.httpOnly as boolean) ?? false,
        secure: (c.secure as boolean) ?? false,
        sameSite: 'Lax' as const,
        expires: c.expirationDate && !c.session ? Math.floor(c.expirationDate as number) : undefined
      };
    }).filter((c): c is any => c !== null);

    await this.context.addCookies(sanitizedCookies);
  }

  async checkSession(cookies: any[], userAgent?: string): Promise<{ status: 'ok' | 'error', error?: string, details?: string }> {
    try {
      await this.init(cookies, userAgent);
      const page = await this.context!.newPage();
      
      try {
        await page.goto('https://www.airbnb.com.br/hosting/messages', { waitUntil: 'load', timeout: 60000 });
      } catch (e: any) {
        if (e.message.includes('Timeout')) {
          console.log('[SISTEMA] Timeout no goto, verificando URL atual...');
        } else {
          throw e;
        }
      }
      
      await page.waitForTimeout(5000); 
      
      const pageTitle = await page.title();
      const currentUrl = page.url();
      
      if (currentUrl.includes('/login') || pageTitle.includes('Entrar') || pageTitle.includes('Login')) {
        return { status: 'error', error: 'Sessão expirada', details: 'Redirecionado para login' };
      }
      
      if (pageTitle.includes('Challenge') || pageTitle.includes('Verify')) {
        return { status: 'error', error: 'CAPTCHA detectado', details: 'O Airbnb solicitou verificação (Possível bloqueio de IP)' };
      }

      await page.close();
      return { status: 'ok' };
    } catch (error: any) {
      return { status: 'error', error: 'Erro na validação', details: error.message };
    }
  }

  async close() {
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
  }

  async clearProfile() {
    if (this.userDataDir) {
      const fs = await import('fs/promises');
      await fs.rm(this.userDataDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  // O PRODUTOR: STREAMING DE CONVERSAS 
  async streamConversations(page: Page, onNewIdFound: (id: string) => void): Promise<void> {
    this.isStopping = false;
    const baseUrl = `https://www.airbnb.com.br`;
    const inboxUrl = `${baseUrl}/hosting/messages`;

    let totalDiscovered = 0;
    const rawIds = new Set<string>();

    console.log('[PRODUTOR] Iniciando Network Sniffer em tempo real...');

    const responseHandler = async (response: any) => {
      try {
        if (response.request().resourceType() === 'fetch' || response.request().resourceType() === 'xhr') {
          const url = response.url();
          if (url.includes('graphql') || url.includes('api')) {
            const text = await response.text();
            const matchers = [/"threadId":"(\d{8,15})"/g, /"thread_id":"(\d{8,15})"/g, /"id":"(\d{8,15})"/g];
            matchers.forEach(regex => {
              let match;
              while ((match = regex.exec(text)) !== null) {
                const id = match[1];
                if (!rawIds.has(id)) {
                  rawIds.add(id);
                  totalDiscovered++;
                  onNewIdFound(id); 
                }
              }
            });
          }
        }
      } catch (e) {}
    };

    page.on('response', responseHandler);

    await page.goto(inboxUrl, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(5000);

    let staleCycles = 0;
    const maxStale = 8; 
    let lastDiscoveredCount = totalDiscovered;

    console.log('[PRODUTOR] Começando o scroll infinito da barra lateral...');

    while (staleCycles < maxStale && !this.isStopping) {
      await page.mouse.click(200, 300);
      for(let i=0; i<6; i++) {
        await page.keyboard.press('PageDown');
        await page.waitForTimeout(400); 
      }
      
      await page.waitForTimeout(2000); 

      if (totalDiscovered === lastDiscoveredCount) {
        staleCycles++;
        console.log(`[PRODUTOR] Nenhuma nova conversa. Tentativa ${staleCycles}/${maxStale}`);
      } else {
        staleCycles = 0;
      }
      
      lastDiscoveredCount = totalDiscovered;
    }

    console.log(`[PRODUTOR] Scroll finalizado. Nenhuma nova conversa encontrada após ${maxStale} tentativas.`);
    page.off('response', responseHandler);
  }

  // O CONSUMIDOR: LEITURA DE CHAT
  async readThread(page: Page, conversation: Conversation, startDate: Date, endDate: Date): Promise<AirbnbMessage[]> {
    try {
      await page.goto(conversation.url, { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(3000);
    } catch (e: any) {
      throw new Error(`Falha de rede ao acessar a URL.`);
    }

    // EXTRAÇÃO INTELIGENTE DE DETALHES (Nome, Anúncio, Datas)
    const threadData = await page.evaluate(() => {
      // 1. Extrair Nome e Foto
      const headerTitle = document.querySelector('h1, h2, [data-testid="thread-header-title"]');
      const img = document.querySelector('img[src*="user_profile"], img[alt*="Profile"], [data-testid="thread-header-avatar"] img') as HTMLImageElement;
      
      let name = null;
      if (headerTitle && headerTitle.textContent) {
        name = headerTitle.textContent.replace(/Mensagens com|Messages with|Conversa com/gi, '').split(',')[0].trim();
        if (name === 'Mensagens' || name === 'Messages' || name === 'Hóspede') name = null;
      }

      if (!name) {
        const sidebarName = document.querySelector('[data-testid="thread-sidebar-guest-name"], .text-muted');
        if (sidebarName && sidebarName.textContent) name = sidebarName.textContent.trim();
      }

      // 2. Extrair Detalhes da Reserva (Anúncio, Check-in, Check-out)
      const sidebar = document.querySelector('aside, [data-testid="thread-sidebar"]') || document.body;
      
      let listingName = 'Desconhecido';
      let checkIn = '-';
      let checkOut = '-';

      const textContent = (sidebar as HTMLElement).innerText || '';
      const dateRegex = /(\d{1,2}\s+de\s+[a-zç]+\.?(\s+de\s+\d{4})?)/gi;
      const foundDates = textContent.match(dateRegex);
      
      if (foundDates && foundDates.length >= 2) {
        checkIn = foundDates[0];
        checkOut = foundDates[1];
      }

      const possibleListingLinks = Array.from(sidebar.querySelectorAll('a[href*="/rooms/"]'));
      if (possibleListingLinks.length > 0) {
        listingName = (possibleListingLinks[0] as HTMLElement).innerText.trim();
      } else {
        const possibleTitles = Array.from(sidebar.querySelectorAll('h2, h3, div[dir="ltr"] strong'));
        const listingTitle = possibleTitles.find(el => {
          const text = (el as HTMLElement).innerText;
          return text.length > 10 && !text.includes('Check-in') && !text.includes('Hóspedes');
        });
        if (listingTitle) listingName = (listingTitle as HTMLElement).innerText.trim();
      }

      return {
        name: name || 'Hóspede',
        photo: img ? img.src : null,
        listingName,
        checkIn,
        checkOut
      };
    });

    conversation.guestName = threadData.name;
    conversation.guestPhoto = threadData.photo;
    conversation.listingName = threadData.listingName;
    conversation.checkIn = threadData.checkIn;
    conversation.checkOut = threadData.checkOut;

    // Scroll infinito para cima
    await page.mouse.move(800, 400);
    for(let i=0; i < 6; i++) {
        await page.mouse.wheel(0, -2000);
        await page.waitForTimeout(800);
    }

    const messages: AirbnbMessage[] = [];

    const threadElements = await page.evaluate(() => {
      // 1. Isola estritamente o painel central do chat
      const mainPanel = document.querySelector('[role="main"], #thread_panel, [data-testid="thread-panel"]') || document.body;

      // 2. Tenta os seletores oficiais de acessibilidade
      const selectors = [
        '[aria-label*="enviou"]', 
        '[aria-label*="enviad"]', 
        '[aria-label*="sent"]', 
        '[aria-label*="Mensagem de"]',
        '[aria-label*="Message from"]',
        '[data-testid*="message-item"]'
      ].join(', ');

      let nodes = Array.from(mainPanel.querySelectorAll(selectors));
      
      // 3. FALLBACK AGRESSIVO
      if (nodes.length === 0) {
        nodes = Array.from(mainPanel.querySelectorAll('div[dir="ltr"]')).filter(el => {
          const text = (el as HTMLElement).innerText || '';
          if (text.includes('A última mensagem') || text.includes('Ganhos em potencial') || text.includes('O status da reserva')) return false;
          if (el.querySelector('div[dir="ltr"]')) return false;
          return text.trim().length > 0;
        });
      }

      return nodes.map(el => {
          const htmlEl = el as HTMLElement;
          return {
              text: htmlEl.innerText?.trim() || '',
              ariaLabel: htmlEl.getAttribute('aria-label') || ''
          };
      });
    });

    let currentDate = 'Hoje';

    for (const el of threadElements) {
      let cleanText = el.text;
      const ariaLabel = el.ariaLabel.toLowerCase();

      if (!cleanText || cleanText.length < 1) continue;

      const isHost = ariaLabel.includes('você') || ariaLabel.includes('you') || ariaLabel.includes('enviada por');

      let timestamp = cleanText.match(/\d{1,2}:\d{2}/)?.[0] || ariaLabel.match(/\d{1,2}:\d{2}/)?.[0] || '';
      cleanText = cleanText.replace(/\d{1,2}:\d{2}/g, '').trim(); 
      
      if (!cleanText || cleanText === 'Lida' || cleanText.includes('Traduzido automaticamente')) continue;

      let senderName = isHost ? 'Você' : conversation.guestName;

      messages.push({
        id: Math.random().toString(36).substring(7),
        senderName,
        text: cleanText,
        timestamp,
        date: currentDate,
        role: isHost ? 'host' : 'guest',
      });
    }

    const uniqueMessages: AirbnbMessage[] = [];
    const seen = new Set();
    for (const m of messages) {
      const key = `${m.role}-${m.text.substring(0, 40)}`;
      if (!seen.has(key)) {
        uniqueMessages.push(m);
        seen.add(key);
      }
    }

    return uniqueMessages;
  }
}