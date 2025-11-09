import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class UmlImportApi {
  constructor(private http: HttpClient) {}

  parse(projectId: string, file: File) {
    const fd = new FormData();
    fd.append('file', file, file.name);
    return this.http.post<{ dsl: any; ocrText: string; stats: any; artifactId: string }>(`/api/projects/${projectId}/uml/parse-image`, fd);
  }

  import(projectId: string, file: File, opts: { branchId?: string; merge?: 'merge'|'replace'; message?: string } = {}) {
    const fd = new FormData();
    fd.append('file', file, file.name);
    if (opts.branchId) fd.append('branchId', opts.branchId);
    if (opts.merge) fd.append('merge', opts.merge);
    if (opts.message) fd.append('message', opts.message);
    return this.http.post<{ versionId: string; branchId: string; stats: any; insertedEntities: number }>(`/api/projects/${projectId}/uml/import-image`, fd);
  }
}
