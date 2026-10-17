import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { Suggestion, SuggestionComment } from './models';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink],
  template: `
    <div class="page-heading">
      <div><span class="eyebrow">Construindo juntos</span><h1>Sugestões da comunidade</h1>
        <p class="muted">Compartilhe ideias, converse e acompanhe a avaliação do suporte.</p></div>
      <span class="online-pill"><span></span> Espaço aberto</span>
    </div>

    <section class="suggestion-compose-card" *ngIf="auth.user()">
      <div class="profile-form-heading"><h2>Tem uma ideia para melhorar a Cynthia?</h2>
        <p>Publique sua sugestão para a comunidade conversar e o suporte avaliar.</p></div>
      <form [formGroup]="form" (ngSubmit)="submit()">
        <label>Título
          <input formControlName="title" maxlength="120" placeholder="Resuma sua ideia" />
        </label>
        <label>Como poderia funcionar?
          <textarea formControlName="content" rows="4" maxlength="2000"
            placeholder="Conte mais detalhes sobre a melhoria"></textarea>
        </label>
        <p class="form-error" *ngIf="formError">{{ formError }}</p>
        <div class="suggestion-form-actions">
          <span class="muted">Até 120 caracteres no título e 2000 na descrição.</span>
          <button class="primary-button" type="submit" [disabled]="form.invalid || submitting">
            {{ submitting ? 'Enviando...' : 'Enviar sugestão' }}
          </button>
        </div>
      </form>
    </section>
    <section class="compose-card guest-prompt" *ngIf="!auth.user()">
      <div class="avatar avatar-soft">✳</div><div><strong>Participe das melhorias</strong>
        <p class="muted">Entre em sua conta para enviar sugestões e comentar.</p></div>
      <a routerLink="/login" class="primary-button">Entrar</a>
    </section>

    <div class="loading-card" *ngIf="loading"><span class="spinner"></span> Carregando sugestões...</div>
    <p class="form-error" *ngIf="loadError">{{ loadError }}</p>
    <section class="empty-state" *ngIf="!loading && !loadError && suggestions.length === 0">
      <span class="empty-icon">✳</span><h2>Comece uma conversa</h2>
      <p>As ideias da comunidade aparecerão aqui.</p>
    </section>

    <article class="suggestion-card" *ngFor="let suggestion of suggestions">
      <div class="suggestion-card-heading">
        <div><span class="eyebrow">Sugestão</span><h2>{{ suggestion.title }}</h2></div>
        <span class="suggestion-status" [class.suggestion-status-closed]="suggestion.isWorthImplementing !== null">
          {{ statusLabel(suggestion) }}
        </span>
      </div>
      <p class="suggestion-content">{{ suggestion.content }}</p>
      <div class="suggestion-meta">
        <span>Por <a [routerLink]="['/users', suggestion.authorId]">{{ suggestion.authorName }}</a></span>
        <span>{{ suggestion.createdAt | date:'d MMM yyyy, HH:mm' }}</span>
      </div>
      <section class="suggestion-review" *ngIf="suggestion.isWorthImplementing !== null">
        <strong>{{ suggestion.isWorthImplementing ? 'Cynthia Suporte: vale a pena implementar' : 'Cynthia Suporte: não será implementada' }}</strong>
        <p>{{ suggestion.supportResponse }}</p>
        <small *ngIf="suggestion.reviewedAt">{{ suggestion.reviewedAt | date:'d MMM yyyy, HH:mm' }}</small>
      </section>
      <div class="suggestion-actions">
        <button class="text-button" type="button" (click)="toggleComments(suggestion)">
          {{ activeSuggestionId === suggestion.id ? 'Ocultar discussão' : 'Ver discussão' }}
          · {{ suggestion.commentCount }}
        </button>
      </div>
      <section class="suggestion-thread" *ngIf="activeSuggestionId === suggestion.id">
        <p class="muted" *ngIf="loadingComments">Carregando conversa...</p>
        <p class="form-error" *ngIf="commentError">{{ commentError }}</p>
        <p class="muted" *ngIf="!loadingComments && !commentError && threadComments.length === 0">
          Seja a primeira pessoa a comentar nesta sugestão.
        </p>
        <article class="suggestion-comment" *ngFor="let comment of threadComments">
          <div><a [routerLink]="['/users', comment.authorId]"><strong>{{ comment.authorName }}</strong></a>
            <small>{{ comment.createdAt | date:'d MMM, HH:mm' }}</small></div>
          <p>{{ comment.content }}</p>
        </article>
        <button class="load-more" *ngIf="threadHasMore && !loadingComments"
          (click)="loadMoreComments(suggestion)">Ver respostas anteriores</button>
        <form class="comment-form" *ngIf="auth.user() && suggestion.isWorthImplementing === null"
          (ngSubmit)="addComment(suggestion)">
          <input [(ngModel)]="commentText" name="suggestion-comment" maxlength="1000"
            placeholder="Escreva uma resposta..." />
          <button class="text-button" type="submit" [disabled]="!commentText.trim() || submittingComment">Enviar</button>
        </form>
        <p class="muted comment-login" *ngIf="!auth.user() && suggestion.isWorthImplementing === null">
          Entre para participar da conversa. <a routerLink="/login">Fazer login</a>
        </p>
        <p class="muted comment-login" *ngIf="suggestion.isWorthImplementing !== null">
          Esta sugestão foi encerrada e não aceita novas respostas.
        </p>
      </section>
      <form class="suggestion-review-form" *ngIf="suggestion.canReview && suggestion.isWorthImplementing === null"
        (ngSubmit)="review(suggestion)">
        <h3>Resposta do suporte</h3>
        <div class="suggestion-decision-options">
          <label><input type="radio" [name]="'decision-' + suggestion.id" [value]="true"
            [(ngModel)]="reviewDecisions[suggestion.id]" /> Vale a pena</label>
          <label><input type="radio" [name]="'decision-' + suggestion.id" [value]="false"
            [(ngModel)]="reviewDecisions[suggestion.id]" /> Não vale a pena</label>
        </div>
        <textarea [(ngModel)]="reviewResponses[suggestion.id]" [name]="'response-' + suggestion.id"
          rows="3" maxlength="1000" placeholder="Explique a decisão para a comunidade"></textarea>
        <p class="form-error" *ngIf="reviewError">{{ reviewError }}</p>
        <button class="primary-button" type="submit"
          [disabled]="reviewing || reviewDecisions[suggestion.id] == null || !reviewResponses[suggestion.id]?.trim()">
          {{ reviewing ? 'Enviando resposta...' : 'Avaliar e encerrar sugestão' }}
        </button>
      </form>
    </article>
  `
})
export class SuggestionsPage implements OnInit {
  readonly form;
  suggestions: Suggestion[] = [];
  threadComments: SuggestionComment[] = [];
  activeSuggestionId: string | null = null;
  threadHasMore = false;
  private threadPage = 1;
  loading = true;
  loadingComments = false;
  submitting = false;
  submittingComment = false;
  reviewing = false;
  loadError = '';
  formError = '';
  commentError = '';
  reviewError = '';
  commentText = '';
  reviewResponses: Record<string, string> = {};
  reviewDecisions: Record<string, boolean | null> = {};

