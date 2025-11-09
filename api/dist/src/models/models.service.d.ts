import { PrismaService } from '../prisma/prisma.service';
type EntityAttr = {
    name: string;
    type: string;
    pk?: boolean;
    unique?: boolean;
    nullable?: boolean;
};
type Entity = {
    id?: string;
    name: string;
    stereotype?: string;
    isInterface?: boolean;
    isAbstract?: boolean;
    attrs: EntityAttr[];
};
type RelationKind = 'association' | 'aggregation' | 'composition' | 'generalization' | 'realization' | 'dependency' | 'inheritance';
type Relation = {
    from: string;
    to: string;
    kind: RelationKind;
    fromCard?: string;
    via?: string;
    toCard?: string;
    fk?: string;
    onDelete?: 'cascade' | 'restrict' | 'setnull';
};
type DSL = {
    entities: Entity[];
    relations: Relation[];
    constraints?: any[];
};
export declare class ModelsService {
    private prisma;
    constructor(prisma: PrismaService);
    private getOrCreateDefaultBranch;
    private latestVersion;
    getCurrent(projectId: string, userId: string, branchId?: string): Promise<{
        branchId: string;
        versionId: string;
        content: import("@prisma/client/runtime/library").JsonValue;
    }>;
    saveNewVersion(projectId: string, userId: string, body: {
        branchId?: string;
        message?: string;
        content: DSL;
    }): Promise<{
        versionId: string;
        createdAt: Date;
    }>;
}
export {};
