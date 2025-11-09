"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
const hash = (pwd) => bcryptjs_1.default.hashSync(pwd, 10);
function slugify(s) {
    return s
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
}
const modelV1 = {
    entities: [
        {
            name: 'User',
            table: 'users',
            attrs: [
                { name: 'id', type: 'uuid', pk: true, nullable: false },
                { name: 'email', type: 'varchar(255)', unique: true, nullable: false },
            ],
            indexes: [['email']],
        },
        {
            name: 'Order',
            table: 'orders',
            attrs: [
                { name: 'id', type: 'uuid', pk: true, nullable: false },
                { name: 'total', type: 'numeric(12,2)', nullable: false },
                { name: 'user_id', type: 'uuid', nullable: false },
            ],
        },
    ],
    relations: [
        {
            from: 'Order',
            to: 'User',
            kind: 'many-to-one',
            fk: 'user_id',
            onDelete: 'cascade',
            multiplicity: '1..*→1',
        },
    ],
};
const modelV2 = {
    ...modelV1,
    entities: [
        ...modelV1.entities.map((e) => e.name === 'User'
            ? {
                ...e,
                attrs: [
                    ...e.attrs,
                    {
                        name: 'created_at',
                        type: 'timestamp',
                        nullable: false,
                        default: 'now()',
                    },
                ],
            }
            : e),
        {
            name: 'Address',
            table: 'addresses',
            attrs: [
                { name: 'id', type: 'uuid', pk: true, nullable: false },
                { name: 'user_id', type: 'uuid', nullable: false },
                { name: 'line1', type: 'varchar(255)', nullable: false },
                { name: 'city', type: 'varchar(100)', nullable: false },
            ],
        },
    ],
    relations: [
        ...modelV1.relations,
        {
            from: 'Address',
            to: 'User',
            kind: 'many-to-one',
            fk: 'user_id',
            onDelete: 'cascade',
            multiplicity: '1..*→1',
        },
    ],
};
async function main() {
    const [owner, editor, reader] = await Promise.all([
        prisma.user.upsert({
            where: { email: 'owner@example.com' },
            update: {
                name: 'Owner',
                passwordHash: hash('Owner123!'),
                status: 'ACTIVE',
            },
            create: {
                email: 'owner@example.com',
                name: 'Owner',
                passwordHash: hash('Owner123!'),
            },
        }),
        prisma.user.upsert({
            where: { email: 'editor@example.com' },
            update: {
                name: 'Editor',
                passwordHash: hash('Editor123!'),
                status: 'ACTIVE',
            },
            create: {
                email: 'editor@example.com',
                name: 'Editor',
                passwordHash: hash('Editor123!'),
            },
        }),
        prisma.user.upsert({
            where: { email: 'reader@example.com' },
            update: {
                name: 'Reader',
                passwordHash: hash('Reader123!'),
                status: 'ACTIVE',
            },
            create: {
                email: 'reader@example.com',
                name: 'Reader',
                passwordHash: hash('Reader123!'),
            },
        }),
    ]);
    const wsName = 'Equipo Demo';
    const ws = await prisma.workspace.upsert({
        where: { slug: slugify(wsName) },
        update: {},
        create: {
            name: wsName,
            slug: slugify(wsName),
            createdById: owner.id,
            members: {
                create: [
                    { userId: owner.id, role: client_1.WorkspaceRole.OWNER },
                    { userId: editor.id, role: client_1.WorkspaceRole.MEMBER },
                    { userId: reader.id, role: client_1.WorkspaceRole.MEMBER },
                ],
            },
            tags: {
                create: [
                    { name: 'backend', color: '#1f77b4' },
                    { name: 'db', color: '#2ca02c' },
                    { name: 'spring', color: '#d62728' },
                ],
            },
        },
        include: { tags: true },
    });
    const tagId = (name) => ws.tags.find((t) => t.name === name).id;
    const projectName = 'Proyecto Demo';
    const project = await prisma.project.upsert({
        where: {
            workspaceId_name: { workspaceId: ws.id, name: projectName },
        },
        update: {},
        create: {
            workspaceId: ws.id,
            name: projectName,
            description: 'Proyecto inicial de ejemplo',
            status: client_1.ProjectStatus.ACTIVE,
            createdById: owner.id,
            members: {
                create: [
                    { userId: owner.id, role: client_1.ProjectRole.OWNER },
                    { userId: editor.id, role: client_1.ProjectRole.EDITOR },
                    { userId: reader.id, role: client_1.ProjectRole.READER },
                ],
            },
            tags: {
                create: [
                    { tag: { connect: { id: tagId('backend') } } },
                    { tag: { connect: { id: tagId('db') } } },
                    { tag: { connect: { id: tagId('spring') } } },
                ],
            },
        },
    });
    const mainBranch = await prisma.branch.upsert({
        where: { projectId_name: { projectId: project.id, name: 'main' } },
        update: { isDefault: true },
        create: {
            projectId: project.id,
            name: 'main',
            description: 'Rama principal',
            isDefault: true,
            createdById: owner.id,
        },
    });
    const featureBranch = await prisma.branch.upsert({
        where: {
            projectId_name: { projectId: project.id, name: 'feature/normalize' },
        },
        update: {},
        create: {
            projectId: project.id,
            name: 'feature/normalize',
            description: 'Normalización y direcciones',
            createdById: editor.id,
        },
    });
    const v1 = await prisma.modelVersion.create({
        data: {
            projectId: project.id,
            branchId: mainBranch.id,
            authorId: owner.id,
            message: 'v1: modelo base (User, Order)',
            content: modelV1,
        },
    });
    const v2 = await prisma.modelVersion.create({
        data: {
            projectId: project.id,
            branchId: featureBranch.id,
            parentVersionId: v1.id,
            authorId: editor.id,
            message: 'v2 (feature): añade Address y created_at',
            content: modelV2,
        },
    });
    const diff_v1_v2 = await prisma.modelDiff.create({
        data: {
            projectId: project.id,
            fromVersionId: v1.id,
            toVersionId: v2.id,
            diff: {
                addedEntities: ['Address'],
                modifiedEntities: ['User(+created_at)'],
                addedRelations: ['Address→User (N:1)'],
            },
        },
    });
    const v3 = await prisma.modelVersion.create({
        data: {
            projectId: project.id,
            branchId: mainBranch.id,
            parentVersionId: v1.id,
            authorId: owner.id,
            message: 'v3: merge de feature/normalize en main',
            content: modelV2,
        },
    });
    const merge = await prisma.merge.create({
        data: {
            projectId: project.id,
            sourceBranchId: featureBranch.id,
            targetBranchId: mainBranch.id,
            sourceVersionId: v2.id,
            targetVersionId: v1.id,
            resultVersionId: v3.id,
            status: client_1.MergeStatus.COMPLETED,
            createdById: owner.id,
        },
    });
    const validation = await prisma.validationRun.create({
        data: {
            projectId: project.id,
            modelVersionId: v3.id,
            createdById: owner.id,
            status: client_1.JobStatus.SUCCEEDED,
            report: {
                errors: [],
                warnings: [
                    {
                        code: 'IDX_SUGGEST',
                        message: 'Considera índice en orders.user_id',
                    },
                ],
                normalForms: { '1NF': true, '2NF': true, '3NF': true, BCNF: true },
            },
            finishedAt: new Date(),
        },
    });
    const ai = await prisma.aiSuggestion.create({
        data: {
            projectId: project.id,
            modelVersionId: v1.id,
            requestedById: editor.id,
            status: client_1.AiSuggestionStatus.APPLIED,
            rationale: 'Separar Address por 2NF y agregar created_at en User para trazabilidad.',
            proposedPatch: {
                addEntity: 'Address',
                addRelation: 'Address→User',
                addAttr: 'User.created_at',
            },
            appliedById: owner.id,
            appliedVersionId: v2.id,
        },
    });
    const cfg = await prisma.codegenConfig.create({
        data: {
            projectId: project.id,
            name: 'spring-postgres-flyway',
            dbEngine: client_1.DbEngine.POSTGRESQL,
            migrationTool: client_1.MigrationTool.FLYWAY,
            packageBase: 'com.demo.app',
            options: { dto: true, mapstruct: true, security: 'jwt' },
        },
    });
    const job = await prisma.job.create({
        data: {
            projectId: project.id,
            modelVersionId: v3.id,
            codegenConfigId: cfg.id,
            type: client_1.JobType.CODEGEN,
            status: client_1.JobStatus.SUCCEEDED,
            params: { target: 'zip', format: 'maven' },
            queuedAt: new Date(Date.now() - 2 * 60 * 1000),
            startedAt: new Date(Date.now() - 60 * 1000),
            finishedAt: new Date(),
            createdById: owner.id,
        },
    });
    await prisma.artifact.createMany({
        data: [
            {
                projectId: project.id,
                modelVersionId: v3.id,
                jobId: job.id,
                codegenConfigId: cfg.id,
                type: client_1.ArtifactType.SQL_DDL,
                storageBucket: 'dev',
                storageKey: `projects/${project.id}/v3/sql-ddl.sql`,
                sizeBytes: BigInt(2048),
                checksumSha256: 'fake-sum-sql',
                metadata: { engine: 'postgres', version: '15' },
            },
            {
                projectId: project.id,
                modelVersionId: v3.id,
                jobId: job.id,
                codegenConfigId: cfg.id,
                type: client_1.ArtifactType.MIGRATIONS_FLYWAY,
                storageBucket: 'dev',
                storageKey: `projects/${project.id}/v3/flyway.zip`,
                sizeBytes: BigInt(4096),
                checksumSha256: 'fake-sum-flyway',
                metadata: { tool: 'flyway' },
            },
            {
                projectId: project.id,
                modelVersionId: v3.id,
                jobId: job.id,
                codegenConfigId: cfg.id,
                type: client_1.ArtifactType.SPRING_BOOT_PROJECT,
                storageBucket: 'dev',
                storageKey: `projects/${project.id}/v3/springboot.zip`,
                sizeBytes: BigInt(1024 * 1024),
                checksumSha256: 'fake-sum-spring',
                metadata: { build: 'maven' },
            },
            {
                projectId: project.id,
                modelVersionId: v3.id,
                jobId: job.id,
                codegenConfigId: cfg.id,
                type: client_1.ArtifactType.POSTMAN_COLLECTION,
                storageBucket: 'dev',
                storageKey: `projects/${project.id}/v3/postman.json`,
                sizeBytes: BigInt(9000),
                checksumSha256: 'fake-sum-postman',
                metadata: { from: 'openapi' },
            },
        ],
    });
    await prisma.auditLog.createMany({
        data: [
            {
                workspaceId: ws.id,
                projectId: project.id,
                actorId: owner.id,
                action: 'PROJECT_CREATE',
                targetType: 'Project',
                targetId: project.id,
                metadata: { name: project.name },
            },
            {
                workspaceId: ws.id,
                projectId: project.id,
                actorId: owner.id,
                action: 'MODEL_SNAPSHOT',
                targetType: 'ModelVersion',
                targetId: v1.id,
                metadata: { message: 'v1' },
            },
            {
                workspaceId: ws.id,
                projectId: project.id,
                actorId: editor.id,
                action: 'MODEL_SNAPSHOT',
                targetType: 'ModelVersion',
                targetId: v2.id,
                metadata: { message: 'v2' },
            },
            {
                workspaceId: ws.id,
                projectId: project.id,
                actorId: owner.id,
                action: 'MERGE',
                targetType: 'Merge',
                targetId: merge.id,
                metadata: { from: featureBranch.name, to: mainBranch.name },
            },
            {
                workspaceId: ws.id,
                projectId: project.id,
                actorId: owner.id,
                action: 'ARTIFACT_GENERATE',
                targetType: 'Job',
                targetId: job.id,
                metadata: { artifacts: 4 },
            },
        ],
    });
    console.log('✅ Seed completado');
    console.table({
        workspace: ws.slug,
        project: project.name,
        mainBranch: mainBranch.name,
        featureBranch: featureBranch.name,
    });
}
main()
    .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map