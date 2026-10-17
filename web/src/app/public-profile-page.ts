import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from './api.service';
import { apiAssetUrl } from './environment';
import { PublicProfile, UserComment } from './models';

@Component({
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page-heading">
      <div><span class="eyebrow">Comunidade</span><h1>Perfil público</h1>
        <p class="muted">Informações e comentários publicados por esta pessoa.</p></div>
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
  comments: UserComment[] = [];
  loadingProfile = true;
  loadingComments = false;
  hasMoreComments = false;
  profileError = '';
  commentsError = '';
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
