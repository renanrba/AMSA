export interface AirbnbMessage {
  id: string;
  senderName: string;
  text: string;
  timestamp: string;
  date?: string;
  role: 'guest' | 'host';
}

export interface Conversation {
  id: string;
  guestName: string;
  guestPhoto?: string;
  listingName?: string;
  checkIn?: string;
  checkOut?: string;
  url: string;
  snippet: string;
  messages: AirbnbMessage[];
  status: 'pending' | 'scraping' | 'completed' | 'error';
}

export interface AnalysisResult {
  faq: {
    question: string;
    answer: string;
    count: number;
  }[];
  patterns: string[];
  gaps: string[];
  communication_tips: string[];
  suggested_automations: string[];
}
