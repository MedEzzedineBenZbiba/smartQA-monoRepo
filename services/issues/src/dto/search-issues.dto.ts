// src/dto/search-issues.dto.ts
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  Min,
  Max,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SearchIssuesDto {
  @IsString()
  @IsNotEmpty()
  query: string;

  @IsOptional()
  @IsIn(['open', 'closed', 'all'])
  state?: 'open' | 'closed' | 'all' = 'all';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;
}

export interface SemanticSearchResult {
  data: SearchedIssue[];
  total: number;
  query: string;
  mode: 'hybrid' | 'text-only'; // tells frontend what happened
}

export interface SearchedIssue {
  _id: string;
  issueId: string;
  title: string;
  body: string;
  state: string;
  cluster_id: number | null;
  cluster_label: string | null;
  created_at: string | null;
  updated_at: string | null;
  url: string;
  similarity_score: number | null; // null for text-only fallback results
  isPoorlyDescribed: boolean;
  isNoise: boolean;
  match_type: 'vector' | 'text'; // how this specific result was found
}
