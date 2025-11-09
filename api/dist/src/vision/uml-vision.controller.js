"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UmlVisionController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const guards_1 = require("../auth/guards");
const uml_vision_service_1 = require("./uml-vision.service");
const prisma_service_1 = require("../prisma/prisma.service");
const models_service_1 = require("../models/models.service");
let UmlVisionController = class UmlVisionController {
    svc;
    prisma;
    models;
    constructor(svc, prisma, models) {
        this.svc = svc;
        this.prisma = prisma;
        this.models = models;
    }
    async parseImage(projectId, file) {
        if (!file)
            throw new common_1.BadRequestException('Falta archivo');
        const res = await this.svc.parseImage(file.buffer);
        const artifact = await this.prisma.artifact.create({
            data: {
                projectId,
                type: 'OTHER',
                storageBucket: 'local',
                storageKey: await this.saveLocal(`imports/${projectId}/${Date.now()}_${file.originalname}`, file.buffer),
                metadata: {
                    kind: 'UML_IMAGE_IMPORT',
                    filename: file.originalname,
                    stats: res.stats,
                },
            },
            select: { id: true, storageKey: true },
        });
        return { artifactId: artifact.id, ...res };
    }
    async importImage(projectId, file, body, req) {
        if (!file)
            throw new common_1.BadRequestException('Falta archivo');
        const userId = req.user?.userId ||
            req.user?.sub;
        const { dsl, stats } = await this.svc.parseImage(file.buffer);
        const current = await this.models.getCurrent(projectId, userId, body.branchId);
        const branchId = current?.branchId ??
            current?.branch?.id ??
            body.branchId;
        if (!branchId) {
            throw new common_1.BadRequestException('No se pudo resolver la rama (branchId).');
        }
        let merged = dsl;
        if (body.merge !== 'replace' && current?.content) {
            merged = this.mergeDsl(current.content, dsl);
        }
        const saved = await this.models.saveNewVersion(projectId, userId, {
            branchId,
            message: body.message || 'Importación desde imagen (UML OCR)',
            content: merged,
        });
        await this.prisma.artifact.create({
            data: {
                projectId,
                modelVersionId: saved.versionId,
                type: 'OTHER',
                storageBucket: 'local',
                storageKey: await this.saveLocal(`imports/${projectId}/${saved.versionId}_${file.originalname}`, file.buffer),
                metadata: {
                    kind: 'UML_IMAGE_IMPORT',
                    filename: file.originalname,
                    stats,
                },
            },
        });
        return {
            versionId: saved.versionId,
            branchId,
            stats,
            insertedEntities: dsl.entities.length,
        };
    }
    async saveLocal(rel, buf) {
        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        const full = path.join(process.cwd(), 'storage', rel);
        await fs.mkdir(path.dirname(full), { recursive: true });
        await fs.writeFile(full, buf);
        return rel;
    }
    mergeDsl(base, inc) {
        const entities = [...(base.entities || [])];
        for (const e of inc.entities || []) {
            const target = entities.find((x) => x.name.toLowerCase() === e.name.toLowerCase());
            if (!target) {
                entities.push(e);
            }
            else {
                target.stereotype ||= e.stereotype;
                target.attrs ||= [];
                for (const a of e.attrs || []) {
                    if (!target.attrs.some((x) => x.name.toLowerCase() === a.name.toLowerCase())) {
                        target.attrs.push(a);
                    }
                }
            }
        }
        const rels = [...(base.relations || [])];
        for (const r of inc.relations || []) {
            if (!rels.some((x) => x.from === r.from && x.to === r.to && x.kind === r.kind)) {
                rels.push(r);
            }
        }
        return { entities, relations: rels, constraints: base.constraints || [] };
    }
};
exports.UmlVisionController = UmlVisionController;
__decorate([
    (0, common_1.Post)('parse-image'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file')),
    __param(0, (0, common_1.Param)('projectId')),
    __param(1, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], UmlVisionController.prototype, "parseImage", null);
__decorate([
    (0, common_1.Post)('import-image'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file')),
    __param(0, (0, common_1.Param)('projectId')),
    __param(1, (0, common_1.UploadedFile)()),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], UmlVisionController.prototype, "importImage", null);
exports.UmlVisionController = UmlVisionController = __decorate([
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard),
    (0, common_1.Controller)('projects/:projectId/uml'),
    __metadata("design:paramtypes", [uml_vision_service_1.UmlVisionService,
        prisma_service_1.PrismaService,
        models_service_1.ModelsService])
], UmlVisionController);
//# sourceMappingURL=uml-vision.controller.js.map