import { Injectable, Logger } from '@nestjs/common';
import * as Tesseract from 'tesseract.js';
import sharp from 'sharp';

type EntityAttr = {
  name: string;
  type: string;
  pk?: boolean;
  unique?: boolean;
  nullable?: boolean;
};
type ParsedAttr = {
  name: string;
  type: string;
  pk?: boolean;
  unique?: boolean;
  nullable?: boolean;
  visibility?: '+' | '-' | '#' | '~';
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
  kind:
    | 'association'
    | 'aggregation'
    | 'composition'
    | 'generalization'
    | 'realization'
    | 'dependency';
  fromCard?: string;
  toCard?: string;
  via?: string;
};
export type DSL = {
  entities: Entity[];
  relations: Relation[];
  constraints?: any[];
};

// ---------- Helpers Parser Atributos (UML OCR) ----------

function looksLikeMethod(line: string): boolean {
  const L = line.trim();
  // nombre(...) o nombre ( ... )
  return /[A-Za-z_]\w*\s*\(.*\)/.test(L);
}

// Parsea una sola línea de atributo
function parseAttributeLine(line: string): ParsedAttr | null {
  // Normaliza espacios
  const L = line.replace(/\s+/g, ' ').trim();
  if (!L) return null;

  // Ignoramos métodos
  if (looksLikeMethod(L)) return null;

  // Patrón general:
  // [vis]? name[*] [: type?] [= default]? [{ flags }]?
  // ejemplos válidos:
  // +id*: UUID {pk}
  // nombre : string?
  // createdAt: DateTime = now()
  // #monto: Decimal(10,2) {unique, nullable}
  const m = L.match(
    /^([+\-#~])?\s*([A-Za-z_][\w$]*\*?)\s*(?::\s*([^=<{]+(?:<[^>]+>)?(?:\[\])?|\S+))?\s*(?:=\s*[^{}]+)?\s*(?:\{([^}]*)\})?$/i,
  );
  if (!m) return null;

  const [, vis, rawName, rawType, flagsRaw] = m;

  // name puede venir con * al final para denotar PK visual
  const name = (rawName ?? '').replace(/\*+$/, '');
  let type = (rawType ?? 'any').trim();

  // Soporte de nullability por sufijo ?, ej: string?
  let nullable = /\?$/.test(type);
  type = type.replace(/\?$/, '');

  const flags = (flagsRaw || '').toLowerCase();

  const attr: ParsedAttr = {
    name,
    type,
    visibility: (vis as ParsedAttr['visibility']) || undefined,
    pk: /\bpk\b/.test(flags) || /\*$/.test(rawName || ''), // {pk} o nombre*
    unique: /\bunique\b/.test(flags),
    nullable: nullable || /\bnull(?:able)?\b/.test(flags),
  };

  // saneo tipo (espacios de más)
  attr.type = attr.type.replace(/\s+/g, ' ').trim();

  // rechaza líneas sin nombre real
  if (!attr.name) return null;

  return attr;
}

// Parsea un bloque de texto (la sección de atributos) a una lista de atributos
function parseAttributesFromBlock(block: string): ParsedAttr[] {
  const attrs: ParsedAttr[] = [];

  // separa por líneas, filtra basura (líneas separadoras o encabezados)
  const lines = block
    .split(/\r?\n/)
    .map((s) => s.replace(/[│┃|]+/g, ' ').trim()) // limpia pipes verticales que a veces mete el OCR
    .filter((s) => !!s && !/^(-{2,}|={2,}|_+)$/.test(s)) // quita separadores
    .filter(
      (s) => !/^(atributos|attributes|propiedades|properties)\b/i.test(s),
    ); // evita encabezados

  for (const line of lines) {
    const parsed = parseAttributeLine(line);
    if (parsed) attrs.push(parsed);
  }

  // deduplicar por nombre (case-insensitive) conservando el primero válido
  const dedup = new Map<string, ParsedAttr>();
  for (const a of attrs) {
    const key = a.name.toLowerCase();
    if (!dedup.has(key)) dedup.set(key, a);
  }
  return [...dedup.values()];
}

// Detecta si una línea tiene estereotipo con cualquiera de las comillas («», <<>>)
function extractStereotype(line: string): string | '' {
  const trimmed = line.trim();
  // <<interface>> o <<abstract>>
  const m1 = trimmed.match(/^<<\s*([^>]+)\s*>>$/i);
  if (m1) return m1[1].trim();
  // «interface» o «abstract»
  const m2 = trimmed.match(/^«\s*([^»]+)\s*»$/i);
  if (m2) return m2[1].trim();
  return '';
}

@Injectable()
export class UmlVisionService {
  private readonly logger = new Logger(UmlVisionService.name);

  // ---------- Heurísticas OCR para RELACIONES ----------

  /** Normaliza símbolos y espacios raros del OCR para facilitar regex */
  private normalizeOcr(raw: string): string {
    return (raw || '')
      .replace(/[–—−]/g, '-') // guiones raros → '-'
      .replace(/[•·]/g, '.') // bullets → '.'
      .replace(/[→➔➤➝➛➜]/g, '>') // flechas → '>'
      .replace(/\u00A0/g, ' ') // nbsp → espacio normal
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  /** Parsea cardinalidades básicas: 1, 0..1, *, 1..*, n */
  private parseCardinality(raw?: string): string | undefined {
    if (!raw) return undefined;
    const t = raw.replace(/\s/g, '').toLowerCase();

    if (t === '*' || t === 'n') return 'N';
    if (/^\d+$/.test(t)) return t; // '1', '0', '2', etc.
    if (/^\d+\.\.\d+$/i.test(t)) return t; // '0..1'
    if (/^\d+\.\.[*n]$/i.test(t)) return t.replace(/[*n]$/i, 'N'); // '1..*' → '1..N'
    if (/^[*n]\.\.\d+$/i.test(t)) return 'N..' + t.split('..')[1]; // por si acaso
    return undefined;
  }

  /**
   * Extrae relaciones probables del texto OCR usando patrones ASCII.
   * Soporta: generalization, realization, aggregation, composition, dependency, association.
   * Además detecta patrón A -- X -- B como asociación con `via: 'X'`.
   */
  private extractRelationsFromOcr(
    ocrText: string,
    entityNames: string[],
  ): Array<{
    from: string;
    to: string;
    kind: Relation['kind'];
    fromCard?: string;
    toCard?: string;
    via?: string;
  }> {
    const txt = this.normalizeOcr(ocrText);
    const names = new Set(entityNames);
    const relations: Array<{
      from: string;
      to: string;
      kind: Relation['kind'];
      fromCard?: string;
      toCard?: string;
      via?: string;
    }> = [];

    const NAME = '([A-Za-z_][A-Za-z0-9_]*)';
    // Cardinalidad opcional a cada lado, permitiendo [1], [0..1], [*] o suelto '1..*'
    const CARD_OPT =
      '(?:\\s*(?:\\[\\s*([0-9\\*nN.\\s]+)\\s*\\]|([0-9\\*nN.\\s]{1,6})))?';

    const patterns: Array<{ re: RegExp; kind: Relation['kind'] }> = [
      // generalization / realization
      {
        re: new RegExp(
          `${NAME}${CARD_OPT}\\s*(?:\\.{2}|-){2}\\|>\\s*${NAME}${CARD_OPT}`,
          'g',
        ),
        kind: 'generalization',
      },
      {
        re: new RegExp(
          `${NAME}${CARD_OPT}\\s*\\.{2}\\|>\\s*${NAME}${CARD_OPT}`,
          'g',
        ),
        kind: 'realization',
      },

      // aggregation / composition
      {
        re: new RegExp(`${NAME}${CARD_OPT}\\s*o--\\s*${NAME}${CARD_OPT}`, 'g'),
        kind: 'aggregation',
      },
      {
        re: new RegExp(
          `${NAME}${CARD_OPT}\\s*\\*--\\s*${NAME}${CARD_OPT}`,
          'g',
        ),
        kind: 'composition',
      },

      // dependency (punteada con >)
      {
        re: new RegExp(
          `${NAME}${CARD_OPT}\\s*\\.{2}>\\s*${NAME}${CARD_OPT}`,
          'g',
        ),
        kind: 'dependency',
      },

      // association (línea simple)
      {
        re: new RegExp(`${NAME}${CARD_OPT}\\s*--\\s*${NAME}${CARD_OPT}`, 'g'),
        kind: 'association',
      },
    ];

    const pushUnique = (r: {
      from: string;
      to: string;
      kind: Relation['kind'];
      fromCard?: string;
      toCard?: string;
      via?: string;
    }) => {
      const exists = relations.some(
        (x) =>
          x.from === r.from &&
          x.to === r.to &&
          x.kind === r.kind &&
          (x.fromCard ?? '') === (r.fromCard ?? '') &&
          (x.toCard ?? '') === (r.toCard ?? '') &&
          (x.via ?? '') === (r.via ?? ''),
      );
      if (!exists) relations.push(r);
    };

    // Patrones binarios A ? B
    for (const { re, kind } of patterns) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(txt)) !== null) {
        // m:
        // [1]=A, [2]=A_card_bracket?, [3]=A_card_loose?
        // [4]=B, [5]=B_card_bracket?, [6]=B_card_loose?
        const from = m[1];
        const to = m[4];

        if (!names.has(from) || !names.has(to)) continue;

        const fromCard = this.parseCardinality(m[2] || m[3]);
        const toCard = this.parseCardinality(m[5] || m[6]);

        pushUnique({ from, to, kind, fromCard, toCard });
      }
    }

    // Asociación con *tabla intermedia* “A -- X -- B” → via: 'X'
    const tri = new RegExp(`${NAME}\\s*--\\s*${NAME}\\s*--\\s*${NAME}`, 'g');
    let t: RegExpExecArray | null;
    while ((t = tri.exec(txt)) !== null) {
      const a = t[1],
        mid = t[2],
        b = t[3];
      if (!names.has(a) || !names.has(mid) || !names.has(b)) continue;
      pushUnique({ from: a, to: b, kind: 'association', via: mid });
    }

    return relations;
  }

  // ---------- OCR + Parse principal ----------

  async parseImage(
    buffer: Buffer,
  ): Promise<{ dsl: DSL; ocrText: string; stats: any }> {
    const pre = await sharp(buffer)
      .grayscale()
      .normalize() // mejora contraste
      .sharpen()
      .toFormat('png')
      .toBuffer();

    const { data } = await Tesseract.recognize(pre, 'eng+spa', {
      logger: (m: any) => {
        const p =
          typeof m?.progress === 'number' ? Math.round(m.progress * 100) : 0;
        this.logger.debug(`${m?.status ?? 'ocr'}: ${p}%`);
      },
    } as Partial<Tesseract.WorkerOptions>);

    const ocrText = (data?.text || '').replace(/\r/g, '').trim();
    const dsl = this.textToDsl(ocrText);

    return {
      dsl,
      ocrText,
      stats: {
        symbols: ocrText.length,
        lines: ocrText.split('\n').length,
        entities: dsl.entities.length,
        relations: dsl.relations.length,
      },
    };
  }

  private textToDsl(text: string): DSL {
    // Divide por bloques “visuales” del OCR: dobles saltos o separadores comunes
    const blocks = text
      .split(/\n{2,}|(?:\-{3,}|\={3,})\n/)
      .map((b) => b.trim())
      .filter(Boolean);

    const entities: Entity[] = [];

    for (const b of blocks) {
      const lines = b
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      if (!lines.length) continue;

      // 1) Estereotipo en primera línea (opcional)
      const stereotype = extractStereotype(lines[0]);
      const nameLineIdx = stereotype ? 1 : 0;

      // 2) Nombre de la clase
      const rawName = (lines[nameLineIdx] || '').replace(/\s+/g, ' ').trim();

      // tolera nombres con espacios (OCR) pero evita basura muy larga
      if (!/^[A-Za-z_][\w\s]*$/.test(rawName) || rawName.length > 80) continue;
      const className = rawName.replace(/\s{2,}/g, ' ').trim();

      // 3) Flags de interface/abstract si no vinieron por << >>
      const lowerAll = [stereotype, ...lines.slice(0, nameLineIdx + 1)]
        .join(' ')
        .toLowerCase();
      const isInterface =
        /(^|[\s«<])interface([»>]|$)/i.test(stereotype || '') ||
        /\binterface\b/.test(lowerAll);
      const isAbstract =
        /(^|[\s«<])abstract([»>]|$)/i.test(stereotype || '') ||
        /\babstract\b/.test(lowerAll);

      // 4) Bloque de atributos = todo lo que sigue al nombre (hasta el fin del bloque).
      //    No intentamos separar “métodos” explícitamente porque el parser ya los ignora.
      const attrsBlock = lines.slice(nameLineIdx + 1).join('\n');

      // 5) Usamos el parser robusto
      const parsedAttrs = parseAttributesFromBlock(attrsBlock);

      // 6) Construimos/mergeamos la entidad
      const mappedAttrs: EntityAttr[] = parsedAttrs.map((a) => ({
        name: a.name,
        type: a.type,
        pk: !!a.pk,
        unique: !!a.unique,
        nullable: !!a.nullable,
      }));

      const existing = entities.find(
        (e) => e.name.toLowerCase() === className.toLowerCase(),
      );

      if (existing) {
        // Enriquecer sin sobreescribir datos ya presentes
        existing.stereotype ||= stereotype || undefined;
        existing.isInterface ||= isInterface || undefined;
        existing.isAbstract ||= isAbstract || undefined;

        for (const a of mappedAttrs) {
          if (
            !existing.attrs.some(
              (x) => x.name.toLowerCase() === a.name.toLowerCase(),
            )
          ) {
            existing.attrs.push(a);
          }
        }
      } else {
        entities.push({
          name: className,
          stereotype: stereotype || undefined,
          isInterface: isInterface || undefined,
          isAbstract: isAbstract || undefined,
          attrs: mappedAttrs,
        });
      }
    }

    // ---------- NUEVO: extraer RELACIONES por heurísticas OCR ----------
    const entityNames = entities.map((e) => e.name);
    const relations = this.extractRelationsFromOcr(text, entityNames);

    return { entities, relations, constraints: [] };
  }
}
