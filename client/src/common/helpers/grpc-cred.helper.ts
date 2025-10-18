import fs from "fs";
import path from "path";
import * as grpc from "@grpc/grpc-js";
import { GRPC_SSL_CA_PATH } from "../../config/env.config";

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
