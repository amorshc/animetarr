import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SelectedSeason } from 'src/app/models';
import { AnimetarrService } from 'src/app/services/animetarr.service';
import { SeriesData } from 'src/models/SeriesData';

@Component({
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit {
  isLoading = false;
  shows: SeriesData[] = []; // mockData;
  existingSonarrSeriesIds: number[] = [];
  mismatches: string[] = JSON.parse(localStorage.getItem('mismatches') ?? '[]');
  favorites: number[] = JSON.parse(localStorage.getItem('favorites') ?? '[]');

  // Client-side filters applied over the currently loaded season.
  searchText = '';
  selectedGenres: string[] = [];
  selectedFormats: string[] = [];
  favoritesOnly = false;

  // Sonarr add-target setup (auto-pulled from Sonarr; chosen values persist).
  showSettings = false;
  sonarrProfiles: { id: number; name: string }[] = [];
  sonarrRootFolders: { path: string }[] = [];
  selectedProfileId: number | null = localStorage.getItem('sonarrProfileId')
    ? Number(localStorage.getItem('sonarrProfileId'))
    : null;
  selectedRootFolder: string = localStorage.getItem('sonarrRootFolder') ?? '';

  constructor(
    private snackBar: MatSnackBar,
    private animetarr: AnimetarrService,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.getSonarrSeriesIds();
    this.loadSonarrConfig();
  }

  loadSonarrConfig(): void {
    this.animetarr.GetSonarrProfiles().subscribe({
      next: (profiles) => (this.sonarrProfiles = profiles),
      error: (err) => console.error('Could not load Sonarr profiles', err),
    });
    this.animetarr.GetSonarrRootFolders().subscribe({
      next: (folders) => (this.sonarrRootFolders = folders),
      error: (err) => console.error('Could not load Sonarr root folders', err),
    });
  }

  onProfileChange(): void {
    if (this.selectedProfileId != null) {
      localStorage.setItem('sonarrProfileId', String(this.selectedProfileId));
    }
  }

  onRootFolderChange(): void {
    localStorage.setItem('sonarrRootFolder', this.selectedRootFolder);
  }

  get matchedShows(): SeriesData[] {
    return this.shows.filter((s) => !this.isMismatched(s) && this.passesFilters(s));
  }

  get mismatchedShows(): SeriesData[] {
    return this.shows.filter((s) => this.isMismatched(s) && this.passesFilters(s));
  }

  // Distinct genres present in the loaded season (populates the genre filter).
  get availableGenres(): string[] {
    const genres = new Set<string>();
    this.shows.forEach((s) => (s.tags ?? []).forEach((t) => genres.add(t)));
    return Array.from(genres).sort();
  }

  // Distinct AniList formats present (TV, ONA, ...) for the type filter.
  get availableFormats(): string[] {
    const formats = new Set<string>();
    this.shows.forEach((s) => {
      const format = s.data?.format;
      if (format) {
        formats.add(format);
      }
    });
    return Array.from(formats).sort();
  }

  get hasActiveFilters(): boolean {
    return (
      this.searchText.trim().length > 0 ||
      this.selectedGenres.length > 0 ||
      this.selectedFormats.length > 0 ||
      this.favoritesOnly
    );
  }

  clearFilters(): void {
    this.searchText = '';
    this.selectedGenres = [];
    this.selectedFormats = [];
    this.favoritesOnly = false;
  }

  // A show is shown only if it passes every active filter.
  private passesFilters(show: SeriesData): boolean {
    if (this.searchText.trim()) {
      const query = this.searchText.trim().toLowerCase();
      const haystack = `${show.title} ${show.originalTitle}`.toLowerCase();
      if (!haystack.includes(query)) {
        return false;
      }
    }
    if (this.selectedGenres.length) {
      const tags = show.tags ?? [];
      if (!this.selectedGenres.some((g) => tags.includes(g))) {
        return false;
      }
    }
    if (this.selectedFormats.length) {
      const format = show.data?.format;
      if (!format || !this.selectedFormats.includes(format)) {
        return false;
      }
    }
    if (this.favoritesOnly && !this.favorites.includes(show.tvdbId)) {
      return false;
    }
    return true;
  }

  loadSchedule(season: SelectedSeason): void {
    // Set loading in UI
    this.isLoading = true;
    this.cd.detectChanges();
    const loadingSnackbarRef = this.snackBar.open('Loading data...', '');

    // Retreive season
    this.animetarr.GetSchedule(season).subscribe({
      next: (seriesData) => {
        console.debug(seriesData);
        this.shows = seriesData;

        // Complete loading
        loadingSnackbarRef.dismiss();
        this.snackBar.open('Season loaded.', 'Dismiss', { duration: 3000 });
        this.isLoading = false;
      },
      error: (err) => {
        // Without this a failed request left the spinner up and the page blank.
        console.error('Failed to load schedule', err);
        loadingSnackbarRef.dismiss();
        this.snackBar.open('Failed to load season.', 'Dismiss', { duration: 5000 });
        this.isLoading = false;
      },
    });
  }

  isMismatched(show: SeriesData): boolean {
    return this.mismatches.some((s) => s === show.originalTitle);
  }

  getSonarrSeriesIds(): void {
    this.animetarr.GetSonarrSeriesIds().subscribe((seriesIds) => {
      this.existingSonarrSeriesIds = seriesIds;
    });
  }
}
