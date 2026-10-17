import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from './api.service';
import { apiAssetUrl } from './environment';
import { Post, PublicProfile, UserComment } from './models';

@Component({
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page-heading">
      <div><span class="eyebrow">Comunidade</span><h1>Perfil público</h1>
        <p class="muted">Publicações e comentários feitos por esta pessoa.</p></div>
      <a class="outline-button" routerLink="/feed">Voltar ao feed</a>
    </div>
    <div class="loading-card" *ngIf="loadingProfile"><span class="spinner"></span> Carregando perfil...</div>
    <section class="profile-card public-profile-card" *ngIf="profile as user">
      <div class="profile-summary">
        <div class="profile-avatar">
          <img *ngIf="imageUrl(user.profilePhotoUrl) as photo" [src]="photo" [alt]="'Foto de ' + user.userName" />
          <span *ngIf="!user.profilePhotoUrl">{{ user.userName.slice(0, 1).toUpperCase() }}</span>
        </div>
        <div><h2>{{ user.userName }}</h2>
          <p class="public-profile-bio">{{ user.bio || 'Este membro ainda não adicionou uma biografia.' }}</p>
          <span class="member-tag">Membro desde {{ user.createdAt | date:'MMM yyyy' }}</span></div>
        <div class="profile-post-count"><strong>{{ user.postCount }}</strong><small>opiniões</small></div>
      </div>
    </section>
    <p class="form-error" *ngIf="profileError">{{ profileError }}</p>

    <div class="profile-comments-heading" *ngIf="profile">
      <div><span class="eyebrow">Contribuições</span><h2>Publicações</h2>
        <p class="muted">Opiniões compartilhadas por {{ profile.userName }}.</p></div>
    </div>
    <div class="loading-card" *ngIf="loadingPosts"><span class="spinner"></span> Carregando publicações...</div>
    <section class="empty-state" *ngIf="!loadingPosts && !postsError && posts.length === 0 && profile">
      <span class="empty-icon">✳</span><h2>Nenhuma publicação ainda</h2>
      <p>As opiniões publicadas por {{ profile.userName }} aparecerão aqui.</p>
    </section>
    <p class="form-error" *ngIf="postsError">{{ postsError }}</p>
    <article class="post-card public-profile-post" *ngFor="let post of posts">
      <div class="post-top">
        <div class="avatar" [class.avatar-blue]="!profile?.profilePhotoUrl">
          <img *ngIf="imageUrl(profile?.profilePhotoUrl) as photo" [src]="photo" [alt]="'Foto de ' + profile?.userName" />
          <span *ngIf="!profile?.profilePhotoUrl">{{ profile?.userName?.slice(0, 1)?.toUpperCase() }}</span>
        </div>
        <div class="post-author">
          <strong>{{ profile?.userName }}</strong>
          <span>{{ post.createdAt | date:'d MMM yyyy, HH:mm' }}</span>
        </div>
      </div>
      <p class="post-content">{{ post.content }}</p>
      <img class="post-image" *ngIf="imageUrl(post.imageUrl) as photo" [src]="photo"
        [alt]="'Foto da publicação de ' + profile?.userName" loading="lazy" />
      <a class="post-place" *ngIf="post.place" [routerLink]="['/map']" [queryParams]="{ place: post.place.id }">
        <span class="place-symbol">⌖</span>
        <span><strong>{{ post.place.name }}</strong>
          <small>{{ post.place.category }}{{ post.place.city ? ' · ' + post.place.city : '' }}</small></span>
        <span class="place-arrow">↗</span>
      </a>
      <div class="public-post-actions">
        <span>♡ {{ post.likeCount }} curtidas</span>
        <span>▱ {{ post.commentCount }} comentários</span>
        <a [routerLink]="['/feed']" [queryParams]="{ post: post.id }">Ver publicação ↗</a>
      </div>
    </article>
    <button class="load-more" *ngIf="hasMorePosts && !loadingPosts" (click)="loadMorePosts()">
      Carregar mais publicações
    </button>

    <div class="profile-comments-heading" *ngIf="profile">
      <div><span class="eyebrow">Participação</span><h2>Comentários</h2>
        <p class="muted">Comentários desta pessoa em opiniões públicas.</p></div>
    </div>
    <div class="loading-card" *ngIf="loadingComments"><span class="spinner"></span> Carregando comentários...</div>
    <section class="empty-state" *ngIf="!loadingComments && !commentsError && comments.length === 0 && profile">
      <span class="empty-icon">▱</span><h2>Nenhum comentário ainda</h2>
      <p>Os comentários publicados por {{ profile.userName }} aparecerão aqui.</p>
    </section>
    <p class="form-error" *ngIf="commentsError">{{ commentsError }}</p>
    <article class="public-comment-card" *ngFor="let comment of comments">
      <p>{{ comment.content }}</p>
      <a [routerLink]="['/feed']" [queryParams]="{ post: comment.postId }" class="public-comment-post">
        <span *ngIf="comment.placeName">⌖ {{ comment.placeName }} · </span>{{ comment.postContent }}
      </a>
      <small>{{ comment.createdAt | date:'d MMM yyyy, HH:mm' }}</small>
    </article>
    <button class="load-more" *ngIf="hasMoreComments && !loadingComments" (click)="loadMoreComments()">
      Carregar mais comentários
    </button>
  `
})
export class PublicProfilePage implements OnInit {
  readonly imageUrl = apiAssetUrl;
  profile: PublicProfile | null = null;
  posts: Post[] = [];
  comments: UserComment[] = [];
  loadingProfile = true;
  loadingPosts = false;
  loadingComments = false;
  hasMorePosts = false;
  hasMoreComments = false;
  profileError = '';
  postsError = '';
  commentsError = '';
  private postsPage = 1;
  private page = 1;

  constructor(private readonly route: ActivatedRoute, private readonly api: ApiService) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.loadingProfile = false;
      this.profileError = 'Não foi possível localizar este perfil.';
      return;
    }

    this.api.publicProfile(id).subscribe({
      next: (profile) => {
        this.profile = profile;
        this.loadingProfile = false;
        this.loadPosts(id, false);
        this.loadComments(id, false);
      },
      error: () => {
        this.loadingProfile = false;
        this.profileError = 'Não foi possível carregar este perfil.';
      }
    });
  }

  loadMoreComments(): void {
    const id = this.profile?.id;
    if (id) {
      this.page += 1;
      this.loadComments(id, true);
    }
  }

  loadMorePosts(): void {
    const id = this.profile?.id;
    if (id) {
      this.postsPage += 1;
      this.loadPosts(id, true);
    }
  }

  private loadPosts(id: string, append: boolean): void {
    this.loadingPosts = true;
    this.postsError = '';
    this.api.userPosts(id, this.postsPage).subscribe({
      next: (posts) => {
        this.posts = append ? [...this.posts, ...posts] : posts;
        this.hasMorePosts = posts.length === 20;
        this.loadingPosts = false;
      },
      error: () => {
        this.postsError = 'Não foi possível carregar as publicações. Tente novamente.';
        this.loadingPosts = false;
      }
    });
  }

  private loadComments(id: string, append: boolean): void {
    this.loadingComments = true;
    this.commentsError = '';
    this.api.userComments(id, this.page).subscribe({
      next: (comments) => {
        this.comments = append ? [...this.comments, ...comments] : comments;
        this.hasMoreComments = comments.length === 30;
        this.loadingComments = false;
      },
      error: () => {
        this.commentsError = 'Não foi possível carregar os comentários. Tente novamente.';
        this.loadingComments = false;
      }
    });
  }
}
