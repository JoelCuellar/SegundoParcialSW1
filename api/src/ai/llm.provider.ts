export interface LlmProvider {
  suggest(input: {
    model: any;
    scope?: 'ALL' | 'CLASSES' | 'RELATIONSHIPS' | 'ATTRIBUTES' | 'DATATYPES';
    promptHints?: string;
  }): Promise<{ rationale: string; patch: any[] }>; // JSON Patch con selectores por nombre
}
