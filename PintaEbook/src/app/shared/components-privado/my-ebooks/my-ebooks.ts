import { Component, EventEmitter, OnDestroy, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import { Ebook, EbookStatus } from '../../../models/ebook.model';
import { EbooksService } from '../../../service/ebooks/ebooks';

export type EbookSummary = Ebook;

@Component({
  selector: 'app-my-ebooks',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './my-ebooks.html',
  styleUrl: './my-ebooks.css',
})
export class MyEbooks implements OnInit, OnDestroy {
  private readonly ebooksService = inject(EbooksService);
  private readonly subscriptions = new Subscription();

  @Output() openEbook = new EventEmitter<Ebook>();
  @Output() createEbook = new EventEmitter<void>();

  ebooks: Ebook[] = [];
  isLoading = true;
  loadError = '';
  searchTerm = '';
  selectedStatus = 'Todos';
  sortBy = 'Última edición';

  ngOnInit(): void {
    this.loadEbooks();
  }

  loadEbooks(): void {
    this.isLoading = true;
    this.loadError = '';
    this.subscriptions.add(this.ebooksService.listEbooks().subscribe({
      next: (response) => {
        this.ebooks = response.results ?? [];
        this.isLoading = false;
      },
      error: (error: { error?: { detail?: string }; message?: string }) => {
        this.loadError = error.error?.detail ?? error.message ?? 'No se pudieron cargar tus ebooks.';
        this.isLoading = false;
      }
    }));
  }

  get displayEmptyState(): boolean {
    return !this.isLoading && !this.loadError && this.ebooks.length === 0;
  }

  get filteredEbooks(): Ebook[] {
    const term = this.searchTerm.trim().toLocaleLowerCase();
    const filtered = this.ebooks.filter((ebook) => {
      const matchesText = !term || `${ebook.title} ${ebook.description}`.toLocaleLowerCase().includes(term);
      const matchesStatus = this.selectedStatus === 'Todos' || this.statusLabel(ebook.status) === this.selectedStatus;
      return matchesText && matchesStatus;
    });

    return [...filtered].sort((first, second) => {
      if (this.sortBy === 'Título') return first.title.localeCompare(second.title);
      if (this.sortBy === 'Progreso') return this.progressFor(second) - this.progressFor(first);
      return new Date(second.updated_at).getTime() - new Date(first.updated_at).getTime();
    });
  }

  statusLabel(status?: EbookStatus): string {
    if (status === 'COMPLETED') return 'Finalizado';
    if (status === 'FAILED') return 'Fallido';
    return 'En progreso';
  }

  progressFor(ebook: Ebook): number {
    return ebook.status === 'COMPLETED' ? 100 : 0;
  }

  updatedLabel(updatedAt: string): string {
    const date = new Date(updatedAt);
    if (Number.isNaN(date.getTime())) return '';
    return `Editado el ${new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(date)}`;
  }

  coverClass(ebook: Ebook): string {
    const styles = ['ebook-cover--memories', 'ebook-cover--pages', 'ebook-cover--winter'];
    const index = Array.from(ebook.ebook_id).reduce((sum, character) => sum + character.charCodeAt(0), 0) % styles.length;
    return styles[index];
  }

  coverKicker(ebook: Ebook): string {
    return `${ebook.quantity_chapters} capítulos`;
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.selectedStatus = 'Todos';
    this.sortBy = 'Última edición';
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}
