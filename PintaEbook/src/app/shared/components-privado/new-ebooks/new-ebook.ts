import { AfterViewInit, ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, Output, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { Ebook, EbookContent, Section } from '../../../models/ebook.model';
import { AuthService } from '../../../service/login/login';
import { BookLoader } from '../book-loader/book-loader';
import { EbooksService } from '../../../service/ebooks/ebooks';
import { EbookCreationService } from '../../../service/ebooks/ebook-creation';
import EditorJS from '@editorjs/editorjs';
import Header from '@editorjs/header';
import List from '@editorjs/list';
import Quote from '@editorjs/quote';

@Component({
  selector: 'app-new-ebook',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, BookLoader],
  templateUrl: './new-ebook.html',
  styleUrl: './new-ebook.css'
})
export class NewEbook implements AfterViewInit, OnDestroy {
  @Input() existingEbook: Ebook | null = null;
  @Output() ebookCreated = new EventEmitter<void>();
  @Output() creditsUpdated = new EventEmitter<number>();
  private readonly formBuilder = inject(FormBuilder);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly ebooksService = inject(EbooksService);
  private readonly creationService = inject(EbookCreationService);
  private readonly authService = inject(AuthService);
  private readonly subscriptions = new Subscription();
  private editor?: EditorJS;
  private ebookContent: EbookContent | null = null;
  private selectedSection: Section | null = null;
  private activeEditorSection: Section | null = null;
  selectedChapterId: string | null = null;
  selectedSectionId: string | null = null;
  private activeEbookId: string | null = null;
  private editorInitialHtml = '';
  aiPrompt = '';
  aiError = '';
  isAiLoading = false;
  readonly setupForm = this.formBuilder.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(120)]],
    description: ['', [Validators.required, Validators.maxLength(500)]],
    promptIdea: ['', [Validators.required, Validators.maxLength(1000)]],
    quantityChapters: [3, [Validators.required, Validators.min(1), Validators.max(10)]],
    genre: ['Ficción literaria', Validators.required],
    contentType: ['Novela', Validators.required]
  });
  showEditor = false;
  isLoading = false;
  loadingMessage = 'Estamos preparando tu espacio de escritura...';
  saveMessage = '';
  formError = '';
  wordCount = 0;

  get chapters() {
    return this.ebookContent?.chapters ?? [];
  }

  get sections(): Section[] {
    return this.chapters.find((chapter) => chapter.id === this.selectedChapterId)?.sections ?? [];
  }

  ngAfterViewInit(): void {
    if (this.existingEbook) {
      this.activeEbookId = this.existingEbook.ebook_id;
      this.setupForm.patchValue({
        title: this.existingEbook.title,
        description: this.existingEbook.description
      });
      this.isLoading = true;
      this.loadingMessage = 'Estamos cargando tu ebook...';
      this.loadEbookContent(this.existingEbook.ebook_id);
    }
  }

  startEbook(): void {
    if (this.setupForm.invalid) {
      this.setupForm.markAllAsTouched();
      return;
    }

    this.formError = '';
    this.isLoading = true;
    this.loadingMessage = 'Estamos creando tu E-book...';

    const { title, description, promptIdea, quantityChapters, genre, contentType } = this.setupForm.getRawValue();
    this.subscriptions.add(this.creationService.createEbook({
      title,
      description,
      prompt_idea: `${promptIdea}\nGénero: ${genre}. Tipo de contenido: ${contentType}.`,
      quantity_chapters: quantityChapters
    }).subscribe({
      next: (response) => {
        this.activeEbookId = response.ebook_id;
        this.ebookCreated.emit();
        if (response.credits_available !== undefined) this.creditsUpdated.emit(response.credits_available);
        if (response.status === 'COMPLETED') {
          this.loadEbookContent(response.ebook_id);
          return;
        }
        const token = this.authService.getToken();
        if (!token) {
          this.isLoading = false;
          this.formError = 'No se encontró la sesión para recibir el progreso de generación.';
          return;
        }
        this.loadingMessage = 'La solicitud fue aceptada. Preparando la generación...';
        this.subscriptions.add(this.creationService.connectToProgress(response.ebook_id, token).subscribe({
          next: (progress) => {
            this.loadingMessage = `${progress.message} (${progress.progress}%)`;
            if (progress.credits_available !== undefined) this.creditsUpdated.emit(progress.credits_available);
            if (progress.status === 'FAILED') {
              this.isLoading = false;
              this.formError = progress.error ?? progress.message ?? 'No se pudo generar el ebook.';
              this.creationService.disconnect();
            } else if (progress.status === 'COMPLETED') {
              this.loadingMessage = 'Generación completa. Cargando el editor...';
              this.loadEbookContent(response.ebook_id);
              this.creationService.disconnect();
            }
          },
          error: (error: Error) => {
            this.isLoading = false;
            this.formError = error.message || 'Se perdió la conexión con el progreso de generación.';
          }
        }));
      },
      error: (error: { error?: { detail?: string }; message?: string }) => {
        this.isLoading = false;
        this.formError = error.error?.detail ?? error.message ?? 'No se pudo crear el E-book. Intentá nuevamente.';
      }
    }));
  }

  private loadEbookContent(ebookId: string): void {
    this.subscriptions.add(this.ebooksService.getEbookContent(ebookId).subscribe({
      next: (content) => {
        this.ebookContent = content;
        const firstChapter = content.chapters[0] ?? null;
        const firstSection = firstChapter?.sections[0] ?? null;
        this.selectedChapterId = firstChapter?.id ?? null;
        this.selectedSectionId = firstSection?.id ?? null;
        this.selectedSection = firstSection;
        this.activeEditorSection = firstSection;
        this.editorInitialHtml = firstSection?.html ?? '';
        this.showEditor = true;
        this.isLoading = false;
        this.formError = '';
        this.changeDetector.detectChanges();
        window.setTimeout(() => this.initializeEditor(), 0);
      },
      error: (error: { error?: { detail?: string }; message?: string }) => {
        this.isLoading = false;
        this.formError = error.error?.detail ?? error.message ?? 'No se pudo cargar el contenido del ebook.';
        if (this.existingEbook) {
          this.showEditor = true;
          this.changeDetector.detectChanges();
          window.setTimeout(() => this.initializeEditor(), 0);
        }
      }
    }));
  }

  onChapterChange(chapterId: string): void {
    this.selectedChapterId = chapterId;
    const section = this.chapters.find((chapter) => chapter.id === chapterId)?.sections[0] ?? null;
    this.selectedSectionId = section?.id ?? null;
    this.selectedSection = section;
    this.reloadEditorForSelectedSection();
  }

  onSectionChange(sectionId: string): void {
    this.selectedSectionId = sectionId;
    this.selectedSection = this.sections.find((section) => section.id === sectionId) ?? null;
    this.reloadEditorForSelectedSection();
  }

  private reloadEditorForSelectedSection(): void {
    const previousEditor = this.editor;
    if (previousEditor) {
      void previousEditor.isReady.then(async () => {
        const output = await previousEditor.save();
        const html = output.blocks.map((block) => {
          const data = block.data as { text?: string; items?: string[]; level?: number };
          const text = data.text ?? (data.items ?? []).join('<br>');
          if (block.type === 'header') {
            const level = Math.min(3, Math.max(1, data.level ?? 2));
            return `<h${level}>${text}</h${level}>`;
          }
          if (block.type === 'quote') return `<blockquote>${text}</blockquote>`;
          return `<p>${text}</p>`;
        }).join('\n');
        if (this.activeEditorSection) this.activeEditorSection.html = html;
        await previousEditor.destroy();
        if (this.editor === previousEditor) this.editor = undefined;
        this.editorInitialHtml = this.selectedSection?.html ?? '';
        this.activeEditorSection = this.selectedSection;
        this.changeDetector.detectChanges();
        window.setTimeout(() => this.initializeEditor(), 0);
      });
      return;
    }
    this.editorInitialHtml = this.selectedSection?.html ?? '';
    this.changeDetector.detectChanges();
    window.setTimeout(() => this.initializeEditor(), 0);
  }

  private initializeEditor(): void {
    if (this.editor) return;
    if (!document.getElementById('ebook-editor')) {
      window.setTimeout(() => this.initializeEditor(), 0);
      return;
    }

    const { title, description } = this.setupForm.getRawValue();
    const initialBlocks = this.editorInitialHtml
      ? [{ type: 'paragraph', data: { text: this.editorInitialHtml } }]
      : [
          { type: 'header', data: { text: title, level: 1 } },
          { type: 'paragraph', data: { text: description } },
          { type: 'paragraph', data: { text: 'Comenzá a desarrollar tu idea en este espacio.' } }
        ];

    this.editor = new EditorJS({
      holder: 'ebook-editor',
      placeholder: 'Comienza a escribir tu historia aquí...',
      autofocus: false,
      tools: {
        header: {
          class: Header,
          config: {
            levels: [1, 2, 3],
            defaultLevel: 2
          }
        },
        list: {
          class: List,
          inlineToolbar: true
        },
        quote: {
          class: Quote,
          inlineToolbar: true
        }
      },
      data: { blocks: initialBlocks },
      onChange: () => {
        void this.updateWordCount();
      }
    });
    this.activeEditorSection = this.selectedSection;

    void this.editor.isReady.then(() => this.updateWordCount());
  }

  async saveDraft(): Promise<void> {
    if (!this.editor) return;

    await this.editor.isReady;
    const output = await this.editor.save();
    if (!this.activeEbookId || !this.selectedSection || !this.selectedChapterId) {
      this.saveMessage = 'El editor está listo; todavía no hay una sección guardada para sincronizar.';
      window.setTimeout(() => this.saveMessage = '', 3500);
      return;
    }
    const html = output.blocks.map((block) => {
      const data = block.data as { text?: string; items?: string[]; level?: number };
      const text = data.text ?? (data.items ?? []).join('<br>');
      if (block.type === 'header') {
        const level = Math.min(3, Math.max(1, data.level ?? 2));
        return `<h${level}>${text}</h${level}>`;
      }
      if (block.type === 'quote') return `<blockquote>${text}</blockquote>`;
      return `<p>${text}</p>`;
    }).join('\n');
    const chapter = this.ebookContent?.chapters.find((item) => item.id === this.selectedChapterId);
    if (!chapter) return;
    this.saveMessage = 'Guardando...';
    this.subscriptions.add(this.ebooksService.patchEbookContent(this.activeEbookId, {
      sections: [{ chapter_id: chapter.id, section_id: this.selectedSection.id, html }]
    }).subscribe({
      next: () => {
        if (this.selectedSection) this.selectedSection.html = html;
        this.saveMessage = 'Borrador guardado';
        window.setTimeout(() => this.saveMessage = '', 2500);
      },
      error: (error: { error?: { detail?: string } }) => {
        this.saveMessage = error.error?.detail ?? 'No se pudo guardar el borrador.';
        window.setTimeout(() => this.saveMessage = '', 3500);
      }
    }));
  }

  generateWithAi(): void {
    const chapter = this.ebookContent?.chapters.find((item) => item.id === this.selectedChapterId);
    if (!this.activeEbookId || !chapter || !this.selectedSection || !this.aiPrompt.trim()) {
      this.aiError = 'Escribe una instrucción y abre una sección generada para usar el asistente.';
      return;
    }
    this.isAiLoading = true;
    this.aiError = '';
    this.subscriptions.add(this.ebooksService.generateWithAi({
      ebook_id: this.activeEbookId,
      chapter_id: chapter.id,
      section_id: this.selectedSection.id,
      prompt: this.aiPrompt.trim()
    }).subscribe({
      next: (response) => {
        this.isAiLoading = false;
        const generatedHtml = response.generated_html ?? response.html ?? '';
        if (generatedHtml && this.editor) {
          void this.editor.isReady.then(() => this.editor?.blocks.insert('paragraph', { text: generatedHtml }));
        }
        const credits = response.credits_available ?? response.credits_remaining;
        if (credits !== undefined) this.creditsUpdated.emit(credits);
        this.aiPrompt = '';
      },
      error: (error: { error?: { detail?: string }; message?: string }) => {
        this.isAiLoading = false;
        this.aiError = error.error?.detail ?? error.message ?? 'No se pudo generar texto con IA.';
      }
    }));
  }

  private async updateWordCount(): Promise<void> {
    if (!this.editor) return;

    await this.editor.isReady;
    const output = await this.editor.save();
    this.wordCount = output.blocks.reduce((total: number, block: { data: { text?: unknown } }) => {
      const text = String((block.data as { text?: string }).text ?? '')
        .replace(/<[^>]*>/g, ' ')
        .trim();
      return total + (text ? text.split(/\s+/).length : 0);
    }, 0);
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.creationService.disconnect();
    if (this.editor) {
      void this.editor.isReady
        .then(() => this.editor?.destroy())
        .catch(() => undefined);
    }
  }
}
