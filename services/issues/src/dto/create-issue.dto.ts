// create-issue.dto.ts
import { IsNumber, IsString, IsArray, IsOptional } from 'class-validator';

export class CreateIssueDto {
  @IsNumber()
  issueId!: number;
  @IsString() title: string;
  @IsString() state: string; // "open" | "closed"
  @IsString() body: string;
  @IsString() @IsOptional() repo: string;
  @IsArray() @IsOptional() labels: string[]; // ["bug", "enhancement", …]
  @IsString() @IsOptional() priority: string; // "critical"|"high"|"medium"|"low"
  @IsString() @IsOptional() assignee: string;
  @IsString() @IsOptional() createdAt: string; // ISO date string
  @IsString() @IsOptional() lastOccurrence: string;
  @IsNumber() @IsOptional() frequency: number;
}
