export const GRPC_ADDR = process.env.GRPC_ADDR || "localhost:50051";
export const CLIENT_ID = process.env.CLIENT_ID || "client-001";
export const SECRET = process.env.CLIENT_SHARED_SECRET || "dev-client-secret";
export const DEFAULT_FILE_PATH = process.env.FILE_PATH || "./data/sample.bin";
export const CHUNK_BYTES = parseInt(process.env.CHUNK_BYTES || "1048576", 10); // 1MB default
export const GRPC_SSL_CA_PATH = process.env.GRPC_SSL_CA_PATH || "certs/ca.crt";
