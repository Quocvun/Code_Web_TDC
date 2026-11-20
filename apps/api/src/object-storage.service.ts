import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

type CloudflareS3Config = { endpoint: string; region: string; accessKeyId: string; secretAccessKey: string };

function arrayBuffer(value: Uint8Array) {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

function hex(value: ArrayBuffer | Uint8Array) {
  return [...new Uint8Array(value instanceof ArrayBuffer ? value : arrayBuffer(value))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: ArrayBuffer | Uint8Array) {
  return hex(await crypto.subtle.digest("SHA-256", value instanceof ArrayBuffer ? value : arrayBuffer(value)));
}

async function hmac(key: ArrayBuffer | Uint8Array, value: string) {
  const cryptoKey = await crypto.subtle.importKey("raw", key instanceof ArrayBuffer ? key : arrayBuffer(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value)));
}

@Injectable()
export class ObjectStorageService implements OnModuleInit, OnModuleDestroy {
  private client: S3Client | null = null;
  private cloudflareS3: CloudflareS3Config | null = null;
  private readonly bucket = process.env.S3_BUCKET?.trim() || "";

  get enabled() { return Boolean((this.client || this.cloudflareS3) && this.bucket); }

  async onModuleInit() {
    const cloudflare = process.env.CLOUDFLARE_WORKERS === "true";
    if (cloudflare && process.env.S3_ENABLED !== "true") return;
    const endpoint = process.env.S3_ENDPOINT?.trim();
    if (!cloudflare && process.env.NODE_ENV !== "production" && process.env.S3_ENABLED !== "true") return;
    if (cloudflare && (!endpoint || !process.env.S3_ACCESS_KEY || !process.env.S3_SECRET_KEY)) throw new Error("S3_ENDPOINT, S3_ACCESS_KEY và S3_SECRET_KEY là bắt buộc trên Cloudflare khi bật S3_ENABLED.");
    if (cloudflare && new URL(endpoint!).protocol !== "https:") throw new Error("S3_ENDPOINT phải dùng HTTPS trên Cloudflare.");
    if (!this.bucket) {
      if (process.env.NODE_ENV === "production") throw new Error("S3_BUCKET là bắt buộc khi NODE_ENV=production.");
      return;
    }
    if (cloudflare) {
      this.cloudflareS3 = { endpoint: endpoint!, region: process.env.AWS_REGION || "us-east-1", accessKeyId: process.env.S3_ACCESS_KEY!, secretAccessKey: process.env.S3_SECRET_KEY! };
      for (let attempt = 1; attempt <= 30; attempt += 1) {
        const response = await this.cloudflareS3Request("HEAD");
        if (response.ok) return;
        if (response.status === 404) {
          const created = await this.cloudflareS3Request("PUT");
          if (created.ok || created.status === 409) return;
          throw new Error(`S3-compatible bucket creation failed: ${created.status}`);
        }
        if (attempt === 30) throw new Error(`S3-compatible bucket check failed: ${response.status}`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
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
    if (this.cloudflareS3) {
      const response = await this.cloudflareS3Request("PUT", key, body, contentType);
      if (!response.ok) throw new Error(`S3-compatible file upload failed: ${response.status}`);
      return;
    }
    if (!this.client) throw new Error("Object storage chưa sẵn sàng.");
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType, ServerSideEncryption: process.env.S3_SERVER_SIDE_ENCRYPTION === "true" ? "AES256" : undefined }));
  }

  async get(key: string) {
    if (this.cloudflareS3) {
      const response = await this.cloudflareS3Request("GET", key);
      if (!response.ok) throw new Error(`S3-compatible file download failed: ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    }
    if (!this.client) throw new Error("Object storage chưa sẵn sàng.");
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!result.Body) throw new Error("Object storage trả về tệp rỗng.");
    return Buffer.from(await result.Body.transformToByteArray());
  }

  async delete(key: string) {
    if (this.cloudflareS3) {
      const response = await this.cloudflareS3Request("DELETE", key);
      if (!response.ok) throw new Error(`S3-compatible file deletion failed: ${response.status}`);
      return;
    }
    if (this.client) await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  health() { return this.enabled ? "s3-compatible" : process.env.CLOUDFLARE_WORKERS === "true" ? "not-configured-cloudflare" : "local-volume"; }

  private async cloudflareS3Request(method: string, key?: string, body?: Buffer, contentType?: string) {
    const config = this.cloudflareS3;
    if (!config) throw new Error("Cloudflare S3 storage is not configured.");
    const endpoint = new URL(config.endpoint);
    const prefix = endpoint.pathname.replace(/\/+$/, "");
    const objectPath = [this.bucket, ...(key ? key.split("/") : [])].map(encodeURIComponent).join("/");
    const url = new URL(`${endpoint.origin}${prefix}/${objectPath}`);
    const date = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const shortDate = date.slice(0, 8);
    const payloadHash = await sha256(body || new ArrayBuffer(0));
    const signedHeaders: Record<string, string> = {
      host: url.host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": date,
    };
    if (contentType) signedHeaders["content-type"] = contentType;
    const headerNames = Object.keys(signedHeaders).sort();
    const canonicalHeaders = headerNames.map((name) => `${name}:${signedHeaders[name].trim()}\n`).join("");
    const signedHeaderNames = headerNames.join(";");
    const canonicalRequest = `${method}\n${url.pathname}\n\n${canonicalHeaders}\n${signedHeaderNames}\n${payloadHash}`;
    const scope = `${shortDate}/${config.region}/s3/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${date}\n${scope}\n${await sha256(new TextEncoder().encode(canonicalRequest))}`;
    const dateKey = await hmac(new TextEncoder().encode(`AWS4${config.secretAccessKey}`), shortDate);
    const regionKey = await hmac(dateKey, config.region);
    const serviceKey = await hmac(regionKey, "s3");
    const signingKey = await hmac(serviceKey, "aws4_request");
    const signature = hex(await hmac(signingKey, stringToSign));
    const headers = new Headers({
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": date,
      authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaderNames}, Signature=${signature}`,
    });
    if (contentType) headers.set("content-type", contentType);
    return fetch(url, { method, headers, body: body ? arrayBuffer(body) : undefined });
  }
}
