import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { apiAssetUrl } from './environment';
import { Place, Post } from './models';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink],
  template: `
    <div class="page-heading">
      <div><span class="eyebrow">O que está acontecendo</span><h1>Feed da comunidade</h1>
        <p class="muted">Opiniões reais de quem conhece os lugares.</p></div>
      <span class="online-pill"><span></span> Comunidade ativa</span>
    </div>

    <section class="compose-card" *ngIf="auth.user() as user">
      <div class="avatar avatar-blue">{{ user.userName.slice(0, 1).toUpperCase() }}</div>
      <form class="compose-form" [formGroup]="form" (ngSubmit)="publish()">
        <textarea formControlName="content" rows="3" placeholder="Que lugar ou experiência você quer compartilhar?"></textarea>
        <div class="compose-tools">
          <div class="place-select">
            <span class="pin-small">⌖</span>
            <select formControlName="placeId">
              <option value="">Selecione um local</option>
              <option *ngFor="let place of places" [value]="place.id">{{ place.name }}{{ place.city ? ' · ' + place.city : '' }}{{ place.address ? ' · ' + place.address : '' }}</option>
            </select>
          </div>
          <button class="primary-button" type="submit" [disabled]="form.invalid || publishing">
            {{ publishing ? 'Publicando...' : 'Publicar opinião' }} <span>↗</span>
          </button>
        </div>
      </form>
    </section>
    <section class="compose-card guest-prompt" *ngIf="!auth.user()">
      <div class="avatar avatar-soft">✳</div><div><strong>Tem algo para compartilhar?</strong>
        <p class="muted">Entre para publicar suas experiências e interagir com a comunidade.</p></div>
      <a routerLink="/login" class="primary-button">Entrar</a>
    </section>

    <div class="feed-toolbar"><div class="tab-active">Recentes <span>↘</span></div><a routerLink="/map">Explorar no mapa <span>→</span></a></div>
    <div class="loading-card" *ngIf="loading"><span class="spinner"></span> Carregando opiniões...</div>
    <section class="empty-state" *ngIf="!loading && posts.length === 0">
      <span class="empty-icon">✳</span><h2>O feed começa com você</h2>
      <p>Compartilhe sua primeira experiência com a comunidade.</p>
      <a routerLink="/register" class="primary-button" *ngIf="!auth.user()">Criar minha conta</a>
    </section>
    <article class="post-card" *ngFor="let post of posts" [id]="'post-' + post.id">
      <div class="post-top">
        <div class="avatar" [class.avatar-blue]="!post.authorPhoto">
          <img *ngIf="imageUrl(post.authorPhoto) as photo" [src]="photo" [alt]="post.authorName" />
          <span *ngIf="!post.authorPhoto">{{ post.authorName.slice(0, 1).toUpperCase() || '?' }}</span>
        </div>
        <div class="post-author"><strong>{{ post.authorName || 'Pessoa da comunidade' }}</strong><span>@{{ post.authorName }} · {{ post.createdAt | date:'d MMM, HH:mm' }}</span></div>
      </div>
      <p class="post-content">{{ post.content }}</p>
      <a class="post-place" *ngIf="post.place" [routerLink]="['/map']" [queryParams]="{ place: post.place.id }">
        <span class="place-symbol">⌖</span><span><strong>{{ post.place.name }}</strong><small>{{ post.place.category }}{{ post.place.city ? ' · ' + post.place.city : '' }}</small></span><span class="place-arrow">↗</span>
      </a>
      <div class="post-actions">
        <button type="button" [class.action-liked]="isLiked(post)" (click)="like(post)">
          <span>{{ isLiked(post) ? '♥' : '♡' }}</span> {{ isLiked(post) ? 'Curtido' : 'Curtir' }} {{ post.likeCount }}
        </button>
        <button type="button" (click)="toggleComments(post)"><span>▱</span> {{ post.commentCount }} comentários</button>
        <button class="share-action" type="button" (click)="copyPost(post)"><span>↗</span> {{ copyMessage || 'Compartilhar' }}</button>
      </div>
      <div class="comments-panel" *ngIf="commentsFor === post.id">
        <p class="muted" *ngIf="comments.length === 0">Seja a primeira pessoa a comentar.</p>
        <p class="comment-row" *ngFor="let comment of comments"><strong>{{ comment.authorName }}</strong> {{ comment.content }}</p>
        <form class="comment-form" *ngIf="auth.user()" (ngSubmit)="addComment(post)">
          <input [(ngModel)]="commentText" name="comment" placeholder="Escreva um comentário..." maxlength="1000" />
          <button class="text-button" [disabled]="!commentText.trim()">Enviar</button>
        </form>
        <p class="muted comment-login" *ngIf="!auth.user()">Entre para participar da conversa. <a routerLink="/login">Fazer login</a></p>
      </div>
    </article>
    <button class="load-more" *ngIf="hasMore && posts.length >= 20 && !loading" (click)="loadMore()">Carregar mais opiniões</button>
  `
})
export class FeedPage implements OnInit {
  readonly imageUrl = apiAssetUrl;

