type EntityAttr = {
    name: string;
    type: string;
    pk?: boolean;
    unique?: boolean;
    nullable?: boolean;
};
type Entity = {
    name: string;
    stereotype?: string;
    isInterface?: boolean;
    isAbstract?: boolean;
    attrs: EntityAttr[];
};
type Relation = {
    from: string;
    to: string;
    kind: 'association' | 'aggregation' | 'composition' | 'generalization' | 'realization' | 'dependency';
    fromCard?: string;
    toCard?: string;
    via?: string;
};
export type DSL = {
    entities: Entity[];
    relations: Relation[];
    constraints?: any[];
};
export declare class UmlVisionService {
    private readonly logger;
    private normalizeOcr;
    private parseCardinality;
    private extractRelationsFromOcr;
    parseImage(buffer: Buffer): Promise<{
        dsl: DSL;
        ocrText: string;
        stats: any;
    }>;
    private textToDsl;
}
export {};
