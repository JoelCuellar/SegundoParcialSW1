import { LlmProvider } from '../llm.provider';
export declare class MockLlmProvider implements LlmProvider {
    suggest({ model }: {
        model: any;
    }): Promise<{
        rationale: string;
        patch: any[];
    }>;
}
