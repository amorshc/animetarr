import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { SeriesData } from 'src/models/SeriesData';
import { SonarrSeries } from 'src/models/SonarrSeries';
import { SelectedSeason } from '../models';

@Injectable({
  providedIn: 'root',
})
export class AnimetarrService {
  constructor(private http: HttpClient) {}

  GetVersion(): Observable<string> {
    return this.http.get<string>('/version');
  }

  GetSchedule(season: SelectedSeason): Observable<SeriesData[]> {
    return this.http.get<SeriesData[]>(
      `/schedule/${season.year}/${season.season}`
    );
  }

  GetSonarrSeriesIds(): Observable<number[]> {
    return this.http.get<number[]>(`/series/ids`);
  }

  AddByTvDbId(tvdbId: number): Observable<SonarrSeries> {
    return this.http.post<SonarrSeries>(`/series`, { tvdbId: tvdbId });
  }

  // --- Radarr / movies -------------------------------------------------------

  IsRadarrConfigured(): Observable<{ configured: boolean }> {
    return this.http.get<{ configured: boolean }>(`/movies/configured`);
  }

  GetMovieSchedule(season: SelectedSeason): Observable<any[]> {
    return this.http.get<any[]>(
      `/movies/schedule/${season.year}/${season.season}`
    );
  }

  GetRadarrMovieIds(): Observable<number[]> {
    return this.http.get<number[]>(`/movies/ids`);
  }

  AddMovieByTitle(title: string): Observable<any> {
    return this.http.post<any>(`/movies`, { title });
  }

  AddMovieByTmdbId(tmdbId: number): Observable<any> {
    return this.http.post<any>(`/movies`, { tmdbId });
  }
}
