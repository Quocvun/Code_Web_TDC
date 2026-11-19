import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

@Injectable()
export class ObjectStorageService implements OnModuleInit, OnModuleDestroy {
  private client: S3Client | null = null;
  private readonly bucket = process.env.S3_BUCKET?.trim() || "";

  get enabled() { return Boolean(this.client && this.bucket); }

  async onModuleInit() {
    const endpoint = process.env.S3_ENDPOINT?.trim();
    if (process.env.NODE_ENV !== "production" && process.env.S3_ENABLED !== "true") return;
    if (!this.bucket) {
      if (process.env.NODE_ENV === "production") throw new Error("S3_BUCKET là bắt buộc khi NODE_ENV=production.");
      return;
    }
    this.client = new S3Client({
      region: process.env.AWS_REGION || "us-east-1",
      endpoint: endpoint || undefined,
      forcePathStyle: Boolean(endpoint),
      credentials: process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY
        ? { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY }
        : undefined,
    });
    for (let attempt = 1; attempt <= 30; attempt += 1) {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
        return;
      } catch (error) {
        const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        const missing = status === 404 || ["NotFound", "NoSuchBucket"].includes((error as { name?: string }).name || "");
        if (missing) {
          try { await this.client.send(new CreateBucketCommand({ Bucket: this.bucket })); }
          catch (createError) {
            if (!["BucketAlreadyOwnedByYou", "BucketAlreadyExists"].includes((createError as { name?: string }).name || "")) throw createError;
          }
          return;
        }
        if (attempt === 30) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  async onModuleDestroy() { this.client?.destroy(); }

  async put(key: string, body: Buffer, contentType: string) {
    if (!this.client) throw new Error("Object storage chưa sẵn sàng.");
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType, ServerSideEncryption: process.env.S3_SERVER_SIDE_ENCRYPTION === "true" ? "AES256" : undefined }));
  }

  async get(key: string) {
    if (!this.client) throw new Error("Object storage chưa sẵn sàng.");
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!result.Body) throw new Error("Object storage trả về tệp rỗng.");
    return Buffer.from(await result.Body.transformToByteArray());
  }

  async delete(key: string) {
    if (this.client) await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  health() { return this.enabled ? "s3-compatible" : "local-volume"; }
}