  constructor(
    readonly auth: AuthService,
    private readonly api: ApiService,
    private readonly formBuilder: FormBuilder
  ) {
    this.form = this.formBuilder.group({
      title: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]],
      content: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(2000)]]
    });
  }

  ngOnInit(): void {
    this.loadSuggestions();
  }

  statusLabel(suggestion: Suggestion): string {
    if (suggestion.isWorthImplementing === null) return 'Aberta';
    return suggestion.isWorthImplementing ? 'Vale a pena' : 'Não será implementada';
  }

  submit(): void {
    if (this.form.invalid || this.submitting) return;
    const value = this.form.getRawValue();
    this.submitting = true;
    this.formError = '';
    this.api.createSuggestion(value.title?.trim() ?? '', value.content?.trim() ?? '')
      .pipe(finalize(() => (this.submitting = false)))
      .subscribe({
        next: () => {
          this.form.reset();
          this.loadSuggestions();
        },
        error: (error: { error?: { title?: string; detail?: string } }) => {
          this.formError = error.error?.detail ?? error.error?.title ?? 'Não foi possível enviar a sugestão.';
        }
      });
  }

  toggleComments(suggestion: Suggestion): void {
    if (this.activeSuggestionId === suggestion.id) {
      this.activeSuggestionId = null;
      return;
    }
    this.activeSuggestionId = suggestion.id;
    this.commentText = '';
    this.threadComments = [];
    this.threadPage = 1;
    this.loadComments(suggestion.id, false);
  }

  loadMoreComments(suggestion: Suggestion): void {
    this.threadPage += 1;
    this.loadComments(suggestion.id, true);
  }

  addComment(suggestion: Suggestion): void {
    const content = this.commentText.trim();
    if (!content || this.submittingComment) return;
    this.submittingComment = true;
    this.commentError = '';
    this.api.addSuggestionComment(suggestion.id, content)
      .pipe(finalize(() => (this.submittingComment = false)))
      .subscribe({
        next: () => {
          this.commentText = '';
          suggestion.commentCount += 1;
          if (this.activeSuggestionId === suggestion.id) {
            this.threadPage = 1;
            this.loadComments(suggestion.id, false);
          }
        },
        error: (error: { error?: { title?: string; detail?: string } }) => {
          this.commentError = error.error?.detail ?? error.error?.title ?? 'Não foi possível enviar a resposta.';
        }
      });
  }

  review(suggestion: Suggestion): void {
    const decision = this.reviewDecisions[suggestion.id];
    const response = this.reviewResponses[suggestion.id]?.trim();
    if (decision == null || !response || this.reviewing) return;
    this.reviewing = true;
    this.reviewError = '';
    this.api.reviewSuggestion(suggestion.id, decision, response)
      .pipe(finalize(() => (this.reviewing = false)))
      .subscribe({
        next: () => this.loadSuggestions(),
        error: (error: { error?: { title?: string; detail?: string } }) => {
          this.reviewError = error.error?.detail ?? error.error?.title ?? 'Não foi possível registrar a avaliação.';
        }
      });
  }

  private loadSuggestions(): void {
    this.loading = true;
    this.loadError = '';
    this.api.suggestions().pipe(finalize(() => (this.loading = false))).subscribe({
      next: (suggestions) => (this.suggestions = suggestions),
      error: () => (this.loadError = 'Não foi possível carregar as sugestões. Tente novamente.')
    });
  }

  private loadComments(id: string, appendOlder: boolean): void {
    this.loadingComments = true;
    this.commentError = '';
    this.api.suggestionComments(id, this.threadPage).subscribe({
      next: (comments) => {
        if (this.activeSuggestionId !== id) return;
        const chronological = comments.reverse();
        this.threadComments = appendOlder
          ? [...chronological, ...this.threadComments]
          : chronological;
        this.threadHasMore = comments.length === 50;
        this.loadingComments = false;
      },
      error: () => {
        if (this.activeSuggestionId !== id) return;
        if (appendOlder) this.threadPage = Math.max(1, this.threadPage - 1);
        this.commentError = 'Não foi possível carregar a discussão.';
        this.loadingComments = false;
      }
    });
  }
}
