export type Scheme = "http" | "https";

export interface ConnectionConfig {
  scheme: Scheme;
  host: string;
  port: string;
  path: string;
  username: string;
  insecure: boolean;
}

export interface DavItem {
  href: string;
  path: string;
  name: string;
  isDir: boolean;
  size: number | null;
  modified: string | null;
}

export interface ListingResult {
  path: string;
  items: DavItem[];
}

export interface PlaylistEntry {
  url: string;
  title: string;
}

export interface PlayRequest {
  items: PlaylistEntry[];
  mode: "play" | "append";
  connection?: ConnectionConfig;
  password?: string;
}