  posts: Post[] = [];
  places: Place[] = [];
  loading = true;
  publishing = false;
  page = 1;
  commentsFor: string | null = null;
  comments: { id: string; content: string; authorName: string; createdAt: string }[] = [];
  commentText = '';
  hasMore = true;
  readonly form;
  copyMessage = '';
  private sharedPostId: string | null;

  constructor(
    readonly auth: AuthService,
    private readonly api: ApiService,
    private readonly formBuilder: FormBuilder,
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {
    this.form = this.formBuilder.group({
      content: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(2000)]],
      placeId: ['', Validators.required]
    });
    this.sharedPostId = this.route.snapshot.queryParamMap.get('post');
  }

  ngOnInit(): void {
    this.load();
    const placeId = this.route.snapshot.queryParamMap.get('placeId');
    this.api.places().subscribe({
      next: (places) => {
        this.places = places;
        if (placeId && places.some((place) => place.id === placeId)) this.form.patchValue({ placeId });
      }
    });
  }

  publish(): void {
    if (this.form.invalid) return;
    this.publishing = true;
    const { content, placeId } = this.form.getRawValue();
    this.api.createPost(content!.trim(), placeId).pipe(finalize(() => (this.publishing = false))).subscribe({
      next: () => {
        this.form.reset({ content: '', placeId: '' });
        this.page = 1;
        this.load();
      }
    });
  }

  like(post: Post): void {
    if (!this.auth.user()) {
      void this.router.navigate(['/login']);
      return;
    }
    if (this.isLiked(post)) {
      this.api.unlike(post.id).subscribe({
        next: () => {
          post.likeCount = Math.max(0, post.likeCount - 1);
          post.likedByMe = false;
        }
      });
      return;
    }
    this.api.like(post.id).subscribe({
      next: () => {
        post.likeCount += 1;
        post.likedByMe = true;
      }
    });
  }

  isLiked(post: Post): boolean {
    return post.likedByMe === true;
  }

  toggleComments(post: Post): void {
    if (this.commentsFor === post.id) {
      this.commentsFor = null;
      return;
    }
    this.commentsFor = post.id;
    this.api.comments(post.id).subscribe({ next: (comments) => (this.comments = comments) });
  }

  addComment(post: Post): void {
    const content = this.commentText.trim();
    if (!content) return;
    this.api.addComment(post.id, content).subscribe({
      next: () => {
        this.commentText = '';
        this.api.comments(post.id).subscribe({ next: (comments) => (this.comments = comments) });
      }
    });
  }

  async copyPost(post: Post): Promise<void> {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard access is unavailable');
      await navigator.clipboard.writeText(`${location.origin}/feed?post=${post.id}`);
      this.copyMessage = 'Link copiado';
    } catch {
      this.copyMessage = 'Não foi possível copiar o link';
    }
  }

  loadMore(): void {
    this.page += 1;
    this.load(true);
  }

  private load(append = false): void {
    this.loading = true;
    this.api.feed(this.page).pipe(finalize(() => (this.loading = false))).subscribe({
      next: (posts) => {
        this.posts = append ? [...this.posts, ...posts] : posts;
        this.hasMore = posts.length === 20;
        if (this.sharedPostId) {
          const sharedPost = this.posts.find((post) => post.id === this.sharedPostId);
          if (sharedPost) {
            this.scrollToPost(sharedPost.id);
            this.sharedPostId = null;
          } else if (!append) {
            const id = this.sharedPostId;
            this.sharedPostId = null;
            this.api.post(id).subscribe({
              next: (post) => {
                this.posts = [post, ...this.posts];
                this.scrollToPost(post.id);
              }
            });
          }
        }
      }
    });
  }

  private scrollToPost(id: string): void {
    setTimeout(() => document.getElementById(`post-${id}`)?.scrollIntoView({ behavior: 'smooth' }), 0);
  }
}
