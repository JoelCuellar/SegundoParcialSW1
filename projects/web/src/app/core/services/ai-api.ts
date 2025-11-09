import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class AiApi {
  constructor(private http: HttpClient) {}

  request(projectId: string, modelVersionId: string, scope = 'ALL', promptHints?: string) {
    return this.http.post(`/api/projects/${projectId}/ai/suggestions`, { modelVersionId, scope, promptHints });
  }

  list(projectId: string) {
    return this.http.get(`/api/projects/${projectId}/ai/suggestions`);
  }

  apply(projectId: string, sid: string, includePaths?: string[]) {
    return this.http.post(`/api/projects/${projectId}/ai/suggestions/${sid}/apply`, { includePaths });
  }

  reject(projectId: string, sid: string) {
    return this.http.post(`/api/projects/${projectId}/ai/suggestions/${sid}/reject`, {});
  }
}
