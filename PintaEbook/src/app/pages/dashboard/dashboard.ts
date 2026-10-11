import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { CreditPurchaseMode, CreditsModal } from '../../shared/components-privado/credits-modal/credits-modal';
import { NavbarPrivado } from '../../shared/components-privado/navbar-privado/navbar-privado';
import { MyEbooks } from '../../shared/components-privado/my-ebooks/my-ebooks';
import { Profile } from '../../shared/components-privado/profile/profile';
import { AuthService } from '../../service/login/login';
import { NewEbook } from '../../shared/components-privado/new-ebooks/new-ebook';
import { BookLoader } from '../../shared/components-privado/book-loader/book-loader';
import { Ebook } from '../../models/ebook.model';
import { CreditBalance } from '../../models/billing.model';
import { EbooksService } from '../../service/ebooks/ebooks';
import { BillingService } from '../../service/billing/billing';


@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CreditsModal, NavbarPrivado, MyEbooks, Profile, NewEbook, BookLoader],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnDestroy, OnInit {
  private readonly authService = inject(AuthService);
  private readonly ebooksService = inject(EbooksService);
  private readonly billingService = inject(BillingService);
  private readonly router = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly subscriptions = new Subscription();

  isCreditsModalOpen = false;
  creditsModalMode: CreditPurchaseMode = 'credits';
  activeSection = 'dashboard';
  selectedEbook: Ebook | null = null;
  dashboardEbooks: Ebook[] = [];
  creditBalance: CreditBalance | null = null;
  isOpeningEbook = false;
  private openingEbookTimer?: number;

  ngOnInit(): void {
    this.subscriptions.add(this.activatedRoute.queryParamMap.subscribe((params) => {
      const section = params.get('section');
      if (section) this.handleNavigation(section);
    }));
    this.loadOverview();
  }

  loadOverview(): void {
    this.subscriptions.add(this.ebooksService.listEbooks().subscribe({
      next: (response) => this.dashboardEbooks = response.results ?? [],
      error: () => this.dashboardEbooks = []
    }));
    this.subscriptions.add(this.billingService.getBalance().subscribe({
      next: (balance) => this.creditBalance = balance,
      error: () => this.creditBalance = null
    }));
  }

  get latestEbook(): Ebook | null {
    return [...this.dashboardEbooks].sort((first, second) =>
      new Date(second.updated_at).getTime() - new Date(first.updated_at).getTime()
    )[0] ?? null;
  }

  get latestProgress(): number {
    return this.latestEbook?.status === 'COMPLETED' ? 100 : 0;
  }

  get latestUpdatedLabel(): string {
    if (!this.latestEbook) return '';
    const date = new Date(this.latestEbook.updated_at);
    return Number.isNaN(date.getTime()) ? '' : `Última edición: ${new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(date)}`;
  }

  setActiveSection(section: string): void {
    this.activeSection = section;
  }

  handleNavigation(section: string): void {
    this.setActiveSection(section);
    if (section === 'credits' || section === 'buy-credits') {
      this.creditsModalMode = section === 'buy-credits' ? 'plans' : 'credits';
      this.isCreditsModalOpen = true;
    }

    if (section === 'metrics') this.openAdminMetrics();
    if (section === 'purchase-history') this.openPurchases();
  }

  openEbook(ebook: Ebook): void {
    this.selectedEbook = ebook;
    this.isOpeningEbook = true;
    window.clearTimeout(this.openingEbookTimer);
    this.openingEbookTimer = window.setTimeout(() => {
      this.activeSection = 'editor';
      this.isOpeningEbook = false;
      this.changeDetector.detectChanges();
    }, 450);
  }

  ngOnDestroy(): void {
    window.clearTimeout(this.openingEbookTimer);
    this.subscriptions.unsubscribe();
  }

  onEbookCreated(): void {
    this.loadOverview();
  }

  onCreditsUpdated(credits: number): void {
    this.creditBalance = {
      credits_available: credits,
      last_updated: this.creditBalance?.last_updated ?? new Date().toISOString()
    };
  }

  closeCreditsModal(): void {
    this.isCreditsModalOpen = false;
  }

  logout(): void {
    this.authService.logout();
    void this.router.navigate(['/login']);
  }

  get isAdmin(): boolean {
    return this.authService.isAdmin();
  }

  openAdminMetrics(): void {
    void this.router.navigate(['/admin/metrics']);
  }

  openPurchases(): void {
    void this.router.navigate(['/purchases']);
  }
}
