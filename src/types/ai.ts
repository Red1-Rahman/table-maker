export type ProviderId = 'openai' | 'gemini' | 'anthropic';

export interface ProviderConfig {
  id: ProviderId;
  apiKey: string;
  model: string;
  enabled: boolean;
}

export interface AISettings {
  providers: ProviderConfig[]; // order = priority
  autoSwitch: boolean;
  activeProvider: ProviderId | null;
}

export interface AIRequest {
  system: string;
  prompt: string;
}

export interface AIAdapter {
  complete(req: AIRequest, cfg: ProviderConfig, signal?: AbortSignal): Promise<string>;
}

/** A cell as returned by a model. */
export type AICell =
  | string
  | number
  | boolean
  | null
  | {
      v?: string | number | boolean | null;
      image?: boolean;
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      color?: string;
      bg?: string;
      align?: 'left' | 'center' | 'right';
    };

export interface AIResult {
  message: string;
  table?: {
    rows: AICell[][];
    merges?: string[]; // A1 ranges
    columnWidths?: number[];
  };
}

export class AIError extends Error {
  constructor(
    message: string,
    public status?: number,
    public provider?: ProviderId,
  ) {
    super(message);
    this.name = 'AIError';
  }
}
