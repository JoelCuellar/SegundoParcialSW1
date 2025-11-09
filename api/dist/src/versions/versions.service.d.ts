import { PrismaService } from '../prisma/prisma.service';
type Attr = {
    name: string;
    type: string;
    pk?: boolean;
    unique?: boolean;
    nullable?: boolean;
};
type Entity = {
    name: string;
    stereotype?: string;
    attrs: Attr[];
};
type Relation = {
    from: string;
    to: string;
    kind: 'association' | 'aggregation' | 'composition';
    fromCard?: string;
    toCard?: string;
};
export declare class VersionsService {
    private prisma;
    constructor(prisma: PrismaService);
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
    createBranch(projectId: string, userId: string, name: string, fromVersionId?: string): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        description: string | null;
        createdById: string;
        projectId: string;
        isDefault: boolean;
    }>;
    listVersions(projectId: string, branchId: string, take?: number): Promise<{
        id: string;
        createdAt: Date;
        message: string | null;
        author: {
            id: string;
            email: string;
            name: string | null;
        };
    }[]>;
    private indexByName;
    private sameAttr;
    private diffEntities;
    private keyRel;
    private diffRelations;
    private getVersion;
    diff(projectId: string, fromVersionId: string, toVersionId: string): Promise<{
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
            added: Entity[];
            removed: Entity[];
            changed: any[];
        };
        relations: {
            added: Relation[];
            removed: Relation[];
            changed: any[];
        };
    }>;
    restore(projectId: string, userId: string, versionId: string, message?: string): Promise<{
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
    private traceParents;
    private findCommonAncestor;
    private indexEntities;
    private indexRelations;
    private threeWayMerge;
    merge(projectId: string, userId: string, params: {
        sourceBranchId: string;
        targetBranchId: string;
        sourceVersionId: string;
        targetVersionId: string;
    }): Promise<{
        mergeId: string;
        status: string;
        conflicts: any[];
        resultVersionId: string;
    }>;
}
export {};
