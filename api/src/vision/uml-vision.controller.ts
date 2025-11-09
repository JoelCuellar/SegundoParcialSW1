import {
  Body,
  Controller,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards';
import { UmlVisionService } from './uml-vision.service';
import { PrismaService } from '../prisma/prisma.service';
import { ModelsService } from '../models/models.service';
import type { DSL } from './uml-vision.service';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/uml')
export class UmlVisionController {
  constructor(
    private readonly svc: UmlVisionService,
    private readonly prisma: PrismaService,
    private readonly models: ModelsService,
  ) {}

  @Post('parse-image')
  @UseInterceptors(FileInterceptor('file'))
  async parseImage(
    @Param('projectId') projectId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Falta archivo');
    const res = await this.svc.parseImage(file.buffer);

    const artifact = await this.prisma.artifact.create({
      data: {
        projectId,
        type: 'OTHER', // si quieres, extiende el enum con UML_IMAGE
        storageBucket: 'local',
        storageKey: await this.saveLocal(
          `imports/${projectId}/${Date.now()}_${file.originalname}`,
          file.buffer,
        ),
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

  @Post('import-image')
  @UseInterceptors(FileInterceptor('file'))
  async importImage(
    @Param('projectId') projectId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body()
    body: { branchId?: string; merge?: 'merge' | 'replace'; message?: string },
    @Req() req: Request,
  ) {
    if (!file) throw new BadRequestException('Falta archivo');
    const userId =
      ((req as any).user?.userId as string) ||
      ((req as any).user?.sub as string);

    const { dsl, stats } = await this.svc.parseImage(file.buffer);

    // Resolver branch usando SOLO métodos públicos
    const current = await this.models.getCurrent(
      projectId,
      userId,
      body.branchId,
    );

    const branchId =
      (current as any)?.branchId ??
      (current as any)?.branch?.id ??
      body.branchId;

    if (!branchId) {
      throw new BadRequestException(
        'No se pudo resolver la rama (branchId).',
      );
    }

    // Merge del DSL (o reemplazo)
    let merged: DSL = dsl;
    if (body.merge !== 'replace' && (current as any)?.content) {
      merged = this.mergeDsl((current as any).content as DSL, dsl);
    }

    // Guardar nueva versión
    const saved = await this.models.saveNewVersion(projectId, userId, {
      branchId,
      message: body.message || 'Importación desde imagen (UML OCR)',
      content: merged,
    } as any);

    // Guardar la imagen como artifact asociado a esa versión
    await this.prisma.artifact.create({
      data: {
        projectId,
        modelVersionId: saved.versionId,
        type: 'OTHER',
        storageBucket: 'local',
        storageKey: await this.saveLocal(
          `imports/${projectId}/${saved.versionId}_${file.originalname}`,
          file.buffer,
        ),
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

  private async saveLocal(rel: string, buf: Buffer): Promise<string> {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const full = path.join(process.cwd(), 'storage', rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, buf);
    return rel;
  }

  // merge ingenuo por nombre de clase y atributo
  private mergeDsl(base: DSL, inc: DSL): DSL {
    const entities = [...(base.entities || [])];

    for (const e of inc.entities || []) {
      const target = entities.find(
        (x) => x.name.toLowerCase() === e.name.toLowerCase(),
      );
      if (!target) {
        entities.push(e);
      } else {
        target.stereotype ||= e.stereotype;
        target.attrs ||= [];
        for (const a of e.attrs || []) {
          if (
            !target.attrs.some(
              (x) => x.name.toLowerCase() === a.name.toLowerCase(),
            )
          ) {
            target.attrs.push(a);
          }
        }
      }
    }

    const rels = [...(base.relations || [])];
    for (const r of inc.relations || []) {
      if (
        !rels.some(
          (x) => x.from === r.from && x.to === r.to && x.kind === r.kind,
        )
      ) {
        rels.push(r);
      }
    }

    return { entities, relations: rels, constraints: base.constraints || [] };
  }
}
