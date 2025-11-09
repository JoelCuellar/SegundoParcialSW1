import type { Request } from 'express';
import { VersionsService } from './versions.service';
export declare class VersionsController {
    private readonly svc;
    constructor(svc: VersionsService);
    listBranches(projectId: string): Promise<{
        latestVersion: {
            id: string;
            createdAt: Date;
            message: string | null;
        };
        versions: undefined;
        id: string;
        name: string;
        createdAt: Date;
        isDefault: boolean;
    }[]>;
    createBranch(projectId: string, body: {
        name: string;
        fromVersionId?: string;
    }, req: Request): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        description: string | null;
        createdById: string;
        projectId: string;
        isDefault: boolean;
    }>;
    listVersions(projectId: string, branchId: string, take?: string): Promise<{
        id: string;
        createdAt: Date;
        message: string | null;
        author: {
            id: string;
            email: string;
            name: string | null;
        };
    }[]>;
    diff(projectId: string, from: string, to: string): Promise<{
        summary: {
            entities: {
                added: number;
                removed: number;
                changed: number;
            };
            relations: {
                added: number;
                removed: number;
                changed: number;
            };
        };
        entities: {
            added: {
                name: string;
                stereotype?: string;
                attrs: {
                    name: string;
                    type: string;
                    pk?: boolean;
                    unique?: boolean;
                    nullable?: boolean;
                }[];
            }[];
            removed: {
                name: string;
                stereotype?: string;
                attrs: {
                    name: string;
                    type: string;
                    pk?: boolean;
                    unique?: boolean;
                    nullable?: boolean;
                }[];
            }[];
            changed: any[];
        };
        relations: {
            added: {
                from: string;
                to: string;
                kind: "association" | "aggregation" | "composition";
                fromCard?: string;
                toCard?: string;
            }[];
            removed: {
                from: string;
                to: string;
                kind: "association" | "aggregation" | "composition";
                fromCard?: string;
                toCard?: string;
            }[];
            changed: any[];
        };
    }>;
    restore(projectId: string, body: {
        versionId: string;
        message?: string;
    }, req: Request): Promise<{
        id: string;
        createdAt: Date;
        projectId: string;
        message: string | null;
        content: import("@prisma/client/runtime/library").JsonValue;
        ydocSnapshot: import("@prisma/client/runtime/library").Bytes | null;
        branchId: string;
        parentVersionId: string | null;
        authorId: string;
    }>;
    merge(projectId: string, body: {
        sourceBranchId: string;
        targetBranchId: string;
        sourceVersionId: string;
        targetVersionId: string;
    }, req: Request): Promise<{
        mergeId: string;
        status: string;
        conflicts: any[];
        resultVersionId: string;
    }>;
}
