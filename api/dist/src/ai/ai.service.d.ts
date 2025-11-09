import { PrismaService } from '../prisma/prisma.service';
import type { LlmProvider } from './llm.provider';
export declare class AiService {
    private prisma;
    private llm;
    constructor(prisma: PrismaService, llm: LlmProvider);
    list(projectId: string): import("@prisma/client").Prisma.PrismaPromise<{
        id: string;
        status: import("@prisma/client").$Enums.AiSuggestionStatus;
        createdAt: Date;
        updatedAt: Date;
        projectId: string;
        modelVersionId: string;
        rationale: string | null;
        proposedPatch: import("@prisma/client/runtime/library").JsonValue;
        requestedById: string;
        appliedById: string | null;
        appliedVersionId: string | null;
    }[]>;
    request(projectId: string, modelVersionId: string, userId: string, scope?: any, promptHints?: string): Promise<{
        suggestion: {
            id: string;
            status: import("@prisma/client").$Enums.AiSuggestionStatus;
            createdAt: Date;
            updatedAt: Date;
            projectId: string;
            modelVersionId: string;
            rationale: string | null;
            proposedPatch: import("@prisma/client/runtime/library").JsonValue;
            requestedById: string;
            appliedById: string | null;
            appliedVersionId: string | null;
        };
        previewDiff: {
            from: import("@prisma/client/runtime/library").JsonValue;
            to: any;
        };
    }>;
    apply(projectId: string, sid: string, userId: string, includePaths?: string[]): Promise<{
        appliedVersionId: string;
    }>;
    reject(projectId: string, sid: string, userId: string): Promise<{
        status: string;
    }>;
}
