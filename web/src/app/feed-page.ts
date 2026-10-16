import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, catchError, debounceTime, distinctUntilChanged, finalize, of, startWith, switchMap, takeUntil } from 'rxjs';
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
          <div class="place-picker" [class.place-picker-error]="publishAttempted && form.controls.placeId.invalid">
            <label class="place-field-label" for="publish-place">Local da opinião <span>Obrigatório</span></label>
            <input class="place-search" type="search" [formControl]="placeSearch"
              placeholder="Pesquisar pelo nome do local" aria-label="Pesquisar local pelo nome" />
            <div class="place-select">
              <span class="pin-small">⌖</span>
              <select id="publish-place" formControlName="placeId">
                <option value="">Selecione um local</option>
                <option *ngFor="let place of places" [value]="place.id">{{ place.name }}{{ place.city ? ' · ' + place.city : '' }}{{ place.address ? ' · ' + place.address : '' }}</option>
              </select>
            </div>
            <p class="place-validation" role="alert" *ngIf="publishAttempted && form.controls.placeId.invalid">
              É obrigatório selecionar um local para publicar.
            </p>
            <p class="place-validation" role="alert" *ngIf="publishAttempted && form.controls.content.invalid">
              Escreva sua opinião (de 2 a 2000 caracteres) para publicar.
            </p>
            <p class="place-note" *ngIf="locationMessage">{{ locationMessage }}</p>
            <p class="place-validation" role="alert" *ngIf="placeSearchError">{{ placeSearchError }}</p>
            <p class="place-note" *ngIf="!loadingPlaces && !places.length && !placeSearchError">Nenhum local encontrado.</p>
          </div>
          <button class="primary-button" type="submit" [disabled]="publishing">
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
export class FeedPage implements OnInit, OnDestroy {
  readonly imageUrl = apiAssetUrl;
  readonly placeSearch = new FormControl('', { nonNullable: true });

  posts: Post[] = [];
  places: Place[] = [];
  loading = true;
  loadingPlaces = true;
  publishing = false;
  publishAttempted = false;
  placeSearchError = '';
  locationMessage = '';
  page = 1;
  commentsFor: string | null = null;
  comments: { id: string; content: string; authorName: string; createdAt: string }[] = [];
  commentText = '';
  hasMore = true;
  readonly form;
  copyMessage = '';
  private sharedPostId: string | null;
  private readonly destroy$ = new Subject<void>();
  private userLocation: { latitude: number; longitude: number } | null = null;

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
    this.requestLocation();
    this.placeSearch.valueChanges.pipe(
      startWith(this.placeSearch.value),
      debounceTime(250),
      distinctUntilChanged(),
      switchMap((query) => {
        this.placeSearchError = '';
        const request = query.trim()
          ? this.api.searchPlaces(query.trim())
          : this.api.places();
        return request.pipe(
          catchError(() => {
            this.placeSearchError = 'Não foi possível carregar os locais. Tente novamente.';
            return of([]);
          })
        );
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (places) => {
        this.places = this.sortPlaces(places);
        this.loadingPlaces = false;
        if (placeId && places.some((place) => place.id === placeId)) this.form.patchValue({ placeId });
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  publish(): void {
    this.publishAttempted = true;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.publishing = true;
    const { content, placeId } = this.form.getRawValue();
    this.api.createPost(content!.trim(), placeId).pipe(finalize(() => (this.publishing = false))).subscribe({
      next: () => {
        this.form.reset({ content: '', placeId: '' });
        this.placeSearch.setValue('');
        this.publishAttempted = false;
        this.page = 1;
        this.load();
      }
    });
  }

  private requestLocation(): void {
    if (!navigator.geolocation) {
      this.locationMessage = 'Localização indisponível; locais organizados por nome.';
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        this.userLocation = { latitude: coords.latitude, longitude: coords.longitude };
        this.places = this.sortPlaces(this.places);
      },
      () => {
        this.locationMessage = 'Permissão de localização não concedida; locais organizados por nome.';
      },
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 10000 }
    );
  }

  private sortPlaces(places: Place[]): Place[] {
    const userLocation = this.userLocation;
    if (!userLocation) return [...places];
    return [...places].sort((first, second) =>
      this.distanceFromUser(first, userLocation) - this.distanceFromUser(second, userLocation)
      || first.name.localeCompare(second.name)
    );
  }

  private distanceFromUser(place: Place, userLocation: { latitude: number; longitude: number }): number {
    const latitude = userLocation.latitude * Math.PI / 180;
    const placeLatitude = place.latitude * Math.PI / 180;
    const latitudeDifference = (place.latitude - userLocation.latitude) * Math.PI / 180;
    const longitudeDifference = (place.longitude - userLocation.longitude) * Math.PI / 180;
    const haversine = Math.sin(latitudeDifference / 2) ** 2
      + Math.cos(latitude) * Math.cos(placeLatitude) * Math.sin(longitudeDifference / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
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
