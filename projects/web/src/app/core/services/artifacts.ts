import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpResponse } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class ArtifactsService {
  private http = inject(HttpClient);

  generate(projectId: string, body: any) {
    console.log(body)
    return this.http.post(`/api/projects/${projectId}/artifacts/generate`, body);
  }

  list(projectId: string) {
    return this.http.get<any[]>(`/api/projects/${projectId}/artifacts`);
  }

  download(projectId: string, artifactId: string) {
    this.http.get(`/api/projects/${projectId}/artifacts/${artifactId}/download`, {
      responseType: 'blob',
      observe: 'response'
    }).subscribe((resp: HttpResponse<Blob>) => {
      const blob = resp.body!;
      // intenta sacar el filename del header Content-Disposition
      const cd = resp.headers.get('content-disposition') || '';
      const match = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(cd);
      const filename = match ? decodeURIComponent(match[1].replace(/['"]/g, '')) : 'artifact.bin';

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  }
}
