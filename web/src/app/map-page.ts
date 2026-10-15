import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import * as L from 'leaflet';
import { finalize } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { Place } from './models';

type PlaceOpinion = {
  id: string;
  content: string;
  rating?: number | null;
  createdAt: string;
  authorId: string;
  authorName: string;
};

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink],
  template: `
    <div class="page-heading map-heading">
      <div><span class="eyebrow">Descubra o que está perto</span><h1>Explore o mapa</h1>
        <p class="muted">Lugares cadastrados pela comunidade, com opiniões de quem já esteve lá.</p></div>
      <button class="outline-button location-button" (click)="locate()"><span>⌖</span> {{ locating ? 'Localizando...' : 'Usar minha localização' }}</button>
    </div>
    <div class="location-notice" *ngIf="locationMessage"><span>ⓘ</span> {{ locationMessage }}</div>
    <section class="map-layout">
      <div class="map-column">
        <div class="map-search"><span>⌕</span><input [(ngModel)]="query" (keyup.enter)="search()" placeholder="Buscar lugar, categoria, bairro ou cidade" />
          <button type="button" (click)="search()" aria-label="Pesquisar">Buscar</button></div>
        <div #mapElement class="leaflet-map" aria-label="Mapa de locais cadastrados"></div>
        <div class="map-legend"><span><i class="legend-dot place-dot"></i> Locais</span><span><i class="legend-dot user-dot"></i> Você</span>
          <button type="button" class="map-add-link" (click)="startAdding()">+ Cadastrar local</button></div>
      </div>
      <aside class="map-side">
        <div class="side-header">
          <div><span class="eyebrow">{{ selected ? 'Detalhes do lugar' : searching ? 'Pesquisa' : 'Nesta região' }}</span>
            <h2>{{ selected?.name || 'Lugares próximos' }}</h2></div>
          <span class="result-count">{{ selected ? selected.opinionCount : places.length }}</span>
        </div>
        <p class="side-subtitle" *ngIf="selected">{{ selected.category }}<span *ngIf="selected.city"> · {{ selected.city }}</span></p>
        <p class="side-subtitle" *ngIf="!selected">Selecione um marcador para ver as opiniões.</p>
        <div class="nearby-list" *ngIf="!selected">
          <button class="nearby-place" type="button" *ngFor="let place of places" (click)="selectPlace(place)">
            <span class="nearby-icon">⌖</span><span class="nearby-copy"><strong>{{ place.name }}</strong><small>{{ place.category }}{{ place.city ? ' · ' + place.city : '' }}</small></span>
            <span class="distance" *ngIf="place.distanceMeters != null">{{ formatDistance(place.distanceMeters) }}</span>
          </button>
          <div class="map-empty" *ngIf="!places.length"><span class="empty-icon">⌖</span><strong>Nenhum lugar nessa área ainda</strong>
            <p>Você pode explorar o mapa ou cadastrar o primeiro.</p><button class="text-button" (click)="startAdding()">Cadastrar um lugar</button></div>
        </div>
        <div class="selected-content" *ngIf="selected">
          <p class="place-address" *ngIf="selected.address || selected.city"><span>⌖</span> {{ selected.address }}{{ selected.address && selected.city ? ', ' : '' }}{{ selected.city }}</p>
          <div class="opinion-heading"><strong>Opiniões da comunidade</strong><span>{{ selected.opinionCount }}</span></div>
          <p class="opinion-snippet" *ngFor="let post of selectedPosts"><span>“{{ post.content }}”</span><small>{{ post.authorName }} · {{ post.createdAt | date:'d MMM' }}</small></p>
          <p class="map-empty small-empty" *ngIf="selectedPosts.length === 0">Ainda não há opiniões sobre este lugar.</p>
          <a routerLink="/feed" [queryParams]="{ placeId: selected.id }" class="outline-button full-width">Ver feed e compartilhar</a>
        </div>
      </aside>
    </section>

    <div class="modal-backdrop" *ngIf="adding" (click)="cancelAdding()">
      <section class="place-modal" (click)="$event.stopPropagation()">
        <button class="modal-close" type="button" (click)="cancelAdding()">×</button>
        <span class="eyebrow">Novo ponto no mapa</span><h2>Cadastre um lugar</h2>
        <p class="muted">Clique no mapa para escolher ou ajustar a localização antes de salvar.</p>
        <p class="selected-coordinates">⌖ {{ selectedLatitude | number:'1.4-4' }}, {{ selectedLongitude | number:'1.4-4' }}</p>
        <form [formGroup]="placeForm" (ngSubmit)="createPlace()">
          <label>Nome do local<input formControlName="name" placeholder="Ex.: Café da esquina" /></label>
          <label>Categoria<select formControlName="category"><option value="">Selecione uma categoria</option><option *ngFor="let category of categories" [value]="category">{{ category }}</option></select></label>
          <label>Endereço ou bairro<input formControlName="address" placeholder="Opcional" /></label>
          <label>Cidade<input formControlName="city" placeholder="Ex.: Rio de Janeiro" /></label>
          <label>Descrição <small>(opcional)</small><textarea formControlName="description" rows="2" placeholder="Conte um pouco sobre este lugar"></textarea></label>
          <p class="form-hint" *ngIf="!auth.user()">Entre e confirme seu e-mail para cadastrar locais.</p>
          <div class="modal-actions"><button class="outline-button" type="button" (click)="cancelAdding()">Cancelar</button>
            <button class="primary-button" type="submit" [disabled]="placeForm.invalid || saving || !auth.user()">{{ saving ? 'Salvando...' : 'Salvar local' }}</button></div>
          <a class="subtle-link" *ngIf="!auth.user()" routerLink="/login">Entrar na conta</a>
        </form>
      </section>
    </div>
  `
})
export class MapPage implements AfterViewInit, OnDestroy, OnInit {
  @ViewChild('mapElement', { static: true }) mapElement!: ElementRef<HTMLDivElement>;

