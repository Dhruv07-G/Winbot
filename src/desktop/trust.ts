import * as tls from 'node:tls';

/** Include Windows-trusted roots while keeping the existing Node roots. */
export function trustWindowsCertificates(): void {
  if (process.platform !== "win32") return;
  const certificates = tls as typeof tls & {
    getCACertificates?: (type: "default" | "system") => string[];
    setDefaultCACertificates?: (certs: string[]) => void;
  };
  if (!certificates.getCACertificates || !certificates.setDefaultCACertificates) return;
  certificates.setDefaultCACertificates([...new Set([
    ...certificates.getCACertificates("default"),
    ...certificates.getCACertificates("system"),
  ])]);
}
