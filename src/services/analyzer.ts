import { GoogleGenAI, Type } from "@google/genai";
import { Conversation } from "../types";

export class MessageAnalyzer {
  private ai: GoogleGenAI;

  constructor() {
    // Inicializa o SDK
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  }

  /**
   * DICA: Em vez de passar um array flat de mensagens, passe o array de Conversas.
   * Assim a IA entende onde começa e termina o papo com cada hóspede.
   */
  async analyzeMessages(conversations: Conversation[]) {
    // 1. Preparação dos Dados (Contexto Enriquecido)
    // Formata o histórico de forma legível para a IA, separando por hóspede
    const formattedHistory = conversations.map(conv => {
      const chatLog = conv.messages.map(m => {
        const role = m.role === 'host' ? 'Anfitrião' : 'Hóspede';
        return `[${m.timestamp}] ${role}: ${m.text}`;
      }).join('\n');
      
      return `--- Início da Conversa com ${conv.guestName} ---\n${chatLog}\n--- Fim da Conversa ---\n`;
    }).join('\n');

    // 2. Prompt System (Engenharia de Prompt Avançada)
    const prompt = `Você é um especialista em Hospitalidade e Gestão de Imóveis no Airbnb.
Sua missão é analisar um histórico de conversas entre anfitriões e hóspedes, identificar gargalos de comunicação e propor melhorias operacionais.

Aqui está o histórico de mensagens (agrupado por hóspede):
<historico>
${formattedHistory}
</historico>

Com base nesse histórico, gere um relatório JSON detalhado contendo:
1. 'faq': As perguntas mais frequentes (agrupadas por similaridade). Forneça a pergunta, a melhor resposta baseada no histórico (ou uma sugestão melhor) e a contagem estimada de vezes que o tema surgiu.
2. 'patterns': Padrões comportamentais notáveis (ex: "Hóspedes frequentemente pedem check-in antecipado nas sextas-feiras" ou "Muitos elogiam a vista").
3. 'gaps': Informações que claramente faltam na descrição do anúncio ou nas mensagens automáticas de boas-vindas.
4. 'communication_tips': Sugestões diretas para o anfitrião melhorar o tom de voz, tempo de resposta ou clareza.
5. 'suggested_automations': Ideias práticas de mensagens programadas (ex: "Agendar envio das regras da piscina 1 dia antes do check-in").`;

    // 3. Schema JSON Rígido
    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        faq: {
          type: Type.ARRAY,
          description: "Perguntas frequentes feitas pelos hóspedes",
          items: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING, description: "A dúvida comum do hóspede" },
              answer: { type: Type.STRING, description: "A resposta ideal padronizada" },
              count: { type: Type.INTEGER, description: "Frequência estimada dessa dúvida" }
            },
            required: ["question", "answer", "count"]
          }
        },
        patterns: { 
          type: Type.ARRAY, 
          items: { type: Type.STRING },
          description: "Padrões de comportamento, horários ou elogios comuns"
        },
        gaps: { 
          type: Type.ARRAY, 
          items: { type: Type.STRING },
          description: "Falhas de comunicação: o que não está claro no anúncio?"
        },
        communication_tips: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Dicas para o anfitrião melhorar o atendimento"
        },
        suggested_automations: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Mensagens que deveriam ser automatizadas para poupar tempo"
        }
      },
      required: ["faq", "patterns", "gaps", "communication_tips", "suggested_automations"]
    };

    try {
      console.log(`[ANALYZER] Iniciando análise de ${conversations.length} conversas com o Gemini...`);
      
      if (!process.env.GEMINI_API_KEY) {
        console.error("[ANALYZER ERROR] GEMINI_API_KEY não está definida.");
        throw new Error("Chave de API do Gemini não configurada.");
      }

      // 4. Chamada da API
      const response = await this.ai.models.generateContent({
        model: "gemini-3-flash-preview", 
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: responseSchema,
          temperature: 0.3 
        }
      });

      if (!response.text) {
        console.error("[ANALYZER ERROR] Resposta vazia da IA.");
        throw new Error("A IA retornou uma resposta vazia.");
      }

      console.log(`[ANALYZER] Análise concluída com sucesso!`);
      return JSON.parse(response.text);

    } catch (error: any) {
      console.error("[ANALYZER ERROR] Falha ao analisar mensagens:", error);
      throw new Error(`Falha na inteligência artificial: ${error.message}`);
    }
  }
}