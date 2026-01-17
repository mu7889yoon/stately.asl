import type { ServicePlugin } from "../types.js";
import { defaultRetry } from "./interface.js";

/**
 * S3 plugin for AWS SDK v3 operations
 */
export const s3Plugin: ServicePlugin = {
  serviceName: "s3",
  clientNames: ["S3Client"],
  operations: {
    GetObjectCommand: {
      aslOperation: "getObject",
      retry: defaultRetry,
    },
    PutObjectCommand: {
      aslOperation: "putObject",
      retry: defaultRetry,
    },
    DeleteObjectCommand: {
      aslOperation: "deleteObject",
      retry: defaultRetry,
    },
    CopyObjectCommand: {
      aslOperation: "copyObject",
      retry: defaultRetry,
    },
    HeadObjectCommand: {
      aslOperation: "headObject",
      retry: defaultRetry,
    },
    ListObjectsV2Command: {
      aslOperation: "listObjectsV2",
      retry: defaultRetry,
    },
    DeleteObjectsCommand: {
      aslOperation: "deleteObjects",
      retry: defaultRetry,
    },
    CreateBucketCommand: {
      aslOperation: "createBucket",
      retry: defaultRetry,
    },
    DeleteBucketCommand: {
      aslOperation: "deleteBucket",
      retry: defaultRetry,
    },
    ListBucketsCommand: {
      aslOperation: "listBuckets",
      retry: defaultRetry,
    },
  },
};