  readonly categories = ['Restaurantes', 'Fast-food', 'Praias', 'Bares', 'Parques', 'Academias', 'Lojas', 'Cinemas', 'Pontos turísticos', 'Outros'];
  readonly placeForm;
  map?: L.Map;
  places: Place[] = [];
  selected: Place | null = null;
  selectedPosts: PlaceOpinion[] = [];
  query = '';
  searching = false;
  locating = false;
  loading = false;
  locationMessage = '';
  adding = false;
  saving = false;
  selectedLatitude = -22.9711;
  selectedLongitude = -43.1822;
  private markers = L.layerGroup();
  private selectedMarker?: L.Marker;
  private userMarker?: L.CircleMarker;
  private suppressMoveEnd = false;

  constructor(
    readonly auth: AuthService,
    private readonly api: ApiService,
    private readonly formBuilder: FormBuilder,
    private readonly route: ActivatedRoute
  ) {
    this.placeForm = this.formBuilder.group({
      name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(160)]],
      category: ['', [Validators.required, Validators.maxLength(80)]],
      address: ['', Validators.maxLength(300)],
      city: ['', Validators.maxLength(120)],
      description: ['', Validators.maxLength(1000)]
    });
  }

  ngOnInit(): void {}

  ngAfterViewInit(): void {
    this.map = L.map(this.mapElement.nativeElement, { zoomControl: false }).setView([-22.9711, -43.1822], 13);
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(this.map);
    this.markers.addTo(this.map);
    this.map.on('moveend', () => {
      if (this.suppressMoveEnd) {
        this.suppressMoveEnd = false;
        return;
      }
      this.searching = false;
      this.loadVisiblePlaces();
    });
    this.map.on('click', (event: L.LeafletMouseEvent) => {
      if (this.adding) this.setDraftLocation(event.latlng.lat, event.latlng.lng);
    });
    this.loadVisiblePlaces();
    const placeId = this.route.snapshot.queryParamMap.get('place');
    if (placeId) {
      this.api.place(placeId).subscribe({ next: (place) => this.selectPlace(place) });
    }
    setTimeout(() => this.map?.invalidateSize(), 0);
    setTimeout(() => this.locate(), 250);
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  locate(): void {
    if (!navigator.geolocation) {
      this.locationMessage = 'Este navegador não disponibiliza localização. Pesquise um lugar ou navegue pelo mapa.';
      return;
    }
    this.locating = true;
    this.locationMessage = '';
    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.locating = false;
        const { latitude, longitude } = position.coords;
        this.map?.setView([latitude, longitude], 15);
        this.userMarker?.remove();
        this.userMarker = L.circleMarker([latitude, longitude], {
          radius: 8, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1
        }).addTo(this.map!);
        this.loadVisiblePlaces(latitude, longitude);
      },
      () => {
        this.locating = false;
        this.locationMessage = 'Não foi possível acessar sua localização. Você ainda pode pesquisar lugares ou navegar pelo mapa.';
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  }

  search(): void {
    const search = this.query.trim();
    if (search.length < 2) return;
    this.loading = true;
    this.searching = true;
    this.api.searchPlaces(search).pipe(finalize(() => (this.loading = false))).subscribe({
      next: (places) => {
        this.places = places;
        this.showMarkers(places);
        if (places.length && this.map) {
          const bounds = L.latLngBounds(places.map((place) => [place.latitude, place.longitude]));
          this.suppressMoveEnd = true;
          this.map.fitBounds(bounds.pad(0.2), { maxZoom: 15, animate: false });
          setTimeout(() => (this.suppressMoveEnd = false), 0);
        }
      }
    });
  }

  selectPlace(place: Place): void {
    this.selected = place;
    this.selectedPosts = [];
    this.map?.flyTo([place.latitude, place.longitude], Math.max(this.map.getZoom(), 15), { duration: 0.5 });
    this.selectedMarker?.remove();
    this.selectedMarker = L.marker([place.latitude, place.longitude], { icon: this.selectedIcon() }).addTo(this.map!);
    this.api.placePosts(place.id).subscribe({ next: (posts) => (this.selectedPosts = posts) });
  }

  startAdding(): void {
    if (this.map) {
      const center = this.map.getCenter();
      this.selectedLatitude = center.lat;
      this.selectedLongitude = center.lng;
    }
    this.adding = true;
    this.setDraftMarker();
  }

  cancelAdding(): void {
    this.adding = false;
    this.selectedMarker?.remove();
    this.selectedMarker = undefined;
  }

  createPlace(): void {
    if (this.placeForm.invalid || !this.auth.user()) return;
    this.saving = true;
    const data = this.placeForm.getRawValue();
    this.api.createPlace({
      name: data.name!.trim(),
      category: data.category!,
      description: data.description?.trim() || null,
      address: data.address?.trim() || null,
      city: data.city?.trim() || null,
      latitude: this.selectedLatitude,
      longitude: this.selectedLongitude
    }).pipe(finalize(() => (this.saving = false))).subscribe({
      next: (place) => {
        this.placeForm.reset();
        this.adding = false;
        this.selectedMarker?.remove();
        this.selectedMarker = undefined;
        this.searching = false;
        this.selected = place;
        this.map?.setView([place.latitude, place.longitude], 16);
        this.loadVisiblePlaces(place.latitude, place.longitude);
      }
    });
  }

  formatDistance(meters: number): string {
    return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
  }

  private loadVisiblePlaces(latitude?: number, longitude?: number): void {
    if (!this.map) return;
    const center = latitude == null || longitude == null
      ? this.map.getCenter()
      : L.latLng(latitude, longitude);
    const corner = this.map.getBounds().getNorthEast();
    const radius = Math.min(50000, Math.max(1000, center.distanceTo(corner) * 1.5));
    this.loading = true;
    this.searching = false;
    this.api.nearby(center.lat, center.lng, radius).pipe(finalize(() => (this.loading = false))).subscribe({
      next: (places) => {
        this.places = places;
        this.showMarkers(places);
      }
    });
  }

  private showMarkers(places: Place[]): void {
    this.markers.clearLayers();
    for (const place of places) {
      const marker = L.marker([place.latitude, place.longitude], { icon: this.placeIcon() });
      marker.on('click', () => this.selectPlace(place));
      marker.addTo(this.markers);
    }
  }

  private setDraftLocation(latitude: number, longitude: number): void {
    this.selectedLatitude = latitude;
    this.selectedLongitude = longitude;
    this.setDraftMarker();
  }

  private setDraftMarker(): void {
    this.selectedMarker?.remove();
    this.selectedMarker = L.marker([this.selectedLatitude, this.selectedLongitude], { icon: this.selectedIcon() }).addTo(this.map!);
  }

  private placeIcon(): L.DivIcon {
    return L.divIcon({ className: 'place-map-pin', html: '<span>⌖</span>', iconSize: [34, 34], iconAnchor: [17, 34] });
  }

  private selectedIcon(): L.DivIcon {
    return L.divIcon({ className: 'selected-map-pin', html: '<span>⌖</span>', iconSize: [42, 42], iconAnchor: [21, 42] });
  }
}
