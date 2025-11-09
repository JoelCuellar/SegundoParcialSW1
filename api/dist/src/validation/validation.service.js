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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidationService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let ValidationService = class ValidationService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    listRuns(projectId) {
        return this.prisma.validationRun.findMany({
            where: { projectId },
            orderBy: { createdAt: 'desc' },
        });
    }
    async getRun(projectId, runId) {
        const run = await this.prisma.validationRun.findFirst({
            where: { id: runId, projectId },
        });
        if (!run)
            throw new common_1.NotFoundException('ValidationRun no existe');
        return run;
    }
    async run(projectId, modelVersionId, userId, timeoutMs = 15000) {
        const version = await this.prisma.modelVersion.findFirst({
            where: { id: modelVersionId, projectId },
        });
        if (!version)
            throw new common_1.NotFoundException('ModelVersion no existe');
        const run = await this.prisma.validationRun.create({
            data: {
                projectId,
                modelVersionId,
                createdById: userId,
                status: 'QUEUED',
            },
        });
        await this.prisma.validationRun.update({
            where: { id: run.id },
            data: { status: 'RUNNING' },
        });
        try {
            const report = await withTimeout(() => this.validate(version.content), timeoutMs);
            await this.prisma.validationRun.update({
                where: { id: run.id },
                data: { status: 'SUCCEEDED', report, finishedAt: new Date() },
            });
            await this.prisma.auditLog.create({
                data: {
                    projectId,
                    actorId: userId,
                    action: 'VALIDATION_RUN',
                    targetType: 'ValidationRun',
                    targetId: run.id,
                    metadata: {
                        errors: report.errors.length,
                        warnings: report.warnings.length,
                        modelVersionId,
                    },
                },
            });
            return { id: run.id, status: 'SUCCEEDED', report };
        }
        catch (e) {
            const isTimeout = e?.code === 'ETIMEDOUT';
            await this.prisma.validationRun.update({
                where: { id: run.id },
                data: {
                    status: isTimeout ? 'TIMED_OUT' : 'FAILED',
                    report: isTimeout
                        ? { error: 'Timeout' }
                        : { error: String(e?.message || e) },
                    finishedAt: new Date(),
                },
            });
            throw e;
        }
    }
    async cancel(projectId, runId, userId) {
        const run = await this.prisma.validationRun.findFirst({
            where: { id: runId, projectId },
        });
        if (!run)
            throw new common_1.NotFoundException('ValidationRun no existe');
        if (!['QUEUED', 'RUNNING'].includes(run.status)) {
            return { ok: false, reason: 'No cancelable' };
        }
        await this.prisma.validationRun.update({
            where: { id: runId },
            data: {
                status: 'CANCELED',
                finishedAt: new Date(),
                report: { canceledBy: userId },
            },
        });
        return { ok: true, status: 'CANCELED' };
    }
    validate(dsl) {
        const errors = [];
        const warnings = [];
        for (const e of dsl.entities ?? []) {
            const hasPk = (e.attrs ?? []).some((a) => a.pk || a.name?.toLowerCase() === 'id');
            if (!hasPk) {
                errors.push({
                    code: 'MISSING_PK',
                    severity: 'ERROR',
                    message: `La entidad ${e.name} no tiene PK`,
                    location: `/entities[name=${e.name}]`,
                });
            }
        }
        for (const r of dsl.relations ?? []) {
            const joined = `${r.fromCard}:${r.toCard}`;
            const ok = [
                '1:1',
                '1:N',
                'N:1',
                'N:N',
                'undefined:undefined',
                'undefined:1',
                '1:undefined',
            ].includes(joined);
            if (!ok) {
                errors.push({
                    code: 'CARDINALITY_INVALID',
                    severity: 'ERROR',
                    message: `Cardinalidad inválida en ${r.from}→${r.to}`,
                    location: `/relations[from=${r.from}][to=${r.to}]`,
                });
            }
        }
        for (const e of dsl.entities ?? []) {
            for (const a of e.attrs ?? []) {
                const t = a.type;
                if (Array.isArray(t) || (typeof t === 'object' && t?.compound)) {
                    warnings.push({
                        code: 'NF1_VIOLATION',
                        severity: 'WARNING',
                        message: `Atributo no atómico ${e.name}.${a.name}`,
                        location: `/entities[name=${e.name}]/attrs[name=${a.name}]`,
                    });
                }
            }
        }
        return { errors, warnings };
    }
};
exports.ValidationService = ValidationService;
exports.ValidationService = ValidationService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ValidationService);
function withTimeout(fn, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            const err = new Error('Timeout');
            err.code = 'ETIMEDOUT';
            reject(err);
        }, timeoutMs);
        Promise.resolve()
            .then(fn)
            .then((value) => {
            clearTimeout(timer);
            resolve(value);
        })
            .catch((err) => {
            clearTimeout(timer);
            reject(err instanceof Error
                ? err
                : new Error(typeof err === 'string' ? err : JSON.stringify(err)));
        });
    });
}
//# sourceMappingURL=validation.service.js.map