import fs from "fs";
import path from "path";
import * as grpc from "@grpc/grpc-js";
import {
  GRPC_SSL_CA_PATH,
  GRPC_SSL_CERT_PATH,
  GRPC_SSL_KEY_PATH,
} from "../../config/env.config";

/**
 * Dynamically create gRPC credentials based on environment.
 *
 * - DEV/STAGING: insecure (no TLS)
 * - PROD: secure with certs
 *
 * Required env vars in prod:
 *   GRPC_SSL_CERT_PATH - path to server.crt
 *   GRPC_SSL_KEY_PATH  - path to server.key
 *   GRPC_SSL_CA_PATH   - path to ca.crt (optional for client)
 */
export const createServerCredentials = (): grpc.ServerCredentials => {
  const env = process.env.NODE_ENV || "development";

  if (env === "production") {
    const certPath = GRPC_SSL_CERT_PATH;
    const keyPath = GRPC_SSL_KEY_PATH;

    const cert = fs.readFileSync(path.resolve(certPath));
    const key = fs.readFileSync(path.resolve(keyPath));

    console.log(`GRPC: Using secure server credentials`);
    return grpc.ServerCredentials.createSsl(null, [
      { cert_chain: cert, private_key: key },
    ]);
  }

  console.log(`GRPC: Using insecure server credentials`);
  return grpc.ServerCredentials.createInsecure();
};

/**
 * Dynamically create client credentials.
 *
 * Required in prod:
 *   GRPC_SSL_CA_PATH - path to ca.crt (trusted CA)
 */
export const createClientCredentials = (): grpc.ChannelCredentials => {
  const env = process.env.NODE_ENV || "development";

  if (env === "production") {
    const caPath = GRPC_SSL_CA_PATH;
    const ca = fs.readFileSync(path.resolve(caPath));
    console.log(`GRPC: Using secure client credentials`);
    return grpc.credentials.createSsl(ca);
  }

  console.log(`GRPC: Using insecure client credentials`);
  return grpc.credentials.createInsecure();
};
