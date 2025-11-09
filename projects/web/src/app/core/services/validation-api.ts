import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class ValidationApi {
  constructor(private http: HttpClient) {}

  run(projectId: string, modelVersionId: string, timeoutMs?: number) {
    return this.http.post(`/api/projects/${projectId}/validation/runs`, { modelVersionId, timeoutMs });
  }

  list(projectId: string) {
    return this.http.get(`/api/projects/${projectId}/validation/runs`);
  }

  cancel(projectId: string, runId: string) {
    return this.http.post(`/api/projects/${projectId}/validation/runs/${runId}/cancel`, {});
  }
}
