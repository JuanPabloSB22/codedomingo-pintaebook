import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment.generated';
import {
  AiGeneratePayload,
  AiGenerateResponse,
  CreateEbookPayload,
  CreateEbookResponse,
  EbookContent,
  EbookListResponse,
  PatchSectionPayload
} from '../../models/ebook.model';

export type CreateEbookRequest = CreateEbookPayload;

@Injectable({ providedIn: 'root' })
export class EbooksService {
  private readonly apiBaseUrl = environment.apiBaseUrl.replace(/\/$/, '');
  private readonly apiUrl = `${this.apiBaseUrl}/ebooks/`;

  constructor(private readonly http: HttpClient) {}

  createEbook(payload: CreateEbookRequest): Observable<CreateEbookResponse> {
    return this.http.post<CreateEbookResponse>(this.apiUrl, payload, { headers: this.authHeaders() });
  }

  listEbooks(): Observable<EbookListResponse> {
    return this.http.get<EbookListResponse>(this.apiUrl, { headers: this.authHeaders() });
  }

  deleteEbook(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}${encodeURIComponent(id)}/`, { headers: this.authHeaders() });
  }

  getEbookContent(id: string): Observable<EbookContent> {
    return this.http.get<EbookContent>(`${this.apiUrl}${encodeURIComponent(id)}/content/`, {
      headers: this.authHeaders()
    });
  }

  patchEbookContent(id: string, payload: PatchSectionPayload): Observable<unknown> {
    return this.http.patch(`${this.apiUrl}${encodeURIComponent(id)}/content/`, payload, {
      headers: this.authHeaders()
    });
  }

  generateWithAi(payload: AiGeneratePayload): Observable<AiGenerateResponse> {
    return this.http.post<AiGenerateResponse>(`${this.apiBaseUrl}/ai/generate/`, payload, {
      headers: this.authHeaders()
    });
  }

  private authHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }
}
