import type { Request } from 'express';
import { AiService } from './ai.service';
export declare class AiController {
    private readonly svc;
    constructor(svc: AiService);
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
    request(projectId: string, body: {
        modelVersionId: string;
        scope?: 'ALL' | 'CLASSES' | 'RELATIONSHIPS' | 'ATTRIBUTES' | 'DATATYPES';
        promptHints?: string;
    }, req: Request): Promise<{
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
    apply(projectId: string, sid: string, body: {
        includePaths?: string[];
    }, req: Request): Promise<{
        appliedVersionId: string;
    }>;
    reject(projectId: string, sid: string, req: Request): Promise<{
        status: string;
    }>;
}
