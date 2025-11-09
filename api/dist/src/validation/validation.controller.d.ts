import type { Request } from 'express';
import { ValidationService } from './validation.service';
export declare class ValidationController {
    private readonly svc;
    constructor(svc: ValidationService);
    list(projectId: string): import("@prisma/client").Prisma.PrismaPromise<{
        id: string;
        status: import("@prisma/client").$Enums.JobStatus;
        createdAt: Date;
        createdById: string;
        projectId: string;
        report: import("@prisma/client/runtime/library").JsonValue | null;
        finishedAt: Date | null;
        modelVersionId: string;
    }[]>;
    get(projectId: string, runId: string): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.JobStatus;
        createdAt: Date;
        createdById: string;
        projectId: string;
        report: import("@prisma/client/runtime/library").JsonValue | null;
        finishedAt: Date | null;
        modelVersionId: string;
    }>;
    run(projectId: string, body: {
        modelVersionId: string;
        timeoutMs?: number;
    }, req: Request): Promise<{
        id: string;
        status: string;
        report: {
            errors: {
                code: string;
                severity: "ERROR" | "WARNING";
                message: string;
                location?: string;
            }[];
            warnings: {
                code: string;
                severity: "ERROR" | "WARNING";
                message: string;
                location?: string;
            }[];
        };
    }>;
    cancel(projectId: string, runId: string, req: Request): Promise<{
        ok: boolean;
        reason: string;
        status?: undefined;
    } | {
        ok: boolean;
        status: string;
        reason?: undefined;
    }>;
}
