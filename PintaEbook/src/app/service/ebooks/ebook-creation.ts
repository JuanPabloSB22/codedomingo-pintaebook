import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment.generated';
import { CreateEbookPayload, CreateEbookResponse, EbookProgressEvent } from '../../models/ebook.model';

@Injectable({ providedIn: 'root' })
export class EbookCreationService {
  private readonly apiUrl = `${environment.apiBaseUrl.replace(/\/$/, '')}/ebooks/`;
  private readonly apiOrigin = new URL(environment.apiBaseUrl).origin;
  private socket: WebSocket | null = null;

  constructor(private readonly http: HttpClient) {}

  createEbook(payload: CreateEbookPayload): Observable<CreateEbookResponse> {
    const token = localStorage.getItem('token');
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
    return this.http.post<CreateEbookResponse>(this.apiUrl, payload, { headers });
  }

  connectToProgress(ebookId: string, token: string): Observable<EbookProgressEvent> {
    this.disconnect();

    return new Observable<EbookProgressEvent>((subscriber) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = new URL(`/ws/ebooks/${encodeURIComponent(ebookId)}/progress/`, this.apiOrigin);
      url.protocol = protocol;
      url.searchParams.set('token', token);

      const socket = new WebSocket(url.toString());
      this.socket = socket;

      socket.onmessage = (event: MessageEvent<string>) => {
        try {
          const progress = JSON.parse(event.data) as EbookProgressEvent;
          subscriber.next(progress);
          if (progress.status === 'COMPLETED' || progress.status === 'FAILED') {
            subscriber.complete();
            socket.close();
          }
        } catch {
          subscriber.error(new Error('No se pudo interpretar el progreso de creación del ebook.'));
          socket.close();
        }
      };

      socket.onerror = () => {
        subscriber.error(new Error('Ocurrió un error en la conexión de progreso del ebook.'));
      };

      socket.onclose = (event: CloseEvent) => {
        if (this.socket === socket) this.socket = null;
        if (subscriber.closed) return;
        if (event.code === 4001 || event.code === 4003) {
          subscriber.error(new Error(`Error de autenticación WebSocket (código ${event.code}).`));
        } else if (event.code === 1011) {
          subscriber.error(new Error('El servidor cerró la conexión inesperadamente. Intenta nuevamente.'));
        } else {
          subscriber.complete();
        }
      };

      return () => {
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
        if (this.socket === socket) this.socket = null;
      };
    });
  }

  disconnect(): void {
    const socket = this.socket;
    this.socket = null;
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      socket.close();
    }
  }
}
