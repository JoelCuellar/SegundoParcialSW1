import { PrismaService } from 'src/prisma/prisma.service';
type Issue = {
    code: string;
    severity: 'ERROR' | 'WARNING';
    message: string;
    location?: string;
};
type Report = {
    errors: Issue[];
    warnings: Issue[];
};
export declare class ValidationService {
    private prisma;
    constructor(prisma: PrismaService);
    listRuns(projectId: string): import("@prisma/client").Prisma.PrismaPromise<{
        id: string;
        status: import("@prisma/client").$Enums.JobStatus;
        createdAt: Date;
        createdById: string;
        projectId: string;
        report: import("@prisma/client/runtime/library").JsonValue | null;
        finishedAt: Date | null;
        modelVersionId: string;
    }[]>;
    getRun(projectId: string, runId: string): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.JobStatus;
        createdAt: Date;
        createdById: string;
        projectId: string;
        report: import("@prisma/client/runtime/library").JsonValue | null;
        finishedAt: Date | null;
        modelVersionId: string;
    }>;
    run(projectId: string, modelVersionId: string, userId: string, timeoutMs?: number): Promise<{
        id: string;
        status: string;
        report: Report;
    }>;
    cancel(projectId: string, runId: string, userId: string): Promise<{
        ok: boolean;
        reason: string;
        status?: undefined;
    } | {
        ok: boolean;
        status: string;
        reason?: undefined;
    }>;
    private validate;
}
export {};
