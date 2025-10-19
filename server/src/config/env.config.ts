export const GRPC_PORT = process.env.GRPC_PORT || "50051";
export const GRPC_ADDR = process.env.GRPC_ADDR || "localhost:50051";
export const CLIENT_SHARED_SECRET =
  process.env.CLIENT_SHARED_SECRET || "dev-client-secret";
export const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || "./downloads";
export const GRPC_SSL_CERT_PATH =
  process.env.GRPC_SSL_CERT_PATH || "certs/server.crt";
export const GRPC_SSL_KEY_PATH =
  process.env.GRPC_SSL_KEY_PATH || "certs/server.key";
export const GRPC_SSL_CA_PATH = process.env.GRPC_SSL_CA_PATH || "certs/ca.crt";
