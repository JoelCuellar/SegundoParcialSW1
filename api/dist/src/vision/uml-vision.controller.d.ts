import type { Request } from 'express';
import { UmlVisionService } from './uml-vision.service';
import { PrismaService } from '../prisma/prisma.service';
import { ModelsService } from '../models/models.service';
import type { DSL } from './uml-vision.service';
export declare class UmlVisionController {
    private readonly svc;
    private readonly prisma;
    private readonly models;
    constructor(svc: UmlVisionService, prisma: PrismaService, models: ModelsService);
    parseImage(projectId: string, file: Express.Multer.File): Promise<{
        dsl: DSL;
        ocrText: string;
        stats: any;
        artifactId: string;
    }>;
    importImage(projectId: string, file: Express.Multer.File, body: {
        branchId?: string;
        merge?: 'merge' | 'replace';
        message?: string;
    }, req: Request): Promise<{
        versionId: string;
        branchId: any;
        stats: any;
        insertedEntities: number;
    }>;
    private saveLocal;
    private mergeDsl;
}
