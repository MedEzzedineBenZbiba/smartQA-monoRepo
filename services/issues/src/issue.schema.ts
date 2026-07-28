import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type IssueDocument = HydratedDocument<Issue>;

@Schema()
export class Issue {
  @Prop({ type: Date })
  created_at!: Date;

  @Prop({ type: Date })
  updated_at!: Date;

  @Prop({ required: true })
  issueId!: string;

  @Prop({ required: true })
  title!: string;

  @Prop()
  body!: string;

  @Prop({ type: String, default: null })
  repo!: string | null;

  @Prop({
    type: String,
    required: true,
    enum: ['open', 'closed'],
  })
  state!: string;

  @Prop()
  userId!: string;

  @Prop({ required: true })
  url!: string;

  @Prop({ type: [Number], default: null })
  embedding!: number[] | null;

  @Prop({ type: Number, default: null })
  cluster_id!: number | null;

  @Prop({ type: String, default: null })
  cluster_label!: string | null;
}

export const IssueSchema = SchemaFactory.createForClass(Issue);
IssueSchema.index({ repo: 1 });
