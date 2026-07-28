// issues.module.ts or a new file: vector-index.initializer.ts

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Issue } from './issue.schema';

@Injectable()
export class VectorIndexInitializer implements OnModuleInit {
  private readonly logger = new Logger(VectorIndexInitializer.name);

  constructor(
    @InjectModel(Issue.name)
    private readonly issueModel: Model<Issue>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureVectorIndex();
  }

  private async ensureVectorIndex(): Promise<void> {
    try {
      const collection = this.issueModel.collection;

      // Check if index already exists
      const existing = (await collection
        .listSearchIndexes()
        .toArray()) as any[];

      const alreadyExists = existing.some(
        (idx: any) => idx.name === 'vector_index',
      );

      if (alreadyExists) {
        this.logger.log(
          'Vector index "vector_index" already exists — skipping creation',
        );
        return;
      }

      this.logger.log('Creating vector index "vector_index"...');

      await collection.createSearchIndex({
        name: 'vector_index',
        type: 'vectorSearch',
        definition: {
          fields: [
            {
              type: 'vector',
              path: 'embedding',
              numDimensions: 384,
              similarity: 'cosine',
            },
          ],
        },
      } as any);

      this.logger.log(
        'Vector index creation triggered — waiting for READY status...',
      );

      // Poll until READY (max 2 minutes)
      await this.waitForIndexReady('vector_index', 120000);
    } catch (error: any) {
      this.logger.error(`Failed to create vector index: ${error.message}`);
    }
  }

  private async waitForIndexReady(
    indexName: string,
    timeoutMs: number,
  ): Promise<void> {
    const start = Date.now();
    const POLL_INTERVAL = 3000;

    while (Date.now() - start < timeoutMs) {
      await new Promise((res) => setTimeout(res, POLL_INTERVAL));

      const indexes = (await this.issueModel.collection
        .listSearchIndexes()
        .toArray()) as any[];

      const idx = indexes.find((i: any) => i.name === indexName);

      if (!idx) {
        this.logger.warn(
          `Index "${indexName}" not found yet — still polling...`,
        );
        continue;
      }

      this.logger.log(`Index "${indexName}" status: ${idx.status}`);

      if (idx.status === 'READY') {
        this.logger.log(`Vector index "${indexName}" is READY`);
        return;
      }

      if (idx.status === 'FAILED') {
        throw new Error(`Vector index "${indexName}" failed to build`);
      }
    }

    this.logger.warn(
      `Vector index "${indexName}" did not reach READY within ${timeoutMs / 1000}s — search may not work yet`,
    );
  }
}
