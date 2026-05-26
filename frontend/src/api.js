/**
 * Central API base URL.
 *
 * - Production (deployed):  VITE_API_URL is set to the CloudFront domain at
 *   build time by deploy.sh, e.g. https://d1234abcd.cloudfront.net
 *   All /api/* calls go through CloudFront → API Gateway → Lambda.
 *
 * - Local dev:  VITE_API_URL is not set, falls back to empty string so that
 *   Vite's dev-server proxy forwards /api/* to http://localhost:8000.
 */
export const API = import.meta.env.VITE_API_URL ?? ""
