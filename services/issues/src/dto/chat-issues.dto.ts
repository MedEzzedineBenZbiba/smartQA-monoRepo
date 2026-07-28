import { IsArray, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class ChatMessageDto {
  @IsString()
  role!: 'user' | 'assistant';

  @IsString()
  content!: string;
}

export class ChatIssuesDto {
  @IsString()
  query!: string;

  @IsOptional()
  @IsArray()
  @Type(() => ChatMessageDto)
  history?: ChatMessageDto[];
}

export interface ChatCitation {
  id: string;
  issueId: string;
  title: string;
  url: string;
}

export interface ChatIssuesResult {
  answer: string;
  citations: ChatCitation[];
}
